// Sign in with CoinPay (CoinPay is the fleet's master account).
//
// Confidential OIDC client through @profullstack/coinpay-onboard: authorization
// code + PKCE S256 + state + nonce, exact redirect
// https://sh1pt.com/api/v1/coinpay/oauth/callback, scopes "openid profile email",
// client secret on the code exchange, id_token iss/aud/exp/nonce checked and
// userinfo's sub matched.
//
// STANDING security rule: a CoinPay login binds to the CoinPay `sub` in
// public.coinpay_identities. It never signs in to an existing account because
// the CoinPay email matches (CoinPay never verifies emails), never stores that
// email as the account's auth email, and never grants anything from it.
// Connecting CoinPay to an existing account happens only from the dashboard
// while signed in to it. A first CoinPay login with no link creates a NEW
// account whose auth email is a random placeholder; the CoinPay email is kept
// as unverified contact info on the identity row.
//
// The decisions are written against a small store interface so tests run in
// memory; supabaseCoinpayStore() is the real one (service role).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const CALLBACK_PATH = '/api/v1/coinpay/oauth/callback';
export const STATE_COOKIE = 'sh1pt_cp_state';
export const STATE_COOKIE_PATH = '/api/v1/coinpay/oauth';
export const PENDING_SECONDS = 600;
/** Auth emails of accounts a CoinPay login created. Nobody receives mail here. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'coinpay-users.sh1pt.com';

// Bracket access: Next inlines `process.env.NAME` at build time, server code
// included, which would bake a missing secret in for good.
function runtimeEnv(name: string): string {
  const v = (process.env as Record<string, string | undefined>)[name];
  return typeof v === 'string' ? v.trim() : '';
}

export type CoinpayConfig = { clientId: string; clientSecret: string; siteUrl: string; redirectUri: string };

export function coinpayConfig(): CoinpayConfig | null {
  const clientId = runtimeEnv('COINPAY_OAUTH_CLIENT_ID');
  const clientSecret = runtimeEnv('COINPAY_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  const siteUrl = (runtimeEnv('NEXT_PUBLIC_SITE_URL') || 'https://sh1pt.com').replace(/\/+$/, '');
  return { clientId, clientSecret, siteUrl, redirectUri: siteUrl + CALLBACK_PATH };
}

export type OAuthMode = 'login' | 'connect';

export type Pending = { verifier: string; nonce: string; mode: OAuthMode; next: string; linkUserId: string | null };

export type CoinpayClaims = { sub: string; email: string | null; name: string | null };

export type IdentityRow = {
  user_id: string;
  coinpay_sub: string;
  coinpay_email: string | null;
  created_via: 'connect' | 'signup';
};

export interface CoinpayStore {
  savePending(id: string, pending: Pending, expiresAt: Date): Promise<void>;
  /** Delete-and-return: only the first caller with an unexpired id gets the row. */
  takePending(id: string, now: Date): Promise<Pending | null>;
  identityBySub(sub: string): Promise<IdentityRow | null>;
  identityByUser(userId: string): Promise<IdentityRow | null>;
  /** Insert; "conflict" when the sub or the user is already bound. */
  link(row: IdentityRow & { coinpay_name: string | null }): Promise<'ok' | 'conflict'>;
  unlink(userId: string): Promise<void>;
  touch(sub: string): Promise<void>;
  /** A brand-new auth user on a random placeholder email (confirmed: it is ours). */
  createUser(input: { name: string | null; contactEmail: string | null }): Promise<string>;
  deleteUser(userId: string): Promise<void>;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@' + PLACEHOLDER_EMAIL_DOMAIN);
}

