import { Command } from 'commander';
import kleur from 'kleur';

export const promoCmd = new Command('promo').description('Connect ad platforms and run install/awareness campaigns across Reddit, Meta, TikTok, Google, YouTube, X, Apple Search, LinkedIn, and Microsoft.');

promoCmd
  .command('setup')
  .description('Walk through org/account/funding setup per ad platform — deep links for human-only steps')
  .option('--platform <id...>', 'only set up these platforms (default: all declared in manifest)')
  .option('--poll', 're-check every 30s until all steps complete')
  .action(async (opts: { platform?: string[]; poll?: boolean }) => {
    // TODO: load manifest.promo.platforms, resolve each to an AdPlatform,
    // call onboard() → render checklist below → persist state.
    // For now, render a static example against the three priority platforms.
    const examples = (opts.platform ?? ['meta', 'reddit', 'tiktok']);
    for (const p of examples) {
      console.log();
      console.log(kleur.bold().underline(p.toUpperCase()));
      // Static preview — real implementation invokes AdPlatform.onboard()
      const steps: { title: string; status: 'done' | 'pending' | 'action-required' | 'in-review'; url?: string; eta?: number }[] = [
        { title: 'Business account', status: 'action-required', url: `https://${p === 'meta' ? 'business.facebook.com' : p + '.com'}/`, eta: 5 },
        { title: 'Ad account created', status: 'pending' },
        { title: 'Payment method', status: 'action-required', eta: 3 },
        { title: 'sh1pt authorized (OAuth)', status: 'action-required', eta: 3 },
      ];
      for (const s of steps) {
        const icon =
          s.status === 'done' ? kleur.green('✓') :
          s.status === 'in-review' ? kleur.yellow('…') :
          s.status === 'action-required' ? kleur.yellow('!') :
          kleur.gray('○');
        const eta = s.eta ? kleur.dim(` (~${s.eta}m)`) : '';
        const url = s.url ? kleur.dim(` → ${s.url}`) : '';
        console.log(`  ${icon} ${s.title}${eta}${url}`);
      }
    }
    if (opts.poll) {
      console.log(kleur.dim('\n[stub] would poll every 30s and refresh statuses until readyToRun=true'));
    }
  });

promoCmd
  .command('start')
  .description('Launch campaigns across all enabled platforms')
  .option('--platform <id...>', 'only start on these platforms')
  .option('--budget <amount>', 'per-platform budget override', Number)
  .option('--duration <span>', 'e.g. 7d, 14d, 30d, ongoing')
  .option('--objective <kind>', 'install | web-traffic | awareness | engagement | signup | purchase')
  .option('--dry-run', 'validate creatives/targeting without launching')
  .action((opts) => {
    console.log(
      kleur.green(`[stub] promo start`),
      kleur.dim(JSON.stringify(opts)),
    );
    // TODO: load manifest.promo, build CampaignContext, invoke AdPlatform.start() per platform
    // in parallel, record campaign ids in cloud
  });

promoCmd
  .command('status')
  .description('Aggregated metrics across active campaigns')
  .option('--platform <id>', 'filter to one platform')
  .option('--json', 'machine-readable output')
  .action((opts: { platform?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ platforms: [], totals: { spend: 0, impressions: 0, clicks: 0, installs: 0 } }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] promo status · platform=${opts.platform ?? 'all'}`));
    // TODO: fan out AdPlatform.status() for each stored campaign id, aggregate + table render
  });

promoCmd
  .command('stop')
  .description('Pause or end campaigns')
  .option('--platform <id...>')
  .option('--id <campaignId>')
  .action((opts: { platform?: string[]; id?: string }) => {
    console.log(kleur.yellow(`[stub] promo stop · ${JSON.stringify(opts)}`));
    // TODO: resolve campaigns, invoke AdPlatform.stop()
  });

promoCmd
  .command('creatives')
  .description('Manage ad creatives (headlines, descriptions, images, videos)')
  .action(() => {
    console.log(kleur.dim('[stub] promo creatives — edit manifest.promo.creatives or upload assets to secrets vault'));
  });
