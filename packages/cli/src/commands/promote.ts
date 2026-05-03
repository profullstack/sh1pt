import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { runSetup, type AdapterWithSetup } from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';
import { merchCmd } from './merch.js';
import { shipCmd as shipSub } from './ship.js';
import { makeCliSetupContext } from '../setup-context.js';
import { ensureInstalled, loadInstalledPackage } from '../installer.js';

export const promoteCmd = new Command('promote')
  .description('Run ads + ship swag. Reddit, Meta, TikTok, Google, YouTube, X, Apple Search, LinkedIn, Microsoft — plus Printful/Printify merch.')
  .option('--platform <id...>', 'only launch on these platforms')
  .option('--budget <amount>', 'per-platform budget override', Number)
  .option('--duration <span>', 'e.g. 7d, 14d, 30d, ongoing')
  .option('--objective <kind>', 'install | web-traffic | awareness | engagement | signup | purchase', 'install')
  .option('--dry-run', 'validate creatives/targeting without launching')
  .option('--from <input>', 'existing live url, repo, local path, or manifest doc to promote')
  .action((opts: Record<string, unknown> & { from?: string }) => {
    if (opts.from) {
      const input = resolveInput(opts.from);
      const rest = { ...opts };
      delete rest.from;
      console.log(kleur.green('[stub] promote launch'), kleur.dim(`from=${describeInput(input)} ${JSON.stringify(rest)}`));
      // TODO: kind==='url' → crawl title/description/OG/screenshots to seed campaign;
      // kind==='git' → pull README + package.json + site links; kind==='doc' → parse
      // manifest.promo; kind==='path' → load local manifest.
      return;
    }
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
  .option('--check-min <usd>', 'minimum check size USD', Number)
  .option('--check-max <usd>', 'maximum check size USD', Number)
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

// Crowdfunding — equity (Wefunder, Republic) + reward (Kickstarter).
// Different from 1:1 investor outreach: mass-audience, public campaigns.
const crowdfundCmd = promoteCmd
  .command('crowdfund')
  .description('Crowdfunding — equity (Wefunder) + reward (Kickstarter, Indiegogo)');

crowdfundCmd
  .command('setup')
  .description('Connect a crowdfunding platform')
  .option('--provider <id>', 'promo-wefunder | promo-kickstarter | promo-indiegogo', 'promo-kickstarter')
  .action((opts: { provider: string }) => {
    console.log(kleur.cyan(`[stub] crowdfund setup · ${opts.provider}`));
  });

crowdfundCmd
  .command('launch')
  .description('Launch a campaign or post an update (legal filings must be completed manually first)')
  .option('--provider <id>')
  .option('--target <usd>', 'funding target in USD', Number)
  .option('--duration <days>', '', Number, 30)
  .action((opts) => {
    console.log(kleur.green(`[stub] crowdfund launch ${JSON.stringify(opts)}`));
  });

crowdfundCmd
  .command('status')
  .description('Pledges / backers / percent-funded across active campaigns')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ campaigns: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] crowdfund status'));
  });

// Organic social — cross-post to every connected network with per-platform
// adaptation (truncation, hashtag placement, media requirements).
const socialCmd = promoteCmd
  .command('social')
  .description('Post organically to X, LinkedIn, Instagram, Threads, TikTok, YouTube, Reddit, Mastodon, Bluesky');

// All 34 social adapters declare a real setup() (cookieSetup / oauthSetup /
// tokenSetup / manualSetup). This action fans them out: --platform picks
// a subset, otherwise we prompt. Each adapter is lazy-imported so missing
// packages print an install hint instead of crashing.
const SOCIAL_PLATFORMS = [
  '4claw', 'blossom', 'bluesky', 'codenewbie', 'devto', 'facebook', 'forem',
  'hackernews', 'hackernoon', 'hashnode', 'indiehackers', 'instagram', 'klawdin',
  'linkedin', 'mastodon', 'medium', 'moltbook', 'moltexchange', 'moltfounders',
  'moltywork', 'openwork', 'primal', 'quora', 'reddit', 'secureclaw', 'stackernews',
  'the-colony', 'threads', 'tikclawk', 'tiktok', 'toku-agency', 'ugig', 'x', 'youtube',
];

