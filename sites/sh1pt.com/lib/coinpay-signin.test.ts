import { describe, expect, it } from 'vitest';
import {
  disconnectCoinpay,
  isPlaceholderEmail,
  placeholderEmail,
  resolveCoinpayUser,
  savePending,
  stateMatches,
  takeCallback,
  type CoinpayStore,
  type IdentityRow,
  type Pending,
} from './coinpay-signin';
import { bonusVerdict } from './invite-rules';

// Sign in with CoinPay. The STANDING rule these hold: an account is bound to
// the CoinPay sub, a matching CoinPay email never takes over an account,
// connecting needs the signed-in user who asked, and a forged or replayed
// state is refused before any code is exchanged.

function memoryStore(users: Record<string, string> = {}) {
  const identities: (IdentityRow & { coinpay_name: string | null })[] = [];
  const pending = new Map<string, { p: Pending; expiresAt: Date }>();
  const created: string[] = [];
  let n = 0;
  const store: CoinpayStore = {
    async savePending(id, p, expiresAt) {
      pending.set(id, { p, expiresAt });
    },
    async takePending(id, now) {
      const row = pending.get(id);
      pending.delete(id);
      return row && row.expiresAt > now ? row.p : null;
    },
    async identityBySub(sub) {
      return identities.find((i) => i.coinpay_sub === sub) ?? null;
    },
    async identityByUser(userId) {
      return identities.find((i) => i.user_id === userId) ?? null;
    },
    async link(row) {
      if (identities.some((i) => i.coinpay_sub === row.coinpay_sub || i.user_id === row.user_id)) return 'conflict';
      identities.push(row);
      return 'ok';
    },
    async unlink(userId) {
      const i = identities.findIndex((r) => r.user_id === userId);
      if (i >= 0) identities.splice(i, 1);
    },
    async touch() {},
    async createUser() {
      const id = `new-${++n}`;
      users[id] = placeholderEmail();
      created.push(id);
      return id;
    },
    async deleteUser(userId) {
      delete users[userId];
    },
  };
  return { store, identities, created, users };
}

const claims = (sub: string, email: string | null = null) => ({ sub, email, name: null });
const pendingFor = (over: Partial<Pending> = {}): Pending => ({
  verifier: 'v',
  nonce: 'n',
  mode: 'login',
  next: '/dashboard',
  linkUserId: null,
  ...over,
});

describe('resolveCoinpayUser', () => {
  it('gives a CoinPay email matching an existing account a new account, never that one', async () => {
    const m = memoryStore({ victim: 'victim@example.com' });
    const r = await resolveCoinpayUser({ mode: 'login', currentUserId: null, claims: claims('s1', 'victim@example.com') }, m.store);
    expect(r).toEqual({ ok: true, userId: 'new-1', action: 'created' });
    expect(isPlaceholderEmail(m.users['new-1'])).toBe(true);
    expect(m.identities[0]).toMatchObject({ user_id: 'new-1', coinpay_email: 'victim@example.com', created_via: 'signup' });
  });

  it('signs the same sub back into the same account', async () => {
    const m = memoryStore();
    const first = await resolveCoinpayUser({ mode: 'login', currentUserId: null, claims: claims('s1') }, m.store);
    const again = await resolveCoinpayUser({ mode: 'login', currentUserId: null, claims: claims('s1', 'x@y.z') }, m.store);
    expect(first.ok && again.ok && again.userId === first.userId && again.action).toBe('login');
  });

  it('connects only for a signed-in user, and a sub belongs to one account', async () => {
    const m = memoryStore({ alice: 'alice@example.com', bob: 'bob@example.com' });
    expect(await resolveCoinpayUser({ mode: 'connect', currentUserId: null, claims: claims('s1') }, m.store)).toMatchObject({
      ok: false,
      code: 'not_signed_in',
    });
    expect(await resolveCoinpayUser({ mode: 'connect', currentUserId: 'alice', claims: claims('s1') }, m.store)).toEqual({
      ok: true,
      userId: 'alice',
      action: 'linked',
    });
    expect(await resolveCoinpayUser({ mode: 'connect', currentUserId: 'bob', claims: claims('s1') }, m.store)).toMatchObject({
      ok: false,
      code: 'linked_elsewhere',
    });
    expect(await resolveCoinpayUser({ mode: 'connect', currentUserId: 'alice', claims: claims('s2') }, m.store)).toMatchObject({
      ok: false,
      code: 'already_connected',
    });
    expect(m.created).toEqual([]);
  });
});

