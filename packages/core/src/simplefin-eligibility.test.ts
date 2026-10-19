import { describe, expect, it } from 'vitest';
import { availableSimplefinProducts, checkSimplefinEligibility, isQualificationCurrent, type SimplefinQualification } from './simplefin-eligibility.js';

const now = new Date('2026-09-14T00:00:00Z');
const qualified: SimplefinQualification = {
  productId: 'checking-example', institutionId: 'bank-example', accountType: 'checking',
  entityProfile: 'us_nonprofit_public_benefit', serviceJurisdictions: ['US-CA'], routeKind: 'bridge',
  serverRef: 'bridge', testedProtocolVersions: ['2.0.0-draft'], requiredDataProfile: 'deposit-v1',
  status: 'verified', lastVerifiedAt: '2026-09-01T00:00:00Z', reverifyDueAt: '2026-10-01T00:00:00Z',
  evidenceRefs: ['evidence-1'], productionEnabled: true,
};

describe('SimpleFIN product eligibility', () => {
  it('fails closed for missing, stale, or wrong-profile qualifications', () => {
    expect(checkSimplefinEligibility({ productId: 'missing', entityProfile: qualified.entityProfile, jurisdiction: 'US-CA' }, undefined, now).code).toBe('SIMPLEFIN_UNVERIFIED');
    expect(checkSimplefinEligibility({ productId: qualified.productId, entityProfile: 'us_business', jurisdiction: 'US-CA' }, qualified, now).code).toBe('PROFILE_UNSUPPORTED');
    expect(isQualificationCurrent({ ...qualified, reverifyDueAt: '2026-09-13T00:00:00Z' }, now)).toBe(false);
  });

  it('requires the tested protocol version and production flag', () => {
    expect(checkSimplefinEligibility({ productId: qualified.productId, entityProfile: qualified.entityProfile, jurisdiction: 'US-CA', protocolVersion: '1.0.7' }, qualified, now).ok).toBe(false);
    expect(checkSimplefinEligibility({ productId: qualified.productId, entityProfile: qualified.entityProfile, jurisdiction: 'US-CA', protocolVersion: '2.0.0-draft' }, qualified, now).ok).toBe(true);
    expect(availableSimplefinProducts([{ productId: qualified.productId, entityProfile: qualified.entityProfile, jurisdiction: 'US-CA' }], [qualified], now)).toHaveLength(1);
  });
});
