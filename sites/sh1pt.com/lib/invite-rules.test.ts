import { describe, expect, it } from 'vitest';
import {
  INVITE_BONUS_MONTHLY_CAP,
  bonusVerdict,
  canAcceptInvite,
  canSendInvites,
  isDisposableEmail,
  looksLikeInviteCode,
  mailboxKey,
} from './invite-rules';
import { planStatus } from './plan';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('invite rules', () => {
  it('opens invites at 7 days old', () => {
    expect(canSendInvites(daysAgo(6), NOW).ok).toBe(false);
    expect(canSendInvites(daysAgo(7), NOW).ok).toBe(true);
    expect(canSendInvites(null, NOW).ok).toBe(false);
  });

  it('accepts only new accounts that did not join on a referral link', () => {
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(1), referredBy: null }, NOW)).toEqual({ ok: true });
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(8), referredBy: null }, NOW)).toMatchObject({ ok: false, reason: 'not_new' });
    expect(canAcceptInvite({ accountCreatedAt: daysAgo(1), referredBy: 'abcd1234' }, NOW)).toMatchObject({
      ok: false,
      reason: 'already_referred',
    });
  });

  it('treats +tags, Gmail dots and googlemail as one mailbox', () => {
    expect(mailboxKey('J.Doe+sh1pt@GoogleMail.com')).toBe('jdoe@gmail.com');
    expect(mailboxKey('j.doe+x@example.com')).toBe('j.doe@example.com');
    expect(mailboxKey('nope')).toBeNull();
  });

  it('spots throwaway inboxes, subdomains included', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@x.yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@example.com')).toBe(false);
  });

  it('decides the bonus', () => {
    const base = { inviteeEmail: 'new@example.com', inviteeConfirmed: true, inviterEmail: 'old@example.com', inviterBonusesLast30Days: 0 };
    expect(bonusVerdict(base)).toEqual({ ok: true });
    expect(bonusVerdict({ ...base, inviteeConfirmed: false })).toEqual({ ok: false, final: false, reason: 'email_not_confirmed' });
    expect(bonusVerdict({ ...base, inviteeEmail: 'x@mailinator.com' })).toMatchObject({ final: true, reason: 'disposable_email' });
    expect(bonusVerdict({ ...base, inviteeEmail: 'old+2@example.com' })).toMatchObject({ final: true, reason: 'same_mailbox' });
    expect(bonusVerdict({ ...base, inviterBonusesLast30Days: INVITE_BONUS_MONTHLY_CAP })).toMatchObject({ reason: 'monthly_cap' });
  });

  it('shape-checks invite codes', () => {
    expect(looksLikeInviteCode('INV-7K3M-QX9D-2F8H')).toBe(true);
    expect(looksLikeInviteCode('inv 7k3m qx9d 2f8h')).toBe(true);
    expect(looksLikeInviteCode('abc')).toBe(false);
    expect(looksLikeInviteCode(null)).toBe(false);
  });
});

describe('planStatus', () => {
  it('is Pro on prepay or on time left', () => {
    expect(planStatus({ prepaid: true }, NOW)).toMatchObject({ pro: true, daysLeft: 0 });
    expect(planStatus({ pro_until: daysAgo(-3) }, NOW)).toMatchObject({ pro: true, daysLeft: 3 });
    expect(planStatus({ pro_until: daysAgo(1) }, NOW)).toMatchObject({ pro: false, daysLeft: 0 });
    expect(planStatus(null, NOW)).toMatchObject({ pro: false, prepaid: false, proUntil: null });
  });
});
