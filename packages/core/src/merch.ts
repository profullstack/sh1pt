import { autoSetup } from './setup-helpers.js';

// Merchandise / print-on-demand. A merch provider can upload a design,
// mint SKUs (t-shirts, hoodies, stickers, mugs, posters), list them to
// a sales channel, and forward orders for fulfillment.

export type ProductKind =
  // apparel
  | 'tshirt' | 'hoodie' | 'sweatshirt' | 'tank' | 'longsleeve' | 'hat' | 'beanie' | 'socks'
  // small / stationery
  | 'sticker' | 'sticker-sheet' | 'magnet' | 'pin' | 'patch' | 'keychain'
  // writing
  | 'pen' | 'pencil' | 'notebook' | 'journal' | 'planner' | 'book'
  // drinkware
  | 'mug' | 'tumbler' | 'waterbottle'
  // wall art
  | 'poster' | 'canvas' | 'framed-print'
  // bags + tech
  | 'tote' | 'backpack' | 'fanny-pack' | 'phonecase' | 'laptop-sleeve' | 'mousepad'
  // home
  | 'pillow' | 'blanket' | 'towel';

export interface Design {
  file: string;               // path or URL
  placement?: 'front' | 'back' | 'left-sleeve' | 'right-sleeve' | 'wrap';
  dpi?: number;               // 300+ strongly recommended
}

export interface MerchProductSpec {
  kind: ProductKind;
  title: string;
  description?: string;
  designs: Design[];
  // color/size variants get expanded into SKUs by the provider
  colors?: string[];          // e.g. ['black', 'white', 'navy']
  sizes?: string[];           // e.g. ['S', 'M', 'L', 'XL', 'XXL']
  retailPrice?: number;       // USD; provider returns suggested price if omitted
  markup?: number;            // percent over base cost if retailPrice not set
  tags?: string[];
}

export interface MerchSku {
  id: string;                 // provider-native
  kind: ProductKind;
  variant: string;            // e.g. 'black-L'
  retailPrice: number;
  currency: string;
  mockupUrl?: string;         // rendered preview image
  productUrl?: string;        // public listing URL if published
}

export interface MerchOrder {
  id: string;
  status: 'pending' | 'printing' | 'shipped' | 'delivered' | 'returned' | 'cancelled';
  skuId: string;
  quantity: number;
  shippedAt?: string;
  trackingUrl?: string;
  customerEmail?: string;
}

export interface MerchPayout {
  periodStart: string;
  periodEnd: string;
  grossRevenue: number;
  fees: number;
  netPayout: number;
  currency: string;
}

export interface MerchProvider<Config = unknown> {
  id: string;                 // e.g. 'merch-printful'
  label: string;
  supports: ProductKind[];
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string }>;
  uploadDesign(ctx: { log(m: string): void; dryRun: boolean }, design: Design, config: Config): Promise<{ designId: string; url: string }>;
  createProduct(ctx: { log(m: string): void; dryRun: boolean }, spec: MerchProductSpec, config: Config): Promise<MerchSku[]>;
  listProducts(config: Config): Promise<MerchSku[]>;
  // Push product to an external storefront (Shopify, Etsy, Gumroad, etc.)
  // or the provider's own branded storefront.
  publish(ctx: { log(m: string): void; dryRun: boolean }, skuIds: string[], storefront: string, config: Config): Promise<{ urls: string[] }>;
  listOrders(config: Config): Promise<MerchOrder[]>;
  payout?(config: Config): Promise<MerchPayout>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineMerch<Config>(m: MerchProvider<Config>): MerchProvider<Config> {
  return autoSetup(m);
}

const merchRegistry = new Map<string, MerchProvider<any>>();

export function registerMerchProvider(m: MerchProvider<any>): void {
  if (merchRegistry.has(m.id)) throw new Error(`Merch provider already registered: ${m.id}`);
  merchRegistry.set(m.id, m);
}

export function getMerchProvider(id: string): MerchProvider<any> | undefined {
  return merchRegistry.get(id);
}

export function listMerchProviders(): MerchProvider<any>[] {
  return [...merchRegistry.values()];
}
