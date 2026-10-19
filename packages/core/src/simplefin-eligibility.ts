/**
 * Fail-closed policy for financial-product discovery and onboarding.
 *
 * This is deliberately provider-neutral. A catalog entry is only available
 * when evidence is current for the exact product, legal profile and route.
 */

export type SimplefinQualificationStatus =
  | 'candidate'
  | 'testing'
  | 'verified'
  | 'degraded'
  | 'stale'
  | 'unsupported'
  | 'retired';

export interface SimplefinQualification {
  productId: string;
  institutionId: string;
  accountType: 'checking' | 'savings' | 'credit' | 'charge' | 'loan' | 'credit-line';
  entityProfile: string;
  serviceJurisdictions: string[];
  routeKind: 'native' | 'bridge';
  serverRef: string;
  testedProtocolVersions: string[];
  requiredDataProfile: string;
  status: SimplefinQualificationStatus;
  lastVerifiedAt: string | null;
  reverifyDueAt: string | null;
  evidenceRefs: string[];
  productionEnabled: boolean;
}

export interface ProductRequest {
  productId: string;
  entityProfile: string;
  jurisdiction: string;
  protocolVersion?: string;
}

export type EligibilityDecision =
  | { ok: true; qualification: SimplefinQualification }
  | { ok: false; code: 'SIMPLEFIN_UNVERIFIED' | 'SIMPLEFIN_STALE' | 'PROFILE_UNSUPPORTED'; reason: string };

/** Returns true only while a qualification is verified and inside its expiry. */
export function isQualificationCurrent(
  qualification: SimplefinQualification,
  now: Date = new Date(),
): boolean {
  if (qualification.status !== 'verified' || !qualification.productionEnabled) return false;
  if (!qualification.lastVerifiedAt || !qualification.reverifyDueAt) return false;
  const verified = Date.parse(qualification.lastVerifiedAt);
  const due = Date.parse(qualification.reverifyDueAt);
  return Number.isFinite(verified) && Number.isFinite(due) && due > verified && now.getTime() < due;
}

/**
 * Shared server-side gate used for both listing and final application dispatch.
 * A catalog record may exist for research, but it can never be offered when
 * the exact profile, jurisdiction, route, or protocol is not qualified.
 */
export function checkSimplefinEligibility(
  request: ProductRequest,
  qualification: SimplefinQualification | undefined,
  now: Date = new Date(),
): EligibilityDecision {
  if (!qualification || qualification.productId !== request.productId) {
    return { ok: false, code: 'SIMPLEFIN_UNVERIFIED', reason: 'No exact-product SimpleFIN qualification exists' };
  }
  if (qualification.entityProfile !== request.entityProfile || !qualification.serviceJurisdictions.includes(request.jurisdiction)) {
    return { ok: false, code: 'PROFILE_UNSUPPORTED', reason: 'The qualified legal profile or service jurisdiction does not match' };
  }
  if (request.protocolVersion && !qualification.testedProtocolVersions.includes(request.protocolVersion)) {
    return { ok: false, code: 'PROFILE_UNSUPPORTED', reason: 'The requested SimpleFIN protocol version is not tested for this product' };
  }
  if (!isQualificationCurrent(qualification, now)) {
    return { ok: false, code: qualification.status === 'stale' || Boolean(qualification.reverifyDueAt && Date.parse(qualification.reverifyDueAt) <= now.getTime()) ? 'SIMPLEFIN_STALE' : 'SIMPLEFIN_UNVERIFIED', reason: 'SimpleFIN qualification is not current and production enabled' };
  }
  return { ok: true, qualification };
}

/** Filter a research catalog down to products safe to show as available. */
export function availableSimplefinProducts(
  requests: ProductRequest[],
  qualifications: Iterable<SimplefinQualification>,
  now: Date = new Date(),
): SimplefinQualification[] {
  const byProduct = new Map([...qualifications].map((qualification) => [qualification.productId, qualification]));
  return requests.flatMap((request) => {
    const result = checkSimplefinEligibility(request, byProduct.get(request.productId), now);
    return result.ok ? [result.qualification] : [];
  });
}
