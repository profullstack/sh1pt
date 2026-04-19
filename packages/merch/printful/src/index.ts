import { defineMerch, type MerchSku, type MerchOrder } from '@sh1pt/core';

// Printful — print-on-demand + fulfillment. Huge catalog (t-shirts,
// hoodies, stickers, mugs, pens, notebooks, tote bags — aka "swag" for
// conference giveaways). REST API at api.printful.com. Auth: Bearer
// token (Store API Token).
interface Config {
  storeId?: number;
  // public storefront the provider should attach products to. For conference
  // giveaways without public sale, use 'private' and use listOrders()
  // solely to issue bulk fulfillment against a shipping list.
  storefront?: 'shopify' | 'etsy' | 'gumroad' | 'printful-branded' | 'private';
}

const API = 'https://api.printful.com';

export default defineMerch<Config>({
  id: 'merch-printful',
  label: 'Printful (sell + giveaway POD)',
  supports: [
    'tshirt','hoodie','sweatshirt','tank','longsleeve','hat','beanie','socks',
    'sticker','sticker-sheet',
    'mug','tumbler','waterbottle',
    'poster','canvas','framed-print',
    'tote','backpack','phonecase','laptop-sleeve','mousepad',
    'pillow','blanket','towel',
  ],

  async connect(ctx) {
    if (!ctx.secret('PRINTFUL_TOKEN')) throw new Error('PRINTFUL_TOKEN not set — run `sh1pt secret set PRINTFUL_TOKEN`');
    return { accountId: 'printful' };
  },

  async uploadDesign(ctx, design) {
    ctx.log(`printful upload design · ${design.file}`);
    if (ctx.dryRun) return { designId: 'dry-run', url: design.file };
    // TODO: POST ${API}/files with { url, filename, type }
    return { designId: `pf_file_${Date.now()}`, url: design.file };
  },

  async createProduct(ctx, spec) {
    ctx.log(`printful create · kind=${spec.kind} · variants=${(spec.colors?.length ?? 1) * (spec.sizes?.length ?? 1)}`);
    if (ctx.dryRun) return [stub('dry-run', spec.kind)];
    // TODO:
    //  1. Look up catalog product id for ProductKind → Printful product_id
    //  2. POST ${API}/store/products with sync_product + variants array
    //     (color + size × designs). Each variant = 1 MerchSku.
    //  3. Return the sku objects from response.result.sync_variants
    const variants: MerchSku[] = [];
    for (const color of spec.colors ?? ['black']) {
      for (const size of spec.sizes ?? ['M']) {
        variants.push({
          id: `pf_${spec.kind}_${color}_${size}_${Date.now()}`,
          kind: spec.kind,
          variant: `${color}-${size}`,
          retailPrice: spec.retailPrice ?? 25,
          currency: 'USD',
        });
      }
    }
    return variants;
  },

  async listProducts() { return []; },

  async publish(ctx, skuIds, storefront) {
    ctx.log(`printful publish ${skuIds.length} sku(s) → ${storefront}`);
    if (ctx.dryRun) return { urls: [] };
    // TODO: POST ${API}/sync/products/${id}/publish for each sku if the
    // storefront is Shopify/Etsy/Gumroad (Printful pushes the listing).
    return { urls: [] };
  },

  async listOrders() { return []; },

  async payout() {
    return { periodStart: '', periodEnd: '', grossRevenue: 0, fees: 0, netPayout: 0, currency: 'USD' };
  },
});

function stub(id: string, kind: MerchSku['kind']): MerchSku {
  return { id, kind, variant: 'default', retailPrice: 0, currency: 'USD' };
}