socialCmd
  .command('setup')
  .description('Connect social accounts — runs each platform adapter\'s setup (cookie paste / OAuth / token)')
  .option('--platform <id...>', 'e.g. x linkedin instagram (or social-x, social-linkedin)')
  .action(async (opts: { platform?: string[] }, cmd: Command) => {
    // Parent `promote` declares its own --platform <id...>, so when the user
    // types `sh1pt promote social setup --platform x y`, commander may bind
    // the values to the parent. optsWithGlobals() merges parent + child opts.
    const merged = cmd.optsWithGlobals() as { platform?: string[] };
    const requested = merged.platform ?? opts.platform;
    let names = (requested ?? []).map(stripSocialPrefix).filter(Boolean);

    if (names.length === 0) {
      const res = await prompts({
        type: 'multiselect',
        name: 'picks',
        message: 'Which platforms to set up?',
        choices: SOCIAL_PLATFORMS.map((p) => ({ title: p, value: p })),
        instructions: false,
        hint: 'space to select, return to confirm',
      });
      names = (res.picks as string[] | undefined) ?? [];
      if (names.length === 0) {
        console.log(kleur.dim('nothing selected — aborting.'));
        return;
      }
    }

    const wanted = names.map((n) => `@profullstack/sh1pt-social-${n}`);
    try {
      await ensureInstalled(wanted);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    const ctx = makeCliSetupContext();
    for (const name of names) {
      console.log();
      console.log(kleur.bold().underline(`social: ${name}`));
      const pkg = `@profullstack/sh1pt-social-${name}`;
      const adapter = await loadInstalledPackage<AdapterWithSetup>(pkg);
      if (!adapter || typeof adapter !== 'object' || !('id' in adapter)) {
        console.log(kleur.yellow(`  failed to load ${pkg} after install — file an issue.`));
        continue;
      }
      await runSetup(adapter, ctx);
    }
  });

function stripSocialPrefix(p: string): string {
  return p.replace(/^social-/, '').toLowerCase();
}

socialCmd
  .command('post')
  .description('Cross-post to every connected platform with per-platform adaptation')
  .requiredOption('--body <text>', 'core message — adapters truncate per their limits')
  .option('--title <text>', 'used for long-form (LinkedIn articles, Dev.to, Hashnode)')
  .option('--hashtags <list>', 'comma-separated, no #')
  .option('--media <path...>', 'images and/or videos — adapters enforce kind requirements')
  .option('--link <url>', 'CTA URL')
  .option('--platform <id...>', 'subset; default: all connected')
  .option('--schedule <iso>', 'publish at ISO timestamp; omit for now')
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.green(`[stub] social post ${JSON.stringify(opts)}`));
  });

socialCmd
  .command('metrics')
  .description('Aggregated engagement across recent posts')
  .option('--platform <id>')
  .option('--json')
  .action((opts: { platform?: string; json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ posts: [], totals: {} }, null, 2)); return; }
    console.log(kleur.dim('[stub] social metrics'));
  });

// Outreach umbrella — podcast booking, cold email, launch sites.
// Anything salesy we can automate beyond paid ads and public posts.
const outreachCmd = promoteCmd
  .command('outreach')
  .description('Podcasts, cold email, launch sites — anything salesy that scales');

outreachCmd
  .command('podcasts')
  .description('Discover relevant podcasts + send guest-pitch emails (Listen Notes + Resend)')
  .option('--niche <list>', 'comma-separated topic list', 'ai,startups,devtools')
  .option('--min-listeners <n>', 'minimum listener count filter', Number, 5000)
  .option('--language <code>', '', 'en')
  .option('--deck <path>', 'media kit / pitch deck')
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.green(`[stub] podcast outreach ${JSON.stringify(opts)}`));
  });

outreachCmd
  .command('email')
  .description('Cold email sequence via Resend — CAN-SPAM / CASL / GDPR compliance is your responsibility')
  .requiredOption('--recipients <csvPath>', 'CSV with email,name,company,...')
  .requiredOption('--subject <text>')
  .requiredOption('--body <path>', 'markdown/html body file with {{placeholders}}')
  .option('--from <addr>', 'must be a verified Resend domain')
  .option('--rate <perHour>', 'max sends per hour', Number, 20)
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.green(`[stub] email sequence ${JSON.stringify(opts)}`));
  });

