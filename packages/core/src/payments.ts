// Payment providers. One interface; adapters for CoinPay (crypto,
// default), Stripe (cards + ACH), PayPal (legacy but ubiquitous),
// WorldRemit / Wise (cross-border FX + payout), Lemon Squeezy & Polar
// (tax-inclusive MoR for indie), etc.
//
// The recipe system defers to this for checkout URLs — e.g. the
// waitlist-crypto-investor recipe's early-bird tier calls into whichever
// provider is set as default in manifest.payments.defaultProvider.

export type PaymentKind = 'one-time' | 'subscription' | 'crypto' | 'crowdfund';

export interface CheckoutRequest {
  amount: number;               // smallest currency unit (cents for USD, satoshis-ish for crypto)
  currency: string;             // ISO 4217 ("USD") or crypto ("BTC","ETH","USDC","SOL")
  kind: PaymentKind;
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  customerEmail?: string;
  priceId?: string;             // provider-native plan/price id for subscriptions
  metadata?: Record<string, string>;
  description?: string;
  // Platform-fee / revenue-share. If set and the provider supports connect-
  // style flows (Stripe Connect, Polar merchant accounts), route these to
  // a connected account.
  platformFeeBps?: number;      // basis points — 1500 = 15%
  connectedAccountId?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;                  // URL to redirect the buyer to
  expiresAt?: string;
}

export interface Webhook {
  type: string;                 // provider-native event type
  payload: unknown;
  // Normalized fields adapters populate where they can so downstream
  // handlers don't have to know every provider's schema.
  paymentId?: string;
  status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
  amount?: number;
  currency?: string;
  customerEmail?: string;
}

export interface PaymentProvider<Config = unknown> {
  id: string;                   // e.g. 'payment-coinpay'
  label: string;
  supports: PaymentKind[];
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  createCheckout(ctx: { secret(k: string): string | undefined; log(m: string): void }, req: CheckoutRequest, config: Config): Promise<CheckoutSession>;
  verifyWebhook(ctx: { secret(k: string): string | undefined }, rawBody: string, signature: string, config: Config): Promise<Webhook>;
  refund?(paymentId: string, amount: number | undefined, config: Config): Promise<{ id: string }>;
  // For marketplace boilerplates: move money to a connected payee.
  payout?(accountId: string, amount: number, currency: string, config: Config): Promise<{ id: string }>;
}

export function definePayment<Config>(p: PaymentProvider<Config>): PaymentProvider<Config> {
  return p;
}

const paymentRegistry = new Map<string, PaymentProvider<any>>();

export function registerPaymentProvider(p: PaymentProvider<any>): void {
  if (paymentRegistry.has(p.id)) throw new Error(`Payment provider already registered: ${p.id}`);
  paymentRegistry.set(p.id, p);
}

export function getPaymentProvider(id: string): PaymentProvider<any> | undefined {
  return paymentRegistry.get(id);
}

export function listPaymentProviders(): PaymentProvider<any>[] {
  return [...paymentRegistry.values()];
}
