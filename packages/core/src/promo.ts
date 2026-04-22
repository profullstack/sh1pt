import { autoSetup } from './setup-helpers.js';

export type AdObjective = 'install' | 'web-traffic' | 'awareness' | 'engagement' | 'signup' | 'purchase';

export interface Creative {
  headline: string;
  description: string;
  cta?: string;          // e.g. 'Install', 'Learn More', 'Shop Now'
  image?: string;        // path or URL
  video?: string;        // path or URL
  // per-platform overrides, keyed by platform id (e.g. { 'promo-tiktok': { video: '...' } })
  overrides?: Record<string, Partial<Creative>>;
}

export interface Targeting {
  geo?: string[];        // ISO country codes
  age?: { min?: number; max?: number };
  genders?: ('male' | 'female' | 'all')[];
  interests?: string[];
  languages?: string[];  // ISO language codes
  devices?: ('ios' | 'android' | 'desktop' | 'web')[];
  customAudienceIds?: string[];
}

export interface Budget {
  amount: number;
  currency: string;      // ISO 4217
  cadence: 'daily' | 'lifetime';
}

export interface CampaignContext {
  projectDir: string;
  appName: string;
  storeUrls: Partial<Record<'ios' | 'android' | 'web' | 'mac' | 'win' | 'ext-chrome', string>>;
  budget: Budget;
  start: Date;
  end?: Date;            // omit for open-ended (daily budget)
  objective: AdObjective;
  creatives: Creative[];
  targeting?: Targeting;
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
  dryRun: boolean;
}

export interface AdConnectContext {
  secret(key: string): string | undefined;
  log(msg: string, level?: 'info' | 'warn' | 'error'): void;
}

export interface CampaignResult {
  id: string;
  url?: string;          // ad-platform dashboard URL
  estimatedReach?: number;
}

export interface CampaignMetrics {
  state: 'pending' | 'active' | 'paused' | 'ended' | 'failed' | 'rejected';
  spend: number;         // in budget.currency
  impressions: number;
  clicks: number;
  installs?: number;
  conversions?: number;
  ctr?: number;          // click-through rate
  cpi?: number;          // cost per install
  cpc?: number;          // cost per click
  message?: string;
}

export type OnboardStepStatus = 'done' | 'pending' | 'action-required' | 'in-review' | 'blocked';

export interface OnboardStep {
  id: string;
  title: string;
  description?: string;
  status: OnboardStepStatus;
  actionUrl?: string;          // deep link the user should visit
  estDurationMin?: number;     // human-time the step typically takes
  blockers?: string[];
}

export interface OnboardState {
  platform: string;
  accountId?: string;
  steps: OnboardStep[];
  readyToRun: boolean;         // all required steps complete, safe to call start()
  funded: boolean;             // payment method attached AND balance sufficient (prepay regions)
}

export interface AdPlatform<Config = unknown> {
  id: string;            // e.g. 'promo-reddit'
  label: string;
  validate?(config: unknown): Config;
  // Optional. If present, `sh1pt promo setup --platform <id>` calls this
  // to render a guided checklist: business account → ad account → payment
  // → review state. Platforms without onboard() just run connect().
  onboard?(ctx: AdConnectContext, config: Config): Promise<OnboardState>;
  connect(ctx: AdConnectContext, config: Config): Promise<{ accountId: string }>;
  start(ctx: CampaignContext, config: Config): Promise<CampaignResult>;
  status(campaignId: string, config: Config): Promise<CampaignMetrics>;
  stop(campaignId: string, config: Config): Promise<void>;
  update?(campaignId: string, patch: Partial<CampaignContext>, config: Config): Promise<void>;
}

export function defineAdPlatform<Config>(p: AdPlatform<Config>): AdPlatform<Config> {
  return autoSetup(p);
}

const adRegistry = new Map<string, AdPlatform<any>>();

export function registerAdPlatform(p: AdPlatform<any>): void {
  if (adRegistry.has(p.id)) throw new Error(`Ad platform already registered: ${p.id}`);
  adRegistry.set(p.id, p);
}

export function getAdPlatform(id: string): AdPlatform<any> | undefined {
  return adRegistry.get(id);
}

export function listAdPlatforms(): AdPlatform<any>[] {
  return [...adRegistry.values()];
}
