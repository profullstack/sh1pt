// Recipes = composed app templates. A recipe declares a product shape
// ("waitlist with investor page + crypto pre-pay + referral program") as
// a bundle of features that ship together, and carries the prompts +
// file scaffolds an AI agent needs to implement it.
//
// Design intent: sell features, then build them. A waitlist-first recipe
// lets a user put a marketing page live across every sh1pt distribution
// channel in minutes, take prepaid signups, and only build what pays.

export type FeatureKey =
  | 'waitlist'
  | 'investor-page'
  | 'crypto-payment'         // coinpay / stripe crypto / solana pay
  | 'card-payment'           // stripe
  | 'referral-program'
  | 'tiered-pricing'
  | 'auth'
  | 'dashboard'
  | 'api'
  | 'landing-page'
  | 'blog'
  | 'docs';

export interface PricingTier {
  id: string;                // 'early-bird', 'standard', 'team'
  label: string;
  amount: number;
  currency: string;
  cadence: 'monthly' | 'yearly' | 'lifetime';
  features?: string[];
  discount?: { amount: number; reason: string };
}

export interface ReferralConfig {
  enabled: boolean;
  rewardAmount: number;
  rewardCurrency: string;
  rewardType: 'credit' | 'discount-percent' | 'cash-payout';
  tiers?: { invites: number; bonus: number }[];
}

export interface CryptoPaymentConfig {
  providers: ('coinpay' | 'solana-pay' | 'stripe-crypto' | 'coinbase-commerce')[];
  acceptedCoins?: string[]; // e.g. ['BTC','ETH','USDC']
}

export interface WaitlistConfig {
  enabled: boolean;
  collectEmail: boolean;
  collectHandle?: boolean;        // Twitter/X, Telegram, etc.
  earlyAccessTiers?: PricingTier[]; // prepay lets them skip the line
}

export interface InvestorPageConfig {
  enabled: boolean;
  deck?: string;                  // path/URL to pitch deck
  contact: string;                // investor relations email
  sections?: ('team' | 'traction' | 'roadmap' | 'financials' | 'market')[];
}

export interface Recipe {
  id: string;                     // e.g. 'waitlist-crypto-investor'
  label: string;
  description: string;
  features: FeatureKey[];
  // Defaults the recipe ships with — each is overridable in manifest.recipeConfig.
  pricing?: PricingTier[];
  waitlist?: WaitlistConfig;
  investor?: InvestorPageConfig;
  referral?: ReferralConfig;
  cryptoPayment?: CryptoPaymentConfig;
  // Agent prompt templates keyed by boilerplate. When a user runs
  // `sh1pt agents generate` with this recipe, the matching prompt is
  // handed to Claude/Codex/Qwen to write the implementation.
  prompts?: Record<string, string>;
}

export function defineRecipe(r: Recipe): Recipe {
  return r;
}

const recipeRegistry = new Map<string, Recipe>();

export function registerRecipe(r: Recipe): void {
  if (recipeRegistry.has(r.id)) throw new Error(`Recipe already registered: ${r.id}`);
  recipeRegistry.set(r.id, r);
}

export function getRecipe(id: string): Recipe | undefined {
  return recipeRegistry.get(id);
}

export function listRecipes(): Recipe[] {
  return [...recipeRegistry.values()];
}
