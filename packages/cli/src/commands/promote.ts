import { Command } from 'commander';
import kleur from 'kleur';
import { merchCmd } from './merch.js';
import { shipCmd as shipSub } from './ship.js';

export const promoteCmd = new Command('promote')
  .description('Run ads + ship swag. Reddit, Meta, TikTok, Google, YouTube, X, Apple Search, LinkedIn, Microsoft — plus Printful/Printify merch.')
  .option('--platform <id...>', 'only launch on these platforms')
  .option('--budget <amount>', 'per-platform budget override', Number)
  .option('--duration <span>', 'e.g. 7d, 14d, 30d, ongoing')
  .option('--objective <kind>', 'install | web-traffic | awareness | engagement | signup | purchase', 'install')
  .option('--dry-run', 'validate creatives/targeting without launching')
  .action((opts) => {
    console.log(kleur.green('[stub] promote launch'), kleur.dim(JSON.stringify(opts)));
    // TODO: load manifest.promo, build CampaignContext, invoke AdPlatform.start() per platform
    // in parallel, record campaign ids in cloud
  });

promoteCmd
  .command('setup')
  .description('Walk through org/account/funding setup per ad platform — deep links for human-only steps')
  .option('--platform <id...>', 'only set up these platforms (default: all declared in manifest)')
  .option('--poll', 're-check every 30s until all steps complete')
  .action(async (opts: { platform?: string[]; poll?: boolean }) => {
    // TODO: load manifest.promo.platforms, resolve each to an AdPlatform,
    // call onboard() → render checklist below → persist state.
    const examples = opts.platform ?? ['meta', 'reddit', 'tiktok'];
    for (const p of examples) {
      console.log();
      console.log(kleur.bold().underline(p.toUpperCase()));
      const steps: { title: string; status: 'done' | 'pending' | 'action-required' | 'in-review'; url?: string; eta?: number }[] = [
        { title: 'Business account', status: 'action-required', url: `https://${p === 'meta' ? 'business.facebook.com' : p + '.com'}/`, eta: 5 },
        { title: 'Ad account created', status: 'pending' },
        { title: 'Payment method', status: 'action-required', eta: 3 },
        { title: 'sh1pt authorized (OAuth)', status: 'action-required', eta: 3 },
      ];
      for (const s of steps) {
        const icon =
          s.status === 'done' ? kleur.green('✓')
          : s.status === 'in-review' ? kleur.yellow('…')
          : s.status === 'action-required' ? kleur.yellow('!')
          : kleur.gray('○');
        const eta = s.eta ? kleur.dim(` (~${s.eta}m)`) : '';
        const url = s.url ? kleur.dim(` → ${s.url}`) : '';
        console.log(`  ${icon} ${s.title}${eta}${url}`);
      }
    }
    if (opts.poll) console.log(kleur.dim('\n[stub] would poll every 30s and refresh until readyToRun=true'));
  });

promoteCmd
  .command('status')
  .description('Aggregated metrics across active campaigns')
  .option('--platform <id>', 'filter to one platform')
  .option('--json', 'machine-readable output')
  .action((opts: { platform?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ platforms: [], totals: { spend: 0, impressions: 0, clicks: 0, installs: 0 } }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] promote status · platform=${opts.platform ?? 'all'}`));
  });

promoteCmd
  .command('stop')
  .description('Pause or end campaigns')
  .option('--platform <id...>')
  .option('--id <campaignId>')
  .action((opts: { platform?: string[]; id?: string }) => {
    console.log(kleur.yellow(`[stub] promote stop · ${JSON.stringify(opts)}`));
  });

promoteCmd
  .command('creatives')
  .description('Manage ad creatives (headlines, descriptions, images, videos)')
  .action(() => {
    console.log(kleur.dim('[stub] promote creatives — edit manifest.promo.creatives or upload assets to secrets vault'));
  });

// Everything that gets users — or investors — to the product. All
// nests under `promote` so the global namespace stays small.
promoteCmd.addCommand(shipSub);       // sh1pt promote ship [setup|init|status|rollback|lint|logs|target]
promoteCmd.addCommand(merchCmd);      // sh1pt promote merch [setup|create|publish|giveaway|orders|payout|list]

// Investor outreach via CapitalReach and friends. Same adapter shape as
// ads (promo-*) under the hood — filters replace ad creatives, reply
// rate replaces CTR.
const investorsCmd = promoteCmd
  .command('investors')
  .description('Angel / seed / VC outreach — pitch decks to targeted firms via CapitalReach.ai');

investorsCmd
  .command('setup')
  .description('Connect CapitalReach (and any other outreach tools) via API key')
  .option('--provider <id>', 'promo-capitalreach (default)', 'promo-capitalreach')
  .action((opts: { provider: string }) => {
    console.log(kleur.cyan(`[stub] investors setup · ${opts.provider}`));
  });

investorsCmd
  .command('pitch')
  .description('Send personalized intros + pitch deck to a targeted list')
  .option('--stage <stage>', 'pre-seed | seed | series-a | series-b', 'seed')
  .option('--sectors <list>', 'comma-separated sectors', 'ai,devtools,saas')
  .option('--check-min <usd>', 'minimum check size in thousands', Number, 25)
  .option('--check-max <usd>', 'maximum check size in thousands', Number, 500)
  .option('--leads-only', 'filter to lead investors only')
  .option('--deck <path>', 'path or URL to the pitch deck')
  .option('--one-pager <path>')
  .option('--dry-run', 'preview the target list + copy without sending')
  .action((opts) => {
    console.log(kleur.green(`[stub] investors pitch ${JSON.stringify(opts)}`));
  });

investorsCmd
  .command('search')
  .description('Search investor database and export CSV without launching')
  .option('--stage <stage>')
  .option('--sectors <list>')
  .option('--leads-only')
  .option('--check-min <usd>', Number)
  .option('--check-max <usd>', Number)
  .option('--out <csvPath>', '', './investors.csv')
  .action((opts) => {
    console.log(kleur.dim(`[stub] investors search → ${opts.out ?? './investors.csv'}`));
  });

investorsCmd
  .command('status')
  .description('Sent / replies / meetings / term sheets — the funnel')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ sent: 0, replies: 0, meetings: 0, termSheets: 0 }, null, 2));
      return;
    }
    console.log(kleur.dim('[stub] investors status'));
  });

investorsCmd
  .command('schedule')
  .description('Meetings the tool has booked on your behalf (calendar sync)')
  .action(() => {
    console.log(kleur.dim('[stub] investors schedule — pulls from the outreach tool calendar integration'));
  });
