import { autoSetup } from './setup-helpers.js';

// Affiliate network marketplaces. Sister interface to `promo` (paid ads)
// and `social` (organic posts): same setup() contract, different unit
// economics. Affiliate networks are two-sided — a sh1pt user can either
// list their product as a merchant (advertiser) and pay commission, or
// join existing programs as a publisher and earn commission.

export type CommissionType = 'percentage' | 'flat' | 'tiered';

export interface AffiliateProgram {
  name: string;
  description?: string;
  category?: string;             // e.g. 'saas', 'ecommerce', 'finance'
  commissionType: CommissionType;
  commissionRate: number;        // % when 'percentage', currency-units when 'flat'
  currency?: string;             // ISO 4217 (for 'flat')
  cookieDays?: number;           // attribution window
  destinationUrl: string;        // where clicks go (sh1pt product page)
  termsUrl?: string;
}

export interface AffiliateConnectContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

export interface AffiliateProgramResult {
  programId: string;             // network-native program id
  trackingPixelUrl?: string;     // postback / pixel to fire on conversion
  postbackUrl?: string;          // server-to-server postback endpoint
  marketplaceUrl?: string;       // public listing URL within the network
}

export interface AffiliateStats {
  publishers: number;            // joined / approved
  clicks: number;
  conversions: number;
  revenue: number;
  commissionsPaid: number;
  currency: string;
}

export interface AffiliateLink {
  url: string;                   // affiliate-tagged URL
  shortUrl?: string;             // some networks return a shortener
}

export interface AffiliateNetwork<Config = unknown> {
  id: string;                    // e.g. 'affiliate-cj'
  label: string;
  // Two-sided. 'merchant' networks accept a product listing; 'publisher'
  // networks let you earn by joining programs; 'both' supports either flow.
  side: 'merchant' | 'publisher' | 'both';
  validate?(config: unknown): Config;
  connect(ctx: AffiliateConnectContext, config: Config): Promise<{ accountId: string }>;
  // Merchant: list a program in the marketplace. Returns tracking endpoints.
  createProgram?(
    ctx: AffiliateConnectContext,
    program: AffiliateProgram,
    config: Config,
  ): Promise<AffiliateProgramResult>;
  // Publisher: build an affiliate-tagged link for an existing program.
  getTrackingLink?(
    ctx: AffiliateConnectContext,
    programId: string,
    destinationUrl: string,
    config: Config,
  ): Promise<AffiliateLink>;
  // Either side: pull aggregated stats for a program.
  stats?(ctx: AffiliateConnectContext, programId: string, config: Config): Promise<AffiliateStats>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineAffiliate<Config>(n: AffiliateNetwork<Config>): AffiliateNetwork<Config> {
  return autoSetup(n);
}

const affiliateRegistry = new Map<string, AffiliateNetwork<any>>();

export function registerAffiliateNetwork(n: AffiliateNetwork<any>): void {
  if (affiliateRegistry.has(n.id)) throw new Error(`Affiliate network already registered: ${n.id}`);
  affiliateRegistry.set(n.id, n);
}

export function getAffiliateNetwork(id: string): AffiliateNetwork<any> | undefined {
  return affiliateRegistry.get(id);
}

export function listAffiliateNetworks(): AffiliateNetwork<any>[] {
  return [...affiliateRegistry.values()];
}