outreachCmd
  .command('launch')
  .description('Schedule / coordinate a launch post on Product Hunt, BetaList, Hacker News Show, Indie Hackers')
  .option('--site <id...>', 'producthunt | betalist | hn-show | indiehackers', 'producthunt')
  .option('--schedule <iso>', 'launch time; PH prefers 12:01 AM PST')
  .option('--tagline <text>')
  .option('--gallery <path...>')
  .action((opts) => {
    console.log(kleur.green(`[stub] launch ${JSON.stringify(opts)}`));
  });

outreachCmd
  .command('status')
  .description('Open podcast pitches, active email sequences, upcoming launch slots')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ podcasts: [], email: [], launches: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] outreach status'));
  });

// Communications bridge — relay messages between Slack / Discord /
// IRC / Signal / Matrix / Mastodon / Nostr / Telegram.
const bridgeCmd = promoteCmd
  .command('bridge')
  .description('Bridge chat networks — Slack ↔ Discord ↔ IRC ↔ Signal ↔ Matrix ↔ Mastodon ↔ Nostr ↔ Telegram');

bridgeCmd
  .command('setup')
  .description('Connect a chat network (bot token / app password / nsec / IRC nick)')
  .option('--network <id...>', 'e.g. bridge-discord bridge-matrix bridge-irc')
  .action((opts: { network?: string[] }) => {
    console.log(kleur.cyan(`[stub] bridge setup · ${opts.network?.join(', ') ?? 'all declared'}`));
  });

bridgeCmd
  .command('connect <from> <to...>')
  .description('Define a relay route. Format: "<network>:<channel>". Repeatable destinations.')
  .option('--filter <rule...>', 'no-bots | no-pings | no-links | no-emojis')
  .action((from: string, to: string[], opts: { filter?: string[] }) => {
    console.log(kleur.green(`[stub] bridge connect ${from} → ${to.join(', ')}${opts.filter ? ` · filters=${opts.filter}` : ''}`));
  });

bridgeCmd
  .command('start')
  .description('Run the bridge daemon (persistent process — pair with deploy-fly for HA)')
  .option('--detach', 'background mode')
  .action((opts: { detach?: boolean }) => {
    console.log(kleur.green(`[stub] bridge start${opts.detach ? ' (detached)' : ' (foreground)'}`));
  });

bridgeCmd
  .command('stop')
  .description('Stop the bridge daemon')
  .action(() => { console.log(kleur.yellow('[stub] bridge stop')); });

bridgeCmd
  .command('status')
  .description('Active routes + message counts + last-seen per network')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ routes: [], networks: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] bridge status'));
  });

// Document generation — pitch decks, one-pagers, press kits, memos.
const docsCmd = promoteCmd
  .command('docs')
  .description('Generate pitch decks / one-pagers / press kits via Marp, Google Slides, pandoc, LuminPDF');

docsCmd
  .command('generate')
  .description('Produce a document from markdown + a template')
  .requiredOption('--kind <kind>', 'pitch-deck | one-pager | sales-deck | case-study | press-kit | whitepaper | proposal')
  .requiredOption('--format <fmt>', 'pdf | pptx | docx | html | md')
  .option('--markdown <path>', 'path to the source markdown', './deck.md')
  .option('--template <id>', 'Google Slides template presentation id, or Marp theme name, or pandoc reference doc path')
  .option('--provider <id>', 'docs-marp | docs-gslides | docs-pandoc | docs-lumin', 'docs-marp')
  .option('--out <path>', 'where to write the result', './.sh1pt/docs/')
  .option('--upload-to-lumin', 'after generation, upload the PDF to LuminPDF for a shareable viewer link')
  .action((opts) => {
    console.log(kleur.green(`[stub] docs generate ${JSON.stringify(opts)}`));
  });

docsCmd
  .command('list')
  .description('Recently generated docs')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ docs: [] }, null, 2)); return; }
    console.log(kleur.dim('[stub] docs list'));
  });
