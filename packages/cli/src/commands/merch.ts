import { Command } from 'commander';
import kleur from 'kleur';

// Merch = swag. Shirts, stickers, hoodies, mugs, pens, notebooks, tote
// bags — anything printable. Sell it for revenue or ship it free for
// conference giveaways and community perks.
export const merchCmd = new Command('merch')
  .description('Print & ship swag via Printful / Printify — for sale or for free conference giveaways')
  .action(() => { merchCmd.help(); });

merchCmd
  .command('setup')
  .description('Connect a POD provider (Printful, Printify) and optionally a storefront (Shopify, Etsy, Gumroad)')
  .option('--provider <id>', 'merch-printful | merch-printify')
  .action((opts: { provider?: string }) => {
    console.log(kleur.cyan(`[stub] merch setup · ${opts.provider ?? 'all declared'}`));
  });

merchCmd
  .command('create')
  .description('Upload a design and mint SKUs across one or more product kinds')
  .requiredOption('--design <path>', 'path or URL to the design file (300+ DPI recommended)')
  .requiredOption('--products <kind...>', 'tshirt hoodie sticker mug pen notebook etc.')
  .option('--colors <list>', 'comma-separated colors', 'black,white')
  .option('--sizes <list>', 'comma-separated sizes (apparel only)', 'S,M,L,XL,XXL')
  .option('--price <usd>', 'retail price in USD; omit to use provider suggestion', Number)
  .option('--markup <percent>', 'margin over base cost if --price is omitted', Number, 40)
  .option('--provider <id>', 'default: first configured')
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.green(`[stub] merch create ${JSON.stringify(opts)}`));
    // TODO: MerchProvider.uploadDesign(), then createProduct() per kind.
  });

merchCmd
  .command('list')
  .description('List current SKUs across all connected providers')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ skus: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] merch list'));
  });

merchCmd
  .command('publish')
  .description('Push SKUs to a public storefront for sale')
  .requiredOption('--storefront <id>', 'shopify | etsy | gumroad | printful-branded')
  .option('--sku <id...>', 'specific SKUs; default: all unpublished')
  .action((opts) => {
    console.log(kleur.cyan(`[stub] merch publish ${JSON.stringify(opts)}`));
  });

merchCmd
  .command('giveaway')
  .description('Bulk ship swag for free (conference, hackathon, community giveaway — no storefront)')
  .requiredOption('--sku <id...>', 'which SKU(s) to ship')
  .requiredOption('--addresses <csvPath>', 'CSV with name,email,address1,city,region,zip,country columns')
  .option('--quantity <n>', 'items per recipient', Number, 1)
  .option('--budget-cap <usd>', 'abort if total exceeds this (strongly recommended)', Number)
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.yellow(`[stub] merch giveaway ${JSON.stringify(opts)}`));
    // TODO:
    //  1. parse CSV, validate addresses
    //  2. quote total = items × recipients × baseFulfillmentCost (Printful quote API)
    //  3. abort if > budget-cap
    //  4. POST ${API}/orders per recipient (with external_id to dedupe)
  });

merchCmd
  .command('orders')
  .description('Recent orders and fulfillment status (both sales and giveaways)')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ orders: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] merch orders'));
  });

merchCmd
  .command('payout')
  .description('Earnings summary and withdrawal to connected bank / Stripe / PayPal')
  .action(() => {
    console.log(kleur.dim('[stub] merch payout — provider-specific, usually manual trigger on a settled balance'));
  });
