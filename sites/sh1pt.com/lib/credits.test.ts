import { describe, expect, it, beforeEach } from 'vitest';
import { memoryStore as creditMemory } from '@profullstack/redeem-credits';
import { memoryStore as affiliateMemory } from '@profullstack/affiliates';
import {
  buildCreditDeps,
  acceptInvite,
  createInvite,
  mintCreditCode,
  onSignedIn,
  planFor,
  redeemCreditCode,
  revokeInvite,
  settleInviteBonus,
  syncProGrants,
  type AccountInfo,
  type BonusRow,
  type CreditDb,
  type CreditDeps,
} from './credits';

const DAY = 86_400_000;
let now = Date.parse('2026-10-26T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

// In-memory stand-in for Supabase: auth users, profiles.pro_until, the
// idempotent pro_day_grants keyed on (user, source), and invite_bonuses.
function fakeDb() {
  const accounts = new Map<string, AccountInfo>();
  const profiles = new Map<string, { referredBy: string | null; prepaid: boolean; proUntil: string | null }>();
  const grants = new Map<string, { days: number }>();
  const bonuses: (BonusRow & { created_at: number })[] = [];
  let failGrants = false;
  const db: CreditDb = {
    async account(id) {
      return accounts.get(id) ?? null;
    },
    async profile(id) {
      return profiles.get(id) ?? null;
    },
    async grantProDays(id, days, source) {
      if (failGrants) throw new Error('db down');
      const p = profiles.get(id);
      if (!p) throw new Error('no profile');
      const key = `${id}|${source}`;
      if (grants.has(key)) return p.proUntil;
      grants.set(key, { days });
      const base = Math.max(now, p.proUntil ? Date.parse(p.proUntil) : now);
      p.proUntil = iso(base + days * DAY);
      return p.proUntil;
    },
    async appliedSources(id) {
      return new Set([...grants.keys()].filter((k) => k.startsWith(`${id}|`)).map((k) => k.slice(id.length + 1)));
    },
    async bonusRows(ids) {
      return bonuses.filter((b) => ids.includes(b.invite_id));
    },
    async claimBonus(row) {
      if (bonuses.some((b) => b.invite_id === row.invite_id && b.side === row.side)) return false;
      if (row.side === 'invitee' && bonuses.some((b) => b.side === 'invitee' && b.user_id === row.user_id)) {
        throw new Error('duplicate key invite_bonuses_one_per_invitee');
      }
      bonuses.push({ ...row, created_at: now });
      return true;
    },
    async unclaimBonus(inviteId, side) {
      const i = bonuses.findIndex((b) => b.invite_id === inviteId && b.side === side);
      if (i >= 0) bonuses.splice(i, 1);
    },
    async inviterBonusesSince(id, since) {
      return bonuses.filter((b) => b.user_id === id && b.side === 'inviter' && b.outcome === 'granted' && b.created_at >= Date.parse(since)).length;
    },
  };
  return {
    db,
    accounts,
    profiles,
    grants,
    bonuses,
    setFail: (v: boolean) => {
      failGrants = v;
    },
    addUser(id: string, email: string, ageDays: number, opts: { confirmed?: boolean; referredBy?: string | null } = {}) {
      accounts.set(id, { email, confirmed: opts.confirmed ?? true, createdAt: iso(now - ageDays * DAY) });
      profiles.set(id, { referredBy: opts.referredBy ?? null, prepaid: false, proUntil: null });
    },
  };
}

let f: ReturnType<typeof fakeDb>;
let d: CreditDeps;

beforeEach(() => {
  now = Date.parse('2026-10-26T12:00:00Z');
  f = fakeDb();
  d = buildCreditDeps({ db: f.db, creditStore: creditMemory(), affiliateStore: affiliateMemory() }, () => now);
  f.addUser('old', 'old@example.com', 30);
  f.addUser('new', 'new@example.com', 1);
});

describe('credit codes', () => {
  it('a code adds Pro days through grant_pro_days, once per user', async () => {
    const { code } = await mintCreditCode({ days: 30, maxRedemptions: 2 }, d);
    const r = await redeemCreditCode('old', code.toLowerCase(), d);
    expect(r).toMatchObject({ ok: true, days: 30, plan: { pro: true, daysLeft: 30 } });
    expect(await redeemCreditCode('old', code, d)).toMatchObject({ ok: false, reason: 'already_redeemed' });
    expect(await redeemCreditCode('new', code, d)).toMatchObject({ ok: true });
    const third = 'x';
    f.addUser(third, 'x@example.com', 1);
    expect(await redeemCreditCode(third, code, d)).toMatchObject({ ok: false, reason: 'used_up' });
  });

  it('extends a running Pro period instead of resetting it', async () => {
    const a = await mintCreditCode({ days: 10 }, d);
    const b = await mintCreditCode({ days: 5 }, d);
    await redeemCreditCode('old', a.code, d);
    now += 2 * DAY;
    await redeemCreditCode('old', b.code, d);
    expect((await planFor('old', d)).daysLeft).toBe(13);
  });

  it('refuses bad codes and validates mint input', async () => {
    expect(await redeemCreditCode('old', 'CR-0000-0000-0000-0000', d)).toMatchObject({ ok: false, reason: 'invalid' });
    await expect(mintCreditCode({ days: 0 }, d)).rejects.toThrow(/days/);
    await expect(mintCreditCode({ days: 5, maxRedemptions: 0 }, d)).rejects.toThrow(/maxRedemptions/);
    const exp = await mintCreditCode({ days: 5, expiresInDays: 1 }, d);
    now += 2 * DAY;
    expect(await redeemCreditCode('old', exp.code, d)).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('heals a ledger grant whose mirror failed, without double-adding', async () => {
    const { code } = await mintCreditCode({ days: 7 }, d);
    f.setFail(true);
    await expect(redeemCreditCode('old', code, d)).rejects.toThrow(/db down/);
    f.setFail(false);
    expect(f.profiles.get('old')?.proUntil).toBeNull();
    expect(await syncProGrants('old', d)).toBe(1);
    expect(await syncProGrants('old', d)).toBe(0);
    expect((await planFor('old', d)).daysLeft).toBe(7);
  });
});

describe('invites', () => {
  it('needs a week-old account to create one, and a quota of 3', async () => {
    await expect(createInvite('new', '', d)).rejects.toMatchObject({ reason: 'too_new' });
    for (let i = 0; i < 3; i++) await createInvite('old', `n${i}`, d);
    await expect(createInvite('old', '', d)).rejects.toMatchObject({ reason: 'no_invites_left' });
  });

  it('pays 7 Pro days to both sides once, for a confirmed new account', async () => {
    const inv = await createInvite('old', 'for new', d);
    const r = await acceptInvite('new', inv.code, d);
    expect(r).toMatchObject({ ok: true, bonus: 'granted' });
    expect((await planFor('new', d)).daysLeft).toBe(7);
    expect((await planFor('old', d)).daysLeft).toBe(7);
    expect(await settleInviteBonus('new', d)).toMatchObject({ status: 'already' });
    expect((await planFor('old', d)).daysLeft).toBe(7);
  });

  it('one accepted invite per account', async () => {
    f.addUser('old2', 'old2@example.com', 30);
    const a = await createInvite('old', '', d);
    const b = await createInvite('old2', '', d);
    expect(await acceptInvite('new', a.code, d)).toMatchObject({ ok: true });
    expect(await acceptInvite('new', b.code, d)).toMatchObject({ ok: false, reason: 'already_invited' });
    expect((await planFor('old2', d)).daysLeft).toBe(0);
  });

  it('waits for email confirmation, then pays on the next sign-in', async () => {
    f.addUser('unconf', 'unconf@example.com', 0, { confirmed: false });
    const inv = await createInvite('old', '', d);
    expect(await acceptInvite('unconf', inv.code, d)).toMatchObject({ ok: true, bonus: 'pending' });
    f.accounts.get('unconf')!.confirmed = true;
    expect(await onSignedIn('unconf', null, d)).toMatchObject({ settled: { status: 'granted' } });
    expect((await planFor('unconf', d)).daysLeft).toBe(7);
  });

  it('denies the bonus for the same mailbox and throwaway inboxes, but the invite is used', async () => {
    f.addUser('alias', 'old+2@example.com', 0);
    const inv = await createInvite('old', '', d);
    expect(await acceptInvite('alias', inv.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
    f.addUser('temp', 'x@mailinator.com', 0);
    const inv2 = await createInvite('old', '', d);
    expect(await acceptInvite('temp', inv2.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
    expect((await planFor('old', d)).daysLeft).toBe(0);
  });

  it('refuses old accounts and accounts that joined on a referral link', async () => {
    f.addUser('reffed', 'reffed@example.com', 1, { referredBy: 'abcd1234' });
    const inv = await createInvite('old', '', d);
    expect(await acceptInvite('reffed', inv.code, d)).toMatchObject({ ok: false, reason: 'already_referred' });
    f.addUser('vet', 'vet@example.com', 20);
    expect(await acceptInvite('vet', inv.code, d)).toMatchObject({ ok: false, reason: 'not_new' });
    expect(await acceptInvite('old', inv.code, d)).toMatchObject({ ok: false });
    expect(await acceptInvite('new', inv.code, d)).toMatchObject({ ok: true });
  });

  it('caps inviter bonuses per 30 days', async () => {
    for (let i = 0; i < 10; i++) {
      f.bonuses.push({ invite_id: `old-${i}`, side: 'inviter', user_id: 'old', outcome: 'granted', reason: null, days: 7, created_at: now });
    }
    const inv = await createInvite('old', '', d);
    expect(await acceptInvite('new', inv.code, d)).toMatchObject({ ok: true, bonus: 'denied' });
  });

  it('withdraws only unused invites of your own', async () => {
    const inv = await createInvite('old', '', d);
    await expect(revokeInvite('new', inv.id, d)).rejects.toMatchObject({ reason: 'not_found' });
    await revokeInvite('old', inv.id, d);
    expect(await acceptInvite('new', inv.code, d)).toMatchObject({ ok: false, reason: 'revoked' });
  });

  it('never throws from onSignedIn', async () => {
    expect(await onSignedIn('nobody', 'INV-0000-0000-0000', d)).toMatchObject({ invite: { ok: false } });
  });
});
