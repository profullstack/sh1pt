/**
 * Credit codes and scarce invites (server only).
 *
 * - A credit code (@profullstack/redeem-credits, `CR-XXXX-XXXX-XXXX-XXXX`)
 *   grants days of sh1pt Pro (unit `pro_days`). An admin mints it on /admin,
 *   POST /api/v1/admin/credit-codes or scripts/mint-credit-code.mjs; the
 *   holder redeems it on /dashboard, POST /api/v1/credits/redeem or
 *   `sh1pt redeem <code>`.
 * - An invite (@profullstack/affiliates, `INV-XXXX-XXXX-XXXX`) is scarce:
 *   INVITE_QUOTA per account, from INVITER_MIN_AGE_DAYS old. When a NEW
 *   account joins on one, both people get INVITE_BONUS_DAYS of Pro once the
 *   new account has confirmed its email and passes the abuse checks
 *   (lib/invite-rules.ts). One accepted invite per account.
 *
 * There is one plan: every grant goes through grant_pro_days, which extends
 * profiles.pro_until idempotently on (user, source). The credit_ledger is
 * the audit trail; syncProGrants() re-applies any ledger grant whose mirror
 * did not land (a crash between the two writes).
 *
 * sh1pt's open referral program (/r/<code>, profiles.referral_code, the
 * referrals table, $50 per paid signup) is untouched and stays the
 * "affiliate link". An account that joined through it cannot also accept an
 * invite, and an invite at signup takes the place of the referral cookie.
 *
 * Clients are built lazily and env is read with a non-literal key, so Next
 * never inlines a missing secret at build time.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Credits, supabaseStore as creditStore, type Grant } from '@profullstack/redeem-credits';
import { Affiliates, supabaseStore as affiliateStore } from '@profullstack/affiliates';
import {
  INVITE_BONUS_DAYS,
  INVITE_QUOTA,
  INVITE_TTL_DAYS,
  PRO_DAYS_UNIT,
  bonusVerdict,
  canAcceptInvite,
  canSendInvites,
  invitesUnlockAt,
} from './invite-rules';
import { planStatus, type PlanStatus } from './plan';

const DAY_MS = 24 * 60 * 60 * 1000;
const env = (name: string) => process.env[name] ?? '';

// ── Data access (one seam, so tests can fake it) ────────────────────────

export interface AccountInfo {
  email: string | null;
  confirmed: boolean;
  createdAt: string | null;
}

export interface ProfileInfo {
  referredBy: string | null;
  prepaid: boolean;
  proUntil: string | null;
}

export interface BonusRow {
  invite_id: string;
  side: 'inviter' | 'invitee';
  user_id: string;
  outcome: 'granted' | 'denied';
  reason: string | null;
  days: number;
}

export interface CreditDb {
  account(userId: string): Promise<AccountInfo | null>;
  profile(userId: string): Promise<ProfileInfo | null>;
  grantProDays(userId: string, days: number, source: string): Promise<string | null>;
  appliedSources(userId: string): Promise<Set<string>>;
  bonusRows(inviteIds: string[]): Promise<BonusRow[]>;
  /** Insert unless (invite_id, side) exists; true when this call inserted it. */
  claimBonus(row: BonusRow): Promise<boolean>;
  unclaimBonus(inviteId: string, side: BonusRow['side']): Promise<void>;
  inviterBonusesSince(inviterId: string, sinceIso: string): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export function supabaseCreditDb(db: Db): CreditDb {
  return {
    async account(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error || !data.user) return null;
      const u = data.user;
      return { email: u.email ?? null, confirmed: Boolean(u.email_confirmed_at), createdAt: u.created_at ?? null };
    },
    async profile(userId) {
      const { data } = await db
        .from('profiles')
        .select('referred_by, prepaid, pro_until')
        .eq('user_id', userId)
        .maybeSingle<{ referred_by: string | null; prepaid: boolean; pro_until: string | null }>();
      if (!data) return null;
      return { referredBy: data.referred_by, prepaid: Boolean(data.prepaid), proUntil: data.pro_until };
    },
    async grantProDays(userId, days, source) {
      const { data, error } = await db.rpc('grant_pro_days', { p_user_id: userId, p_days: days, p_source: source });
      if (error) throw new Error(`grant_pro_days: ${error.message}`);
      return (data as string | null) ?? null;
    },
    async appliedSources(userId) {
      const { data, error } = await db.from('pro_day_grants').select('source').eq('user_id', userId);
      if (error) throw new Error(`pro_day_grants: ${error.message}`);
      return new Set((data ?? []).map((r: { source: string }) => r.source));
    },
    async bonusRows(inviteIds) {
      if (!inviteIds.length) return [];
      const { data } = await db
        .from('invite_bonuses')
        .select('invite_id, side, user_id, outcome, reason, days')
        .in('invite_id', inviteIds);
      return (data ?? []) as BonusRow[];
    },
    async claimBonus(row) {
      const { data, error } = await db
        .from('invite_bonuses')
        .upsert(row, { onConflict: 'invite_id,side', ignoreDuplicates: true })
        .select('invite_id');
      if (error) throw new Error(`invite_bonuses: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async unclaimBonus(inviteId, side) {
      await db.from('invite_bonuses').delete().eq('invite_id', inviteId).eq('side', side);
    },
    async inviterBonusesSince(inviterId, sinceIso) {
      const { count } = await db
        .from('invite_bonuses')
        .select('invite_id', { count: 'exact', head: true })
        .eq('user_id', inviterId)
        .eq('side', 'inviter')
        .eq('outcome', 'granted')
        .gte('created_at', sinceIso);
      return count ?? 0;
    },
  };
}

// ── Services ─────────────────────────────────────────────────────────────

export interface CreditDeps {
  db: CreditDb;
  credits: Credits;
  affiliates: Affiliates;
  now: () => number;
}

/** Mirror one committed ledger grant into profiles.pro_until. */
export async function applyGrant(db: CreditDb, userId: string, grant: Grant, source: string) {
  if (grant.unit !== PRO_DAYS_UNIT) {
    console.error('[credits] grant with an unknown unit ignored', { userId, unit: grant.unit, source });
    return;
  }
  await db.grantProDays(userId, Math.round(grant.amount), source);
}

export function buildCreditDeps(
  parts: { db: CreditDb; creditStore: ConstructorParameters<typeof Credits>[0]; affiliateStore: ConstructorParameters<typeof Affiliates>[0] },
  now: () => number = Date.now,
): CreditDeps {
  const credits = new Credits(parts.creditStore, {
    now,
    onGrant: (userId, grant, source) => applyGrant(parts.db, userId, grant, source),
  });
  const affiliates = new Affiliates(parts.affiliateStore, {
    now,
    defaultQuota: INVITE_QUOTA,
    inviteTtlMs: INVITE_TTL_DAYS * DAY_MS,
  });
  return { db: parts.db, credits, affiliates, now };
}

let deps: CreditDeps | undefined;
export function getCreditDeps(): CreditDeps {
  if (deps) return deps;
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('credits: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  deps = buildCreditDeps({
    db: supabaseCreditDb(client),
    creditStore: creditStore(client as never),
    affiliateStore: affiliateStore(client as never),
  });
  return deps;
}

/** Test hook. */
export function setCreditDepsForTest(next: CreditDeps | undefined): void {
  deps = next;
}

/**
 * Re-apply any pro_days ledger grant that never reached profiles.pro_until
 * (grant_pro_days is idempotent per source). Cheap; run on read.
 */
export async function syncProGrants(userId: string, d: CreditDeps = getCreditDeps()): Promise<number> {
  const history = await d.credits.history(userId, PRO_DAYS_UNIT);
  const grants = history.filter((h) => h.kind === 'grant');
  if (!grants.length) return 0;
  const applied = await d.db.appliedSources(userId);
  let healed = 0;
  for (const g of grants) {
    if (applied.has(g.source)) continue;
    await d.db.grantProDays(userId, Math.round(g.amount), g.source);
    healed++;
  }
  if (healed) console.warn('[credits] re-applied pro_days grants', { userId, healed });
  return healed;
}

export async function planFor(userId: string, d: CreditDeps = getCreditDeps()): Promise<PlanStatus> {
  try {
    await syncProGrants(userId, d);
  } catch (err) {
    console.error('[credits] sync failed', err);
  }
  const p = await d.db.profile(userId);
  return planStatus({ prepaid: p?.prepaid ?? false, pro_until: p?.proUntil ?? null }, d.now());
}

// ── Credit codes ─────────────────────────────────────────────────────────

export type RedeemFailure = 'invalid' | 'expired' | 'used_up' | 'already_redeemed' | 'revoked';

export const REDEEM_MESSAGES: Record<RedeemFailure, string> = {
  invalid: 'That code is not valid. Check it and try again.',
  expired: 'That code has expired.',
  used_up: 'That code has already been used.',
  already_redeemed: 'You have already redeemed that code.',
  revoked: 'That code is no longer valid.',
};

export async function redeemCreditCode(
  userId: string,
  code: string,
  d: CreditDeps = getCreditDeps(),
): Promise<{ ok: true; days: number; plan: PlanStatus } | { ok: false; reason: RedeemFailure; message: string }> {
  const r = await d.credits.redeem(code, userId);
  if (!r.ok) return { ok: false, reason: r.reason, message: REDEEM_MESSAGES[r.reason] };
  return { ok: true, days: r.grant.amount, plan: await planFor(userId, d) };
}

export interface MintInput {
  days: number;
  label?: string;
  maxRedemptions?: number;
  expiresInDays?: number | null;
  createdBy?: string;
}

export async function mintCreditCode(o: MintInput, d: CreditDeps = getCreditDeps()) {
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 3660) {
    throw new TypeError('days must be a whole number from 1 to 3660');
  }
  const max = o.maxRedemptions ?? 1;
  if (!Number.isInteger(max) || max < 1 || max > 10_000) {
    throw new TypeError('maxRedemptions must be a whole number from 1 to 10000');
  }
  const exp = o.expiresInDays ?? null;
  if (exp !== null && (!Number.isInteger(exp) || exp < 1 || exp > 3660)) {
    throw new TypeError('expiresInDays must be a whole number from 1 to 3660');
  }
  const label = o.label?.trim() ? o.label.trim().slice(0, 200) : `${o.days} days of sh1pt Pro`;
  return d.credits.mint({
    grant: { unit: PRO_DAYS_UNIT, amount: o.days },
    label,
    maxRedemptions: max,
    expiresAt: exp === null ? null : d.now() + exp * DAY_MS,
    ...(o.createdBy ? { createdBy: o.createdBy } : {}),
  });
}

// ── Invites ──────────────────────────────────────────────────────────────

export class InviteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string,
  ) {
    super(message);
  }
}

export interface InviteView {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  note: string;
  status: 'open' | 'used' | 'expired' | 'revoked';
  usedAt: number | null;
  bonus?: 'granted' | 'denied' | 'pending';
}

export async function inviteOverview(userId: string, d: CreditDeps = getCreditDeps()) {
  const now = d.now();
  const [quota, raw, account] = await Promise.all([
    d.affiliates.quota(userId),
    d.affiliates.invites(userId),
    d.db.account(userId),
  ]);
  const bonuses = await d.db.bonusRows(raw.filter((i) => i.usedBy).map((i) => i.id));
  const invites: InviteView[] = raw.map((i) => {
    const revokedAt = (i as { revokedAt?: number | null }).revokedAt ?? null;
    const mine = bonuses.find((b) => b.invite_id === i.id && b.side === 'inviter');
    return {
      id: i.id,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      note: i.note,
      usedAt: i.usedAt,
      status: i.usedBy
        ? 'used'
        : revokedAt
          ? 'revoked'
          : i.expiresAt !== null && now >= i.expiresAt
            ? 'expired'
            : 'open',
      ...(i.usedBy ? { bonus: mine ? mine.outcome : 'pending' } : {}),
    };
  });
  const send = canSendInvites(account?.createdAt, now);
  return {
    quota,
    invites,
    canInvite: send.ok,
    unlocksAt: send.ok ? null : invitesUnlockAt(account?.createdAt),
    bonusDays: INVITE_BONUS_DAYS,
  };
}

export async function createInvite(userId: string, note = '', d: CreditDeps = getCreditDeps()) {
  const account = await d.db.account(userId);
  if (!account) throw new InviteError('Account not found.', 404, 'no_account');
  const send = canSendInvites(account.createdAt, d.now());
  if (!send.ok) throw new InviteError(send.message, 403, send.reason);
  try {
    return await d.affiliates.createInvite(userId, note.slice(0, 200));
  } catch (err) {
    if (/no invites left/i.test((err as Error).message)) {
      throw new InviteError('You have no invites left.', 409, 'no_invites_left');
    }
    throw err;
  }
}

export async function revokeInvite(userId: string, inviteId: string, d: CreditDeps = getCreditDeps()) {
  const mine = (await d.affiliates.invites(userId)).find((i) => i.id === inviteId);
  if (!mine) throw new InviteError('Invite not found.', 404, 'not_found');
  if (mine.usedBy) throw new InviteError('That invite has already been used.', 409, 'used');
  await d.affiliates.revokeInvite(inviteId);
}

export const ACCEPT_MESSAGES: Record<string, string> = {
  invalid: 'That invite code is not valid.',
  expired: 'That invite has expired.',
  used: 'That invite has already been used.',
  self: 'You cannot use your own invite.',
  revoked: 'That invite was withdrawn.',
  already_invited: 'Your account has already joined on an invite.',
  no_account: 'Account not found.',
};

export type AcceptResult =
  | { ok: true; inviteId: string; bonus: 'granted' | 'pending' | 'denied' }
  | { ok: false; reason: string; message: string };

/** Spend an invite on a new account, then settle the bonus if it qualifies now. */
export async function acceptInvite(userId: string, code: string, d: CreditDeps = getCreditDeps()): Promise<AcceptResult> {
  const fail = (reason: string, message?: string) => ({
    ok: false as const,
    reason,
    message: message ?? ACCEPT_MESSAGES[reason] ?? reason,
  });
  const [account, profile] = await Promise.all([d.db.account(userId), d.db.profile(userId)]);
  if (!account || !profile) return fail('no_account');
  const v = canAcceptInvite({ accountCreatedAt: account.createdAt, referredBy: profile.referredBy }, d.now());
  if (!v.ok) return fail(v.reason, v.message);
  if (await d.affiliates.invitedBy(userId)) return fail('already_invited');

  const r = await d.affiliates.redeemInvite(code, userId);
  if (!r.ok) return fail(r.reason);

  const settled = await settleInviteBonus(userId, d);
  return {
    ok: true,
    inviteId: r.inviteId,
    bonus:
      settled.status === 'granted' || settled.status === 'already'
        ? 'granted'
        : settled.status === 'denied'
          ? 'denied'
          : 'pending',
  };
}

async function grantSide(d: CreditDeps, inviteId: string, side: BonusRow['side'], userId: string) {
  const won = await d.db.claimBonus({
    invite_id: inviteId,
    side,
    user_id: userId,
    outcome: 'granted',
    reason: null,
    days: INVITE_BONUS_DAYS,
  });
  if (!won) return false;
  try {
    await d.credits.grant(userId, { unit: PRO_DAYS_UNIT, amount: INVITE_BONUS_DAYS }, `invite:${inviteId}:${side}`);
  } catch (err) {
    // Nothing was granted: let a later settle retry.
    await d.db.unclaimBonus(inviteId, side);
    throw err;
  }
  return true;
}

export type SettleResult =
  | { status: 'none' }
  | { status: 'pending'; reason: string }
  | { status: 'denied'; reason: string }
  | { status: 'granted' | 'already'; inviteId: string };

/**
 * Pay the invite bonus to both sides if the invited account qualifies now.
 * Idempotent: each side is decided once per invite. Safe to call often.
 */
export async function settleInviteBonus(inviteeId: string, d: CreditDeps = getCreditDeps()): Promise<SettleResult> {
  const inviterId = await d.affiliates.invitedBy(inviteeId);
  if (!inviterId) return { status: 'none' };
  const invite = (await d.affiliates.invites(inviterId)).find((i) => i.usedBy === inviteeId);
  if (!invite) return { status: 'none' };

  const existing = await d.db.bonusRows([invite.id]);
  if (existing.length >= 2) {
    const denied = existing.find((b) => b.outcome === 'denied');
    return denied ? { status: 'denied', reason: denied.reason ?? 'denied' } : { status: 'already', inviteId: invite.id };
  }

  const [invitee, inviter] = await Promise.all([d.db.account(inviteeId), d.db.account(inviterId)]);
  const verdict = bonusVerdict({
    inviteeEmail: invitee?.email ?? null,
    inviteeConfirmed: Boolean(invitee?.confirmed),
    inviterEmail: inviter?.email ?? null,
    inviterBonusesLast30Days: await d.db.inviterBonusesSince(inviterId, new Date(d.now() - 30 * DAY_MS).toISOString()),
  });
  if (!verdict.ok) {
    if (!verdict.final) return { status: 'pending', reason: verdict.reason };
    for (const [side, uid] of [
      ['invitee', inviteeId],
      ['inviter', inviterId],
    ] as const) {
      await d.db.claimBonus({ invite_id: invite.id, side, user_id: uid, outcome: 'denied', reason: verdict.reason, days: 0 });
    }
    console.warn('[invites] bonus denied', { inviteId: invite.id, inviteeId, inviterId, reason: verdict.reason });
    return { status: 'denied', reason: verdict.reason };
  }

  const gotInvitee = await grantSide(d, invite.id, 'invitee', inviteeId);
  const gotInviter = await grantSide(d, invite.id, 'inviter', inviterId);
  return { status: gotInvitee || gotInviter ? 'granted' : 'already', inviteId: invite.id };
}

/** Settle every used invite this user sent (at most the quota). */
export async function settleInvitesSentBy(inviterId: string, d: CreditDeps = getCreditDeps()) {
  for (const inv of await d.affiliates.invites(inviterId)) {
    if (!inv.usedBy) continue;
    try {
      await settleInviteBonus(inv.usedBy, d);
    } catch (err) {
      console.error('[invites] settle failed', { inviteId: inv.id, err });
    }
  }
}

/**
 * After a verified sign-in: accept a pending invite code (the /i/<code>
 * cookie, or the code saved with the emailed sign-in), then settle any
 * bonus. Never throws: signing in must not fail on an invite.
 */
export async function onSignedIn(
  userId: string,
  inviteCode: string | null | undefined,
  d?: CreditDeps,
): Promise<{ invite?: AcceptResult; settled?: SettleResult }> {
  const out: { invite?: AcceptResult; settled?: SettleResult } = {};
  try {
    const deps = d ?? getCreditDeps();
    if (inviteCode && !(await deps.affiliates.invitedBy(userId))) {
      out.invite = await acceptInvite(userId, inviteCode, deps);
    } else {
      out.settled = await settleInviteBonus(userId, deps);
    }
  } catch (err) {
    console.error('[invites] sign-in settle failed', err);
  }
  return out;
}

// ── URLs ─────────────────────────────────────────────────────────────────

/** Public origin from the request host (never localhost), else the site URL. */
export function originFromHeaders(h: { get(name: string): string | null }): string {
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (host && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)) return `${proto}://${host}`;
  return (env('NEXT_PUBLIC_SITE_URL') || 'https://sh1pt.com').replace(/\/$/, '');
}

export function inviteUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, '')}/i/${encodeURIComponent(code)}`;
}