export function placeholderEmail(): string {
  return `cp-${randomBytes(12).toString('hex')}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Constant-time compare of the returned state with the cookie's. */
export function stateMatches(expected: string | null | undefined, got: string | null | undefined): boolean {
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function savePending(store: CoinpayStore, state: string, pending: Pending, now = new Date()): Promise<void> {
  await store.savePending(sha256(state), pending, new Date(now.getTime() + PENDING_SECONDS * 1000));
}

export type CallbackCheck =
  | { ok: true; pending: Pending }
  | { ok: false; code: 'bad_state' | 'expired' | 'wrong_session' };

/**
 * The callback's gate, before any code is exchanged: the state must be the one
 * this browser's cookie holds, it is spent on first use, and a Connect must be
 * finished by the same signed-in user who started it.
 */
export async function takeCallback(
  store: CoinpayStore,
  input: { state: string | null; cookieState: string | null | undefined; currentUserId: string | null },
  now = new Date(),
): Promise<CallbackCheck> {
  if (!input.state || !stateMatches(input.cookieState, input.state)) return { ok: false, code: 'bad_state' };
  const pending = await store.takePending(sha256(input.state), now);
  if (!pending) return { ok: false, code: 'expired' };
  if (pending.mode === 'connect' && (!input.currentUserId || pending.linkUserId !== input.currentUserId)) {
    return { ok: false, code: 'wrong_session' };
  }
  return { ok: true, pending };
}

export type Resolution =
  | { ok: true; userId: string; action: 'login' | 'created' | 'linked' }
  | { ok: false; code: 'not_signed_in' | 'linked_elsewhere' | 'already_connected'; error: string };

/**
 * Decide which sh1pt user a verified CoinPay sub belongs to. Never looks at the
 * email: a CoinPay login whose email equals an existing user's gets a NEW
 * account (or the one already bound to its sub), never that user's.
 */
export async function resolveCoinpayUser(
  input: { mode: OAuthMode; currentUserId: string | null; claims: CoinpayClaims },
  store: CoinpayStore,
): Promise<Resolution> {
  const { claims } = input;
  const bound = await store.identityBySub(claims.sub);

  if (input.mode === 'connect') {
    if (!input.currentUserId) {
      return { ok: false, code: 'not_signed_in', error: 'Sign in to sh1pt first, then connect CoinPay from your dashboard.' };
    }
    if (bound) {
      if (bound.user_id === input.currentUserId) return { ok: true, userId: bound.user_id, action: 'linked' };
      return { ok: false, code: 'linked_elsewhere', error: 'That CoinPay account is already connected to another sh1pt account.' };
    }
    if (await store.identityByUser(input.currentUserId)) {
      return {
        ok: false,
        code: 'already_connected',
        error: 'This sh1pt account is already connected to a different CoinPay account. Disconnect it first.',
      };
    }
    const r = await store.link({
      user_id: input.currentUserId,
      coinpay_sub: claims.sub,
      coinpay_email: claims.email,
      coinpay_name: claims.name,
      created_via: 'connect',
    });
    if (r === 'conflict') {
      return { ok: false, code: 'linked_elsewhere', error: 'That CoinPay account was just connected elsewhere.' };
    }
    return { ok: true, userId: input.currentUserId, action: 'linked' };
  }

  if (bound) {
    await store.touch(claims.sub);
    return { ok: true, userId: bound.user_id, action: 'login' };
  }
  const userId = await store.createUser({ name: claims.name, contactEmail: claims.email });
  const r = await store.link({
    user_id: userId,
    coinpay_sub: claims.sub,
    coinpay_email: claims.email,
    coinpay_name: claims.name,
    created_via: 'signup',
  });
  if (r === 'conflict') {
    // Lost a race with a parallel first login for the same sub: keep theirs.
    await store.deleteUser(userId).catch(() => {});
    const again = await store.identityBySub(claims.sub);
    if (again) return { ok: true, userId: again.user_id, action: 'login' };
    throw new Error('coinpay identity conflict');
  }
  return { ok: true, userId, action: 'created' };
}

/** Disconnect is refused when CoinPay is the only way into the account. */
export async function disconnectCoinpay(
  userId: string,
  authEmail: string | null,
  store: CoinpayStore,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mine = await store.identityByUser(userId);
  if (!mine) return { ok: true };
  if (!authEmail || isPlaceholderEmail(authEmail)) {
    return { ok: false, error: 'CoinPay is the only way to sign in to this account, so it cannot be disconnected.' };
  }
  await store.unlink(userId);
  return { ok: true };
}

export function supabaseCoinpayStore(sb: SupabaseClient): CoinpayStore {
  const cols = 'user_id, coinpay_sub, coinpay_email, created_via';
  return {
    async savePending(id, p, expiresAt) {
      await sb.from('coinpay_pending').delete().lt('expires_at', new Date().toISOString());
      const r = await sb.from('coinpay_pending').insert({
        id,
        verifier: p.verifier,
        nonce: p.nonce,
        mode: p.mode,
        next_path: p.next,
        link_user_id: p.linkUserId,
        expires_at: expiresAt.toISOString(),
      });
      if (r.error) throw new Error(r.error.message);
    },
    async takePending(id, now) {
      const r = await sb
        .from('coinpay_pending')
        .delete()
        .eq('id', id)
        .gt('expires_at', now.toISOString())
        .select('verifier, nonce, mode, next_path, link_user_id');
      if (r.error) throw new Error(r.error.message);
      const row = (r.data ?? [])[0] as
        | { verifier: string; nonce: string; mode: OAuthMode; next_path: string; link_user_id: string | null }
        | undefined;
      if (!row) return null;
      return { verifier: row.verifier, nonce: row.nonce, mode: row.mode, next: row.next_path, linkUserId: row.link_user_id };
    },
    async identityBySub(sub) {
      const r = await sb.from('coinpay_identities').select(cols).eq('coinpay_sub', sub).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      return (r.data as IdentityRow | null) ?? null;
    },
    async identityByUser(userId) {
      const r = await sb.from('coinpay_identities').select(cols).eq('user_id', userId).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      return (r.data as IdentityRow | null) ?? null;
    },
    async link(row) {
      const r = await sb.from('coinpay_identities').insert({ ...row, last_login_at: new Date().toISOString() });
      if (r.error) {
        if (r.error.code === '23505') return 'conflict';
        throw new Error(r.error.message);
      }
      return 'ok';
    },
    async unlink(userId) {
      const r = await sb.from('coinpay_identities').delete().eq('user_id', userId);
      if (r.error) throw new Error(r.error.message);
    },
    async touch(sub) {
      await sb.from('coinpay_identities').update({ last_login_at: new Date().toISOString() }).eq('coinpay_sub', sub);
    },
    async createUser({ name, contactEmail }) {
      const [first, ...rest] = (name ?? '').split(/\s+/).filter(Boolean);
      const r = await sb.auth.admin.createUser({
        email: placeholderEmail(),
        email_confirm: true,
        user_metadata: {
          full_name: name ?? 'CoinPay user',
          ...(first ? { first_name: first } : {}),
          ...(rest.length ? { last_name: rest.join(' ') } : {}),
          signup_via: 'coinpay',
          // Unverified contact info from CoinPay. Never an identity.
          ...(contactEmail ? { coinpay_contact_email: contactEmail } : {}),
        },
        app_metadata: { signup_via: 'coinpay' },
      });
      if (r.error || !r.data.user) throw new Error(r.error?.message ?? 'createUser failed');
      return r.data.user.id;
    },
    async deleteUser(userId) {
      await sb.auth.admin.deleteUser(userId);
    },
  };
}

/**
 * A magic-link token hash for the user's OWN auth email, minted server side
 * (nothing is emailed). The caller redeems it with verifyOtp on the cookie
 * client, which sets the normal Supabase session cookies. Refuses an account
 * whose email is not confirmed: redeeming the link would confirm it.
 */
export async function mintMagicLinkHash(
  sb: SupabaseClient,
  userId: string,
): Promise<{ ok: true; tokenHash: string } | { ok: false; error: string }> {
  const u = await sb.auth.admin.getUserById(userId);
  const user = u.data?.user;
  if (u.error || !user?.email) return { ok: false, error: 'account not found' };
  if (!user.email_confirmed_at) return { ok: false, error: "Confirm this account's email before signing in with CoinPay." };
  const link = await sb.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return { ok: false, error: 'could not start a session' };
  return { ok: true, tokenHash };
}
