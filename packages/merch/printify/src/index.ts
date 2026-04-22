import { defineMerch, tokenSetup, type MerchSku } from '@profullstack/sh1pt-core';

// Printify — aggregator marketplace across many print providers; often
// cheaper base costs than Printful but variable quality. REST API at
// api.printify.com. Bearer token auth.
interface Config {
  shopId?: number;
  preferredPrintProvider?: number;
}

const API = 'https://api.printify.com/v1';

export default defineMerch<Config>({
  id: 'merch-printify',
  label: 'Printify (multi-provider POD)',
  supports: [
    'tshirt','hoodie','sweatshirt','tank','longsleeve','hat','socks',
    'sticker','pin','keychain',
    'mug','tumbler','waterbottle',
    'poster','canvas',
    'tote','backpack','phonecase','laptop-sleeve','mousepad',
    'pillow','blanket','towel',
    'notebook','journal',
  ],

  async connect(ctx) {
    if (!ctx.secret('PRINTIFY_TOKEN')) throw new Error('PRINTIFY_TOKEN not set');
    return { accountId: 'printify' };
  },

  async uploadDesign(ctx, design) {
    ctx.log(`printify upload · ${design.file}`);
    if (ctx.dryRun) return { designId: 'dry-run', url: design.file };
    // TODO: POST ${API}/uploads/images.json { file_name, url | contents }
    return { designId: `py_img_${Date.now()}`, url: design.file };
  },

  async createProduct(ctx, spec) {
    ctx.log(`printify create · kind=${spec.kind}`);
    if (ctx.dryRun) return [stub('dry-run', spec.kind)];
    // TODO: POST ${API}/shops/${shopId}/products.json
    // Requires catalog blueprint_id + print_provider_id lookup first.
    return [stub(`py_${Date.now()}`, spec.kind)];
  },

  async listProducts() { return []; },

  async publish(ctx, skuIds, storefront) {
    ctx.log(`printify publish ${skuIds.length} sku(s) → ${storefront}`);
    if (ctx.dryRun) return { urls: [] };
    // TODO: POST ${API}/shops/${shopId}/products/${productId}/publish.json
    return { urls: [] };
  },

  async listOrders() { return []; },

  setup: tokenSetup<Config>({
    secretKey: 'PRINTIFY_TOKEN',
    label: 'Printify',
    vendorDocUrl: 'https://printify.com/app/account/api',
    steps: [
      'Open printify.com → My Account → Connections → API',
      'Generate a new personal access token',
      'Copy the token (shown once)',
    ],
  }),
});

function stub(id: string, kind: MerchSku['kind']): MerchSku {
  return { id, kind, variant: 'default', retailPrice: 0, currency: 'USD' };
}
