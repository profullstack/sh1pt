import { defineRecipe } from '@profullstack/sh1pt-core';

// Sell first, build second. This recipe goes live across every sh1pt
// distribution channel with a waitlist, an investor page, crypto-pay
// for early-access, tiered pricing, and a referral program.
//
// Numbers below are sh1pt's own go-to-market defaults (early bird $244/yr
// vs standard $499/yr). Each field is overridable in sh1pt.config.ts
// via `recipeConfig`.
export default defineRecipe({
  id: 'waitlist-crypto-investor',
  label: 'Prepaid Waitlist + Investor Page + Crypto Early-Access + Referrals',
  description:
    'Land a marketing page everywhere sh1pt ships. Collect prepaid signups at an early-bird price. ' +
    'Show an investor section for fundraising conversations. Reward referrals. ' +
    'Build the actual product on the demand the waitlist proves.',
  features: [
    'waitlist',
    'investor-page',
    'crypto-payment',
    'card-payment',
    'tiered-pricing',
    'referral-program',
    'landing-page',
    'auth',
  ],
  pricing: [
    {
      id: 'early-bird-yearly',
      label: 'Early Access (yearly)',
      amount: 244,
      currency: 'USD',
      cadence: 'yearly',
      features: ['All future features', 'Locked-in price for life', 'Founder-level support'],
      discount: { amount: 255, reason: 'Prepaid waitlist signups only — goes away at launch' },
    },
    {
      id: 'standard-yearly',
      label: 'Standard (yearly)',
      amount: 499,
      currency: 'USD',
      cadence: 'yearly',
      features: ['All features'],
    },
    {
      id: 'monthly',
      label: 'Monthly',
      amount: 49,
      currency: 'USD',
      cadence: 'monthly',
      features: ['All features', 'Cancel anytime'],
    },
  ],
  waitlist: {
    enabled: true,
    collectEmail: true,
    collectHandle: true,
    earlyAccessTiers: [], // populated from pricing.early-bird-yearly on generate
  },
  investor: {
    enabled: true,
    contact: 'investors@example.com',
    sections: ['team', 'traction', 'roadmap', 'market'],
  },
  referral: {
    enabled: true,
    rewardAmount: 50,
    rewardCurrency: 'USD',
    rewardType: 'credit',
    tiers: [
      { invites: 3, bonus: 150 },
      { invites: 10, bonus: 600 },
      { invites: 25, bonus: 2000 },
    ],
  },
  cryptoPayment: {
    providers: ['coinpay', 'solana-pay', 'coinbase-commerce'],
    acceptedCoins: ['BTC', 'ETH', 'USDC', 'SOL'],
  },
  prompts: {
    'next-supabase': `
Build a Next.js 15 App Router page set using Supabase for auth + postgres:

  /                      Marketing landing + pricing tiers from recipeConfig.pricing
  /waitlist              Signup form (email + handle) → supabase.waitlist table
  /waitlist/checkout     Early-bird \${recipeConfig.pricing[0].amount}/yr prepay via CoinPay + Stripe
  /investors             Pitch deck viewer, team, traction, contact form
  /r/[code]              Referral landing; track via supabase.referrals(code, inviter_id)
  /dashboard             Post-signup area — placeholder until features are built

Wire Supabase RLS so waitlist rows belong to the signup user, referrals
are readable by inviter. Add a resend template for confirmation emails.
Keep visual design clean, dark theme, type-led. No generic marketing copy.`,
    'expo-supabase': `
Build an Expo (React Native + Router) mobile equivalent of the web waitlist:

  /                      Hero + pricing CTA
  /waitlist              Email + handle signup with Apple/Google sign-in via Supabase
  /waitlist/checkout     Prepay via Stripe (native SDK) and/or in-app CoinPay webview
  /investors             Read-only pitch summary, investor contact sheet share
  /referrals             Referral code display + native share sheet

Persist auth in expo-secure-store. Deep-link /r/[code] to honor the
referral code at signup.`,
    'bun-hono-supabase': `
Build Hono endpoints backing the waitlist:

  POST /waitlist              upsert email/handle, return referral code
  POST /waitlist/checkout     create Stripe + CoinPay sessions for early-bird tier
  POST /webhooks/stripe       mark signup prepaid, assign locked-in price
  POST /webhooks/coinpay      same, for crypto paths
  GET  /r/[code]              resolve referral code → inviter
  POST /referrals/confirm     credit inviter when referral prepays

Validate payloads with zod, verify webhook signatures, store all writes
under a \`sh1pt_waitlist\` schema in Supabase postgres.`,
  },
});
