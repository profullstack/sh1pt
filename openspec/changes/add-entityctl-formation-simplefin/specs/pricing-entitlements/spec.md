## ADDED Requirements

Normative source: OpenPRD 0001. These are proposed acceptance requirements, not executed tests or production qualification evidence. Source references are defined in the PRD; all original normative clauses are retained below.

### Requirement: R50 Make prices configurable and external costs explicit
Priority: P0. Source: OpenPRD 0001 R50.

The system SHALL separate entitlements from provider procurement. The free nonprofit tier has a zero platform software/service fee for the core workflow; businesses may pay a disclosed formation-service fee and an optional ongoing subscription. Plan prices and included limits SHALL be operator-configured rather than embedded in client code. External charges are never included unless explicitly budgeted. No paid plan, referral payment, or administrator role SHALL relax SimpleFIN qualification or consent requirements.

#### Scenario: R50-S1 Configured free entitlement
- **WHEN** an eligible nonprofit uses a core capability or a business chooses formation without subscription
- **THEN** nonprofit platform fee is zero, business pricing comes from configuration, external costs are separate and formation does not silently enroll recurring billing

#### Scenario: R50-S2 Paid plan cannot bypass policy
- **WHEN** an admin or commission-bearing premium offer fails consent or qualification
- **THEN** the same mandatory policy blocks it regardless of entitlement, referral revenue or role

### Requirement: R51 Support customer-owned SimpleFIN access without reselling assumptions
Priority: P0. Source: OpenPRD 0001 R51.

V1 SHALL support each customer's authorized SimpleFIN connection, including a customer-owned Bridge subscription where needed. Platform pricing SHALL explain that an external subscription may still be required. The advertised consumer subscription is not assumed to license a shared unlimited multi-tenant/reseller service; operator-sponsored or embedded arrangements require explicit provider agreement and cost modeling. The product SHALL not resell financial data or use it for advertising/model training as a condition of the free nonprofit tier.

Source notes in OpenPRD 0001: bridge-price.

#### Scenario: R51-S1 Customer-owned connection
- **WHEN** a customer links an authorized SimpleFIN connection requiring a separate Bridge subscription
- **THEN** external cost and ownership are disclosed and the connection does not become a shared unlimited reseller entitlement

#### Scenario: R51-S2 No data-sale condition
- **WHEN** a nonprofit declines advertising or model-training use of financial data or an operator proposes sponsored aggregation
- **THEN** core access does not require those uses and operator-sponsored/embedded access stays gated until explicit provider agreement and cost modeling

### Requirement: R52 Bound platform spending and subsidy exposure
Priority: P0. Source: OpenPRD 0001 R52.

The operator SHALL configure a maximum incremental hosting budget, provider spend caps, per-entity usage limits, and nonprofit subsidy rules before launch. Paid external actions require available budget and customer authorization. Free-tier rate limits may delay noncritical work but SHALL never silently charge customers, discard legally important records, or misrepresent required deadlines. Provider minimums, professional review, and support labor SHALL be included in unit economics, not hidden behind low per-request prices.

#### Scenario: R52-S1 Spend reservation cap
- **WHEN** an approved paid action would exceed a provider/platform cap, available budget or per-entity limit
- **THEN** the action is blocked without an external charge, with a visible reason and next action

#### Scenario: R52-S2 Free quota pressure
- **WHEN** noncritical nonprofit work reaches a rate/subsidy limit
- **THEN** it may be delayed transparently but cannot create a charge, discard legally important records or hide deadlines; cost review includes minimums and support/professional labor