describe('takeCallback', () => {
  it('needs the state this browser started, once', async () => {
    const m = memoryStore();
    await savePending(m.store, 'state-1', pendingFor());
    expect(await takeCallback(m.store, { state: 'state-1', cookieState: 'other', currentUserId: null })).toEqual({
      ok: false,
      code: 'bad_state',
    });
    expect(await takeCallback(m.store, { state: 'state-1', cookieState: undefined, currentUserId: null })).toEqual({
      ok: false,
      code: 'bad_state',
    });
    expect(await takeCallback(m.store, { state: 'forged', cookieState: 'forged', currentUserId: null })).toEqual({
      ok: false,
      code: 'expired',
    });
    expect(await takeCallback(m.store, { state: 'state-1', cookieState: 'state-1', currentUserId: null })).toEqual({
      ok: true,
      pending: pendingFor(),
    });
    expect(await takeCallback(m.store, { state: 'state-1', cookieState: 'state-1', currentUserId: null })).toEqual({
      ok: false,
      code: 'expired',
    });
  });

  it('refuses an expired request', async () => {
    const m = memoryStore();
    await savePending(m.store, 'old', pendingFor(), new Date(Date.now() - 3_600_000));
    expect(await takeCallback(m.store, { state: 'old', cookieState: 'old', currentUserId: null })).toEqual({
      ok: false,
      code: 'expired',
    });
  });

  it('a connect must be finished by the user who started it', async () => {
    const m = memoryStore();
    await savePending(m.store, 'c1', pendingFor({ mode: 'connect', linkUserId: 'alice' }));
    expect(await takeCallback(m.store, { state: 'c1', cookieState: 'c1', currentUserId: 'mallory' })).toEqual({
      ok: false,
      code: 'wrong_session',
    });
    await savePending(m.store, 'c2', pendingFor({ mode: 'connect', linkUserId: 'alice' }));
    expect((await takeCallback(m.store, { state: 'c2', cookieState: 'c2', currentUserId: 'alice' })).ok).toBe(true);
  });

  it('compares state without a length or prefix leak', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abcd')).toBe(false);
    expect(stateMatches(null, 'abc')).toBe(false);
  });
});

describe('disconnectCoinpay', () => {
  it('is refused when CoinPay is the only way in', async () => {
    const m = memoryStore();
    const r = await resolveCoinpayUser({ mode: 'login', currentUserId: null, claims: claims('s1') }, m.store);
    if (!r.ok) throw new Error('expected an account');
    expect((await disconnectCoinpay(r.userId, m.users[r.userId], m.store)).ok).toBe(false);
    expect(m.identities).toHaveLength(1);
  });

  it('works for an account with its own email', async () => {
    const m = memoryStore({ alice: 'alice@example.com' });
    await resolveCoinpayUser({ mode: 'connect', currentUserId: 'alice', claims: claims('s1') }, m.store);
    expect(await disconnectCoinpay('alice', 'alice@example.com', m.store)).toEqual({ ok: true });
    expect(m.identities).toHaveLength(0);
  });
});

describe('invite bonuses', () => {
  it('are never paid to an account a CoinPay login made', () => {
    expect(
      bonusVerdict({
        inviteeEmail: placeholderEmail(),
        inviteeConfirmed: true,
        inviterEmail: 'inviter@example.com',
        inviterBonusesLast30Days: 0,
      }),
    ).toEqual({ ok: false, final: true, reason: 'no_proven_email' });
  });
});
