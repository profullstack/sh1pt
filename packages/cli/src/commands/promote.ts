import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  runSetup,
  type AdapterWithSetup,
  type SocialPlatform,
  type SocialPost,
  getAdapterConfig,
  configDir,
} from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';
import { merchCmd } from './merch.js';
import { shipCmd as shipSub } from './ship.js';
import { makeCliSetupContext } from '../setup-context.js';
import { ensureInstalled, loadInstalledPackage } from '../installer.js';
import { runShell } from './build.js';

// ── file-based state helpers ──────────────────────────────────────────────────

async function atomicWritePromote(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function readJsonPromote<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

interface OutreachState {
  podcasts: Array<{ niche: string; minListeners: number; pitchedAt: string; dryRun: boolean }>;
  emails: Array<{ recipients: string; subject: string; sentAt: string; count: number; dryRun: boolean }>;
  launches: Array<{ sites: string[]; schedule?: string; tagline?: string; createdAt: string }>;
}
interface BridgeRoute { from: string; to: string[]; filters: string[]; addedAt: string; }
interface BridgeState { routes: BridgeRoute[]; networks: string[]; pid?: number; startedAt?: string; }
interface DocRecord { kind: string; format: string; provider: string; outPath: string; generatedAt: string; }

const OUTREACH_FILE = () => path.join(configDir(), 'promote-outreach.json');
const BRIDGE_FILE   = () => path.join(configDir(), 'promote-bridge.json');
const DOCS_FILE     = () => path.join(configDir(), 'promote-docs.json');
const BRIDGE_PID    = () => path.join(configDir(), 'promote-bridge.pid');

export const promoteCmd = new Command('promote')
  .description('Run ads + ship swag + list in affiliate marketplaces. Reddit, Meta, TikTok, Google, YouTube, X, Apple Search, LinkedIn, Microsoft — plus Printful/Printify merch and CJ/Rakuten/Impact/etc affiliate programs.')
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
  .description('Search investor database and export CSW without launching')
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
  .description('Post organically to X, LinkedIn, Instagram, Facebook, Threads, TikTok, YouTube, Pinterest, Reddit, Snapchat, Discord, Telegram, Twitch, Tumblr, Vimeo, Spotify, Mastodon, Bluesky, Nostr, and more');

// All 43 social adapters declare a real setup() (cookieSetup / oauthSetup /
// tokenSetup / webhookUrlSetup / manualSetup). This action fans them out: --platform picks
// a subset, otherwise we prompt. Each adapter is lazy-imported so missing
// packages print an install hint instead of crashing.
const SOCIAL_PLATFORMS = [
  '4claw', 'blossom', 'bluesky', 'codenewbie', 'devto', 'discord', 'facebook',
  'forem', 'hackernews', 'hackernoon', 'hashnode', 'indiehackers', 'instagram',
  'klawdin', 'linkedin', 'mastodon', 'medium', 'moltbook', 'moltexchange',
  'moltfounders', 'moltywork', 'nostr', 'openwork', 'pinterest', 'primal',
  'quora', 'reddit', 'secureclaw', 'snapchat', 'spotify', 'stackernews',
  'telegram', 'the-colony', 'threads', 'tikclawk', 'tiktok', 'toku-agency',
  'tumblr', 'twitch', 'ugig', 'vimeo', 'x', 'youtube',
];

socialCmd
  .command('setup')
  .description('Connect social accounts — runs each platform adapter\'s setup (cookie paste / OAuth / token)')
  .option('--platform <id...>', 'e.g. x linkedin instagram (or social-x, social-linkedin)")
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

// OAuth app registration guide — many social platforms require you to
// register an OAuth application before you can obtain API tokens.
// This command shows the per-platform registration steps + stores the
// resulting client_id / client_secret in the vault.
interface OAuthRegistrationGuide {
  platform: string;
  label: string;
  url: string;
  docUrl: string;
  redirectUris: string[];
  scopes: string[];
  steps: string[];
}

const OAUTH_REGISTRATION_GUIDES: OAuthRegistrationGuide[] = [
  {
    platform: 'facebook',
    label: 'Facebook / Meta',
    url: 'https://developers.facebook.com/apps/',
    docUrl: 'https://developers.facebook.com/docs/development/create-an-app/',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
    steps: [
      'Go to https://developers.facebook.com/apps/ and click "Create App"',
      'Choose "Business" as the app type',
      'Add the "Facebook Page" and "Instagram Basic Display" products',
      'Under "Settings → Basic", note your App ID and App Secret',
      'Add the redirect URIs listed below to "Settings → Advanced → OAuth Settings"',
      'Submit "pages_manage_posts", "pages_read_engagement", and "pages_show_list" for App Review',
    ],
  },
  {
    platform: 'x',
    label: 'X (Twitter)',
    url: 'https://developer.x.com/en/portal/projects-and-apps',
    docUrl: 'https://developer.x.com/en/docs/authentication/oauth-2-0/user-access-token',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    steps: [
      'Go to https://developer.x.com/en/portal/projects-and-apps',
      'Create a Project, then create an App within it',
      'Under "User authentication settings", enable OAuth 2.0 with PKCE',
      'Add the redirect UTRIs listed below under "Callback URI / Redirect URL"',
      'Select "Read and Write" (and "Read and Write and Direct Message" if needed) permissions',
      'Copy your Client ID (no client secret for PKCE)',
    ],
  },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/developers/apps/new',
    docUrl: 'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['w_member_social', 'r_liteprofile', 'r_emailaddress'],
    steps: [
      'Go to https://www.linkedin.com/developers/apps/new and create an app',
      'Under "Auth" tab, note your Client ID and Client Secret',
      'Add the redirect URIs listed below under "Authorized redirect URLs for your app"',
      'Request the "Share on LinkedIn" (w_member_social) product on the "Products" tab',
    ],
  },
  {
    platform: 'instagram',
    label: 'Instagram (Basic Display)',
    url: 'https://developers.facebook.com/apps/',
    docUrl: 'https://developers.facebook.com/docs/instagram-basic-display-api/getting-started',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
    steps: [
      'Create or nuse an existing Meta Business app at https://developers.facebook.com/apps/',
      'Add the "Instagram Basic Display" product',
      'Under Instagram Basic Display → "Basic Display", configure OAuth redirect URIs',
      'Note your App ID and App Secret from Settings → Basic',
    ],
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    url: 'https://developers.tiktok.��K�\������\��	�΋��]�[�\�˝Z��˘��K���[Y[�][ۋ���[�Z�]]�X��X[�Y�K]\�\�]��[������Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��\�\��[��˘�\�X��	ݚY[˜X�\�	�	ݚY[˝\�Y	�K��\Έ	����΋��]�[�\�˝Z��˘��K�\��[��X���ܙX]H\���	њ[[�[�\�\�[YK\�ܚ\[ۋ[�\�YX�ۜ���	�YH�Y\�X�T�\�\�Y�[��[�\���Y\�X�T����	�[�X�HH���[��]�[���۝[�X�\�[�Ȉ\�Z\��[ۜ���	���H[�\��Y[��^H
\Q
H[��Y[��Xܙ]	��K�K�]�ܛN�	ܙY]	��X�[�	ԙY]	��\��	�΋����˜�Y]���K��Y���\�����\��	�΋���]X����KܙY]X\��]�KܙY]��Z�K��]]����Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��Y[�]I�	��X�Z]	�	ܙXY	�	�Y]	�K��\Έ	����΋����˜�Y]���K��Y���\�[��X���ܙX]H[��\�\8�)����	�����H��X�\�\I��	��]H�Y\�X�T�H����L�ˌ��N�
͍K��[�X����	ӛ�H[�\��Y[�Q
H��[��[�\�H\�[YJH[��Y[��Xܙ]	��K�K�]�ܛN�	�����I��X�[�	�����H
[�UX�JI��\��	�΋���ۜ��K���Y�����K���K�\\��ܙY[�X[�����\��	�΋��]�[�\�˙����K���K�[�]X�KܙY�\�\�[���[��\X�][ۉ���Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��΋����˙����X\\˘��K�]]�[�]X�K��ܘ�K\��	�	�΋����˙����X\\˘��K�]]�[�]X�K�\�Y	�K��\Έ	����΋���ۜ��K���Y�����K���K�\\��ܙY[�X[�[�ܙX]HH�ڙX�	��	�[�X�HH[�UX�H]HTH�����H�X��\�H���	�ܙX]H�]]���Y[�Q8�����X�\X�][ۈ���	�YH�Y\�X�T�\�\�Y�[��[�\��]]ܚ^�Y�Y\�X�T�\ȉ��	���H[�\��Y[�Q[��Y[��Xܙ]	��K�K�]�ܛN�	��]X���X�[�	��]X���\��	�΋���]X����K��][����]�[�\������\��	�΋����˙�]X����K�[��\���]]X\�؝Z[[��[�]]X\��ܙX][��X[�[�]]X\	���Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ�ܙ\��	��ܚٛ���	�\�\��K��\Έ	����΋���]X����K��][����]�[�\��[��X����]��]]\���	њ[[�\X�][ۈ�[YK�Y\Y�HT�[�]]ܚ^�][ۈ�[�X��T�	��	�YH�Y\�X�T�\�\�Y�[����	��X����Y�\�\�\X�][ۈ���	���H[�\��Y[�Q[��[�\�]H
���HH�Y[��Xܙ]	��K�K�]�ܛN�	�\��ܙ	��X�[�	�\��ܙ	��\��	�΋��\��ܙ���K�]�[�\���\X�][ۜ�����\��	�΋��\��ܙ���K�]�[�\��������X����]]����Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��Y[�Y�I�	��Z[��	؛�	�	��X���˚[���Z[���K��\Έ	����΋��\��ܙ���K�]�[�\���\X�][ۜ�[��X����]�\X�][ۈ���	����H��]]��Y�H[���H[�\��Y[�Q[��Y[��Xܙ]	��	�YH�Y\�X�T�\�\�Y�[����	�Y�\�[��H���������Y�H[�ܙX]H
���HH����[���K�K�]�ܛN�	�[�\�\�	��X�[�	�[�\�\�	��\��	�΋��]�[�\�˜[�\�\����K�\������\��	�΋��]�[�\�˜[�\�\����K������][��\�\�Y��]]\X\����Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ�؛�\�Μ�XY	�	؛�\�Νܚ]I�	�[�Μ�XY	�	�[�Νܚ]I�	�\�\��X���[�Μ�XY	�K��\Έ	����΋��]�[�\�˜[�\�\����K�\��[��X���ܙX]H\���	њ[[�[�\�\�[YH[�\�ܚ\[ۉ��	�YH�Y\�X�T�\�\�Y�[��[�\���Y\�X�T�\ȉ��	���H[�\�\Q[�\�Xܙ]	��K�K�]�ܛN�	���Y�I��X�[�	���Y�I��\��	�΋��]�[�\����Y�K���K�\���\�	����\��	�΋��]�[�\����Y�K���K���[Y[�][ۋ��X�X\K�]ܚX[���][��\�\�Y	���Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��\�\�\�XY\�]�]I�	�\�\�\�XYY[XZ[	�	�^[\�[[�Y�K\X�X��	�^[\�[[�Y�K\�]�]I�K��\Έ	����΋��]�[�\����Y�K���K�\���\�[��X���ܙX]H\���	њ[[�H\�[YH[�\�ܚ\[ۉ��	�YH�Y\�X�T�\�\�Y�[��[�\���Y\�X�T�\ȉ��	���H[�\��Y[�Q[��Y[��Xܙ]	��K�K�]�ܛN�	�ۘ\�]	��X�[�	�ۘ\�]	��\��	�΋���]�ۘ\�]���K�ܝ[	����\��	�΋����˜ۘ\���K�ۘ\Z�]�ۘ\Z�][ݙ\��Y]����Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��ۘ\�][X\��][��X\I�	؝\�[�\���X[�Y�\��K��\Έ	����΋���]�ۘ\�]���K�ܝ[[���[��]H�\�[�\��X���[�	��	�ܙX]HH�]�\[�\�H�\�[�\��ܝ[	��	�[�X�HH�]]���Y[�[�YH�Y\�X�T�\�\�Y�[����	���H[�\��]]�Y[�Q[��Y[��Xܙ]	��K�K�]�ܛN�	��]�	��X�[�	��]�	��\��	�΋��]���]�����ۜ��K�\�����\��	�΋��]���]��������]][�X�][ۋܙY�\�\�X\����Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��\�\���XY�[XZ[	�	��]��XY	�	��]�Y]	�	��[��[�X[�Y�N����Y�\�	�K��\Έ	����΋��]���]�����ۜ��K�\�[��X����Y�\�\�[�\�\X�][ۈ���	�[�\�H�[YKYH�Y\�X�T�\�\�Y�[��[��[X���]���܈��\���]Y�ܞI��	���H[�\��Y[�Q	��	��X����]��Xܙ]���[�\�]H[���HH�Y[��Xܙ]	��K�K�]�ܛN�	�ZXܛ��ٝ	��X�[�	�ZXܛ��ٝ
^�\�HQ�[��Y[�I��\��	�΋��ܝ[�^�\�K���K�ݚY]��ZXܛ��ٝ�PQԙY�\�\�Y\��\X�][ۜ�\��YI����\��	�΋��X\���ZXܛ��ٝ���K�[�]\��^�\�K�X�]�KY\�X�ܞK�]�[��]ZX���\�\�Y�\�\�X\	���Y\�X�\�\Έ�����L�ˌ��N�
͍K��[�X���	�΋���\���K�]]��[�X���K����\Έ��\�\���XY	�	�XZ[��[�	�	њ[\˔�XYܚ]I�K��\Έ	����^�\�Hܝ[8���\�Y�\��][ۜ�8�����]��Y�\��][ۈ���	�[�\�H�[YH[��[X��X���[��[�[�Hܙ�[�^�][ۘ[\�X�ܞH���	�YH�Y\�X�T�\�\�Y�[��
\N��X�I��	���H[�\�\X�][ۈ
�Y[�
HQ	��	�ܙX]HH�Y[��Xܙ][�\���\�Y�X�]\�	��Xܙ]Ȉ[���H]	��K�K�N����X[�Y����[X[�
	ܙY�\�\��B��\�ܚ\[ۊ	��[���Y��Y�\�\�[��[��]]\ۈH���X[]�ܛH
ܙX]\��Y[��Y��Y[���Xܙ][��][
I�B���[ۊ	�K\]�ܛHY��	��X�]�ܛH��Y�\�\�ۈ
K�ˈ�X�X����[��Y[�Z����Y]����K�]X�\��ܙ[�\�\���Y�K�]�
I�B���[ۊ	�K[\�	�	�\�[]�ܛ\��]�Y�\��][ۈ�ZY\��B��X�[ۊ\�[��
�Έ�]�ܛOΈ��[���\�Έ���X[�JHO�Y�
�˛\�
H�ۜ��K����]\����
	���]]\�Y�\��][ۈ�ZY\���JN�܈
�ۜ��ZYHو�UUԑQ�T��USӗ��RQT�H�ۜ��K���	��]\���X[��ZYK�]�ܛK�Y[�
L�J_H	��ZYK�X�[X
NB��ۜ��K����]\��[J��[���\��[�H���X[�Y�\�\�K\]�ܛHY�
JN�]\��B��]\��]H�˜]�ܛNY�
]\��]
H�ۜ��\�H]�Z]��\�\N�	��[X�	���[YN�	�]�ܛI��Y\��Y�N�	��X�]�ܛH�[�H�YY��Y�\�\�[��]]\ۏ�����X�\Έ�UUԑQ�T��USӗ��RQT˛X\

�HO�
�]N�	�˛X�[H
	�˜]�ܛ_JX�[YN�˜]�ܛHJJK�JN\��]H�\˜]�ܛH\���[��B���ۜ��ZYHH�UUԑQ�T��USӗ��RQT˙�[�

�HO�˜]�ܛHOOH\��]˜]�ܛHOOH\��]��\X�Jל���X[K�	��JNY�
Y�ZYJH�ۜ��K����]\���Y
���Y�\��][ۈ�ZYH�܈��\��]H��
JN�ۜ��K����]\��[J�[���\��[�H���X[�Y�\�\�K[\�
JN�]\��B���ۜ��K���
N�ۜ��K����]\����

K�[�\�[�J�Y�\�\�H	��ZYK�X�[H�]]\
JN�ۜ��K���
N��܈
�ۜ��\و�ZYK��\�H�ۜ��K���	��]\���X[�	��(��_H	��\X
NB���ۜ��K���
N�ۜ��K����]\��[J�\]Z\�Y�Y\�X�T�\Θ
JN�܈
�ۜ�\�Hو�ZYK��Y\�X�\�\�H�ۜ��K���	��]\��Y[��\�J_X
NB��ۜ��K���
N�ۜ��K����]\��[J�\]Z\�Y�]]���\Θ
JN�܈
�ۜ����Hو�ZYK����\�H�ۜ��K���	��]\��ܙY[����J_X
NB���ۜ��K���
N�ۜ���\�H�ZYK���\��ۜ��K����]\��[J��Έ	���\�X
JN�ۜ��K����]\��[Jܝ[�	��ZYK�\�X
JN�ۜ��K���
N��ۜ��HXZ�P�T�]\�۝^

N�ۜ��Y[�YH]�Z]����\��[�ϊ\N�	�^	��Y\��Y�N�	�[�\�H�Y[�Q�\Q���HH]�ܛN���JNY�
�Y[�Y
H]�Z]���]�Xܙ]
	��ZYK�]�ܛK��\\��\�J
_W��QS��Q�Y[�Y
NB���ۜ��Y[��Xܙ]H]�Z]����\��[�ϊ\N�	�\���ܙ	��Y\��Y�N�	�[�\�H�Y[��Xܙ]�\�Xܙ]
܈X]�H�[��Y���JN���JNY�
�Y[��Xܙ]
H]�Z]���]�Xܙ]
	��ZYK�]�ܛK��\\��\�J
_W��QS���PԑU�Y[��Xܙ]
NB���ۜ��K���
N�ۜ��K����]\��ܙY[�8�$��]]\�Y�\��][ۈ]Z[��]�Y�܈	��ZYK�X�[K�
JN�ۜ��K����]\��[J�^�\��[���\��[�H���X[�]\K\]�ܛH	��ZYK�]�ܛ_H����\]HH�]]��˘
JNJN��[��[ۈ��\���X[�Y�^
���[��N���[���]\����\X�Jל���X[K�	��K����\��\�J
NB���[��[ۈ[��\�YYXR�[�
�[N���[��N�	�[XY�I�	ݚY[��	��Y���ۜ���\�H�[K����\��\�J
NY�
��\��[���]
	˙�Y��JH�]\��	��Y��Y�
��\
[ݟ]�_�X�_Z݊I˝\�
��\�JH�]\��	ݚY[���]\��	�[XY�I�B�����X[�Y����[X[�
	���	�B��\�ܚ\[ۊ	�ܛ���\���]�\�H�ۛ�X�Y]�ܛH�]\�\]�ܛHY\][ۉ�B���\]Z\�Y�[ۊ	�KX��H^��	��ܙHY\��Y�H8�%Y\\���[��]H\�Z\�[Z]��B���[ۊ	�K]]H^��	�\�Y�܈ۙ�Y�ܛH
[��Y[�\�X�\�]���\���JI�B���[ۊ	�KZ\�Y��\���	���[XK\�\\�]Y����B���[ۊ	�K[YYXH]�����	�[XY�\�[��܈�Y[��8�%Y\\��[��ܘ�H�[��\]Z\�[Y[���B���[ۊ	�K[[��\���	��HT�	�B���[ۊ	�K\]�ܛHY�����	��X��]�Y�][�[�ۛ�X�Y	�B���[ۊ	�K\��Y[H\�ω�	�X�\�]T��[Y\�[\��Z]�܈����B���[ۊ	�KY�K\�[��B��X�[ۊ\�[��
�Έ��N���[��]OΈ��[��\�Y��Έ��[��YYXOΈ��[���N[��Έ��[��]�ܛOΈ��[���N��Y[OΈ��[���T�[�Έ���X[�JHO��ۜ�������X[��H��N��˘��K�]N��˝]K�\�Y�Έ�˚\�Y����˚\�Y�˜�]
	�	�K�X\


HO���[J
JK��[\����X[�H�[�Y�[�Y�YYXN��˛YYXO˛X\

�[JHO�
��[K�[��[��\�YYXR�[�
�[JHJJK�[�Έ�˛[�����Y[N��˜��Y[H��]�]J�˜��Y[JH�[�Y�[�Y�N��ۜ��[Y\�H
�˜]�ܛH�����PS�U�ԓT�K�X\
��\���X[�Y�^
K��[\����X[�N�Y�
�˙�T�[�H�ۜ��K����]\���X[�	��K\�[�����X[���]�Y]���JN�܈
�ۜ��[YHو�[Y\�H�ۜ���H�ٝ[�X����\\���X[Iۘ[Y_X]Y\\�����X[]�ܛO[�ۛ�ۏ�[�Y�[�Y�HY\\�H]�Z]�Y[��[YX��Y�O���X[]�ܛO[�ۛ�ۏ����NH�]�����[��[Y8�%��\�B�Y�
XY\\�H�ۜ��K����]\��[J	ۘ[Y_N���[��[Y8�%�[���\��[�H���X[�]\K\]�ܛH	ۘ[Y_X
JN�۝[�YNB��ۜ�X^HY\\���\]Z\�\�˛X^��P�\���ۜ��[��]YHX^	�������K�[���X^������K��X�JX^H�H
�	ˋ���������N�ۜ��K����]\����
	�Y\\��X�[���[Y_X
JN�ۜ��K�����H
	��[��]Y�[��H�\��N�	��[��]Y��X�J
_I��[��]Y�[����	��)���	��X
NY�
���\�Y��˛[��
H�ۜ��K���\�Y�Έ	����\�Y�˛X\


HO���X
K���[�	�	�_X
NY�
���[��H�ۜ��K���[�Έ	����[��X
NY�
�����Y[JH�ۜ��K�����Y[N�	������Y[K��T����[��
_X
NB��]\��B��][�T��YH�[�N�܈
�ۜ��[YHو�[Y\�H�ۜ���H�ٝ[�X����\\���X[Iۘ[Y_X]Y\\�����X[]�ܛO[�ۛ�ۏ�[�Y�[�Y�HY\\�H]�Z]�Y[��[YX��Y�O���X[]�ܛO[�ۛ�ۏ����NH�]�����[��[Y�B�Y�
XY\\�H�ۜ��K����]\��[J	ۘ[Y_N���[��[Y8�%��\[��
JN�۝[�YNB���ۜ�Y\\��ۙ�Y�H]�Z]�]Y\\��ۙ�Y�Y\\��Y
NY�
XY\\��ۙ�Y�H�ۜ��K����]\��Y[��	ۘ[Y_N����ۙ�Y�\�Y8�%�[���\��[�H���X[�]\K\]�ܛH	ۘ[Y_X
JN�۝[�YNB���ۜ��H�Xܙ]�
Έ��[��HO����\�˙[����K��Έ
N���[��HO��ۜ��K����]\��[J�ۘ[Y_WH	�_X
JK��T�[���[�K�N��H�ۜ��K����]\����
��[���	�Y\\��X�[���[Y_x�)�
JN]�Z]Y\\���ۛ�X�
�Y\\��ۙ�Y�N�ۜ��\�[H]�Z]Y\\����
���Y\\��ۙ�Y�N�ۜ��K����]\��ܙY[�8�$�	�Y\\��X�[���[Y_H0��	ܙ\�[�\�X
JN[�T��YH�YNH�]�
\��H�ۜ��K�\��܊�]\���Y
8�%�	ۘ[Y_N�	�\��[��[��[و\��܈�\���Y\��Y�H���[��\��_X
JNB�B��Y�
X[�T��Y
H�ۜ��K����]\��Y[��	����]�ܛ\���Y8�%�]\X���[���]��\��[�H���X[�]\	�JNB�JN����X[�Y����[X[�
	�Y]�X���B��\�ܚ\[ۊ	�Y�ܙY�]Y[��Y�[Y[�Xܛ����X�[�����B���[ۊ	�K\]�ܛHY��B���[ۊ	�KZ��ۉ�B��X�[ۊ
�Έ�]�ܛOΈ��[�����ۏΈ���X[�JHO�Y�
�˚��ۊH��ۜ��K�����Ӌ���[��Y�J���Έ�K�[Έ�HK�[�JN��]\���B��ۜ��K����]\��[J	���X�H���X[Y]�X���JNJN���RH�ݚY\��8�%�[�\�]HY��H����X[��Y\��Y�[�\����HB�����\�\�[�����HY�[���
�X�ܘ\�[��[Y�H�[�\�Y\��Z�H�]YX���^
N�\�\�PTKX�\�Y�۝[��[�\�][ۂ����^YYٙ��ݚY\�TH�^\�[[�H�][���ۜ�RW�U�ԓT�H���X[[�Yܘ][ۜ	��]YI�	��[�ZI�	�]�[��	��[Z[�I�����S���X��
�[���]\�X��\]X�H�ݚY\��8�%[\[Y[�][ۜ�[�����\�KX�KX�\�N��]\

H��X��HTH�^H[��H�][�^JB�	�ZL�I�	�Z[ۛX���	�Z�\�[	�	�[X�X�KX��Y	�	�[X^�ۋX�Y�����	�\��YI��	�]\���Y	�	�^�\�I�	ؘZYI�	ؘ\�][��	��\�X��\��	��]\��	��\�Y�ZI��	���Y�\�I�	���\�I�	�Y\[���I�	�Y\�YZ��	ٙX]\�\���	ٚ\�]�ܚ����	ٜ�Y[�I�	��ZX��Y	�	�����K]�\�^	�	�ܛ�I�	�[��\[ۉ�	�[��\�ۉ��	�[��\�X]X��	�[��X�[ۉ�	�[ۙ]	�	��[ZI�	�\]ZY	�	�X[��\��	�Z[�[X^	��	�Z\��[	�	�[�ۜ��	�	�[ܜ	�	ۙX�]\��	ۙ^�]	�	ۛݚ]I��	��[�[��\�[��I�	�\�\�Z[	�	�\��\�ۉ�	�\�^]I�	�[I�	ܙZ�I��	ܙ[X�I�	��[X�[�ݘI�	��[X�ۙ����	��\�[��	���]��[�	�	���]\���	ݙ[�X�I�	��[���	�ZI�	�X[�ZI�	ޘZI��N��ۜ�ZP�YH��[�P�Y����[X[�
	�ZI�B��\�ܚ\[ۊ	��ۙ�Y�\�HRH�ݚY\��
�]YK�[�RK]�[��[Z[�H
�
L
��S���X��H\�Y��Y�Y��H[�����Y\��N�ZP�Y����[X[�
	��]\	�B��\�ܚ\[ۊ��ۛ�X�RH�ݚY\��8�%�[��XX��ݚY\�Y\\����]\
TH�^H\�JH�B���[ۊ	�K\]�ܛHY�����	�K�ˈ�]YH�[�ZH
܈ZKX�]YKZK[�[�ZJI�B��X�[ۊ\�[��
�Έ�]�ܛOΈ��[���HK�Y���[X[�
HO��ۜ�Y\��YH�Y����]�ؘ[�
H\��]�ܛOΈ��[���HN�ۜ��\]Y\�YHY\��Y�]�ܛH���˜]�ܛN]�[Y\�H
�\]Y\�Y���JK�X\
��\ZT�Y�^
K��[\����X[�N�Y�
�[Y\˛[��OOH
H�ۜ��\�H]�Z]��\�\N�	�][\�[X�	���[YN�	�X�����Y\��Y�N�	��X�RH�ݚY\����]\�����X�\ΈRW�U�ԓT˛X\


HO�
�]N��[YN�JJK�[���X�[ۜΈ�[�K�[��	��X�H��[X��]\����ۙ�\�I��JN�[Y\�H
�\˜X���\���[���H[�Y�[�Y
H���NY�
�[Y\˛[��OOH
H�ۜ��K����]\��[J	ۛ�[���[X�Y8�%X�ܝ[�ˉ�JN�]\��B�B���ۜ��[�YH�[Y\˛X\

�HO��ٝ[�X����\XZKI۟X
N�H]�Z][��\�R[��[Y
�[�Y
NH�]�
\��H�ۜ��K�\��܊�]\���Y
\��[��[��[و\��܈�\���Y\��Y�H���[��\��JJN���\�˙^]
JNB���ۜ��HXZ�P�T�]\�۝^

N�܈
�ۜ��[YHو�[Y\�H�ۜ��K���
N�ۜ��K����]\����

K�[�\�[�JZN�	ۘ[Y_X
JN�ۜ���H�ٝ[�X����\XZKIۘ[Y_X�ۜ�Y\\�H]�Z]�Y[��[YX��Y�OY\\��]�]\���NY�
XY\\�\[وY\\�OOH	�ؚ�X�	�J	�Y	�[�Y\\�JH�ۜ��K����]\��Y[���Z[Y��Y	���HY�\�[��[8�%�[H[�\��YK�
JN�۝[�YNB�]�Z]�[��]\
Y\\��
NB�JN��[��[ۈ��\ZT�Y�^
���[��N���[���]\����\X�JטZKK�	��K����\��\�J
NB����Y��[X]K[�]�ܚ�X\��]X�\�8�%�\�\�و���X[[�ZX�]�܂���\��ܛX[��H\��\�ˈ�\\�\�\�\X�[HHY\��[�
\�[���Z\���X�[�H�]�ܚ���X�\�\���[���[�H]�܈B�����[Z\��[ۊK�Y�X[�H�]�ܚ���\ܝ���Y\˂��ۜ�Q��SPUWӑU�Ԓ��H	�ډ�	ܘZ�][��	��\�X\�[I�	�]�[��	�[\X�	�	�\��\��X���	ܙY�\��[ۉ��	�[X^�ۋX\����X]\��	�X�^K\\��\��	��X�ؘ[���	���[[[����	��ݜ����	ٛ^ٙ�\���	�]�[��]I�	��YY�X�\��	ڝ�����	�Y�\�ܙL�	��	�\�[X]I�	�]�\�����	�YZ]Y	��N��ۜ�Y��[X]\��YH��[�P�Y����[X[�
	�Y��[X]\��B��\�ܚ\[ۊ	�Y��[X]H�]�ܚ�X\��]X�\�8�%ҋ�Z�][��\�PT�[K]�[�[\X�[X^�ۈ\����X]\��X�И[��[�[ܙI�N�Y��[X]\��Y����[X[�
	��]\	�B��\�ܚ\[ۊ��ۛ�X�Y��[X]H�]�ܚ��8�%�[��XX��]�ܚ�Y\\����]\
TH�^H\�JH�B���[ۊ	�K[�]�ܚ�Y�����	�K�ˈڈ�Z�][�[\X�
܈Y��[X]KXڋY��[X]KZ[\X�
I�B��X�[ۊ\�[��
�Έ��]�ܚ�Έ��[���HK�Y���[X[�
HO��ۜ�Y\��YH�Y����]�ؘ[�
H\���]�ܚ�Έ��[���N�]�ܛOΈ��[���HN�ۜ��\]Y\�YHY\��Y��]�ܚ����˛�]�ܚ���Y\��Y�]�ܛN]�[Y\�H
�\]Y\�Y���JK�X\
��\Y��[X]T�Y�^
K��[\����X[�N�Y�
�[Y\˛[��OOH
H�ۜ��\�H]�Z]��\�\N�	�][\�[X�	���[YN�	�X�����Y\��Y�N�	��X�Y��[X]H�]�ܚ����]\�����X�\ΈQ��SPUWӑU�Ԓ�˛X\


HO�
�]N��[YN�JJK�[���X�[ۜΈ�[�K�[��	��X�H��[X��]\����ۙ�\�I��JN�[Y\�H
�\˜X���\���[���H[�Y�[�Y
H���NY�
�[Y\˛[��OOH
H�ۜ��K����]\��[J	ۛ�[���[X�Y8�%X�ܝ[�ˉ�JN�]\��B�B���ۜ��[�YH�[Y\˛X\

�HO��ٝ[�X����\XY��[X]KI۟X
N�H]�Z][��\�R[��[Y
�[�Y
NH�]�
\��H�ۜ��K�\��܊�]\���Y
\��[��[��[و\��܈�\���Y\��Y�H���[��\��JJN���\�˙^]
JNB���ۜ��HXZ�P�T�]\�۝^

N�܈
�ۜ��[YHو�[Y\�H�ۜ��K���
N�ۜ��K����]\����

K�[�\�[�JY��[X]N�	ۘ[Y_X
JN�ۜ���H�ٝ[�X����\XY��[X]KIۘ[Y_X�ۜ�Y\\�H]�Z]�Y[��[YX��Y�OY\\��]�]\���NY�
XY\\�\[وY\\�OOH	�ؚ�X�	�J	�Y	�[�Y\\�JH�ۜ��K����]\��Y[���Z[Y��Y	���HY�\�[��[8�%�[H[�\��YK�
JN�۝[�YNB�]�Z]�[��]\
Y\\��
NB�JN��[��[ۈ��\Y��[X]T�Y�^
���[��N���[���]\����\X�JטY��[X]KK�	��K����\��\�J
NB��Y��[X]\��Y����[X[�
	�\�	�B��\�ܚ\[ۊ	�\�]�Z[X�HY��[X]H�]�ܚ�Y\\���B���[ۊ	�KZ��ۉ�B��X�[ۊ
�Έ���ۏΈ���X[�JHO�Y�
�˚��ۊH�ۜ��K�����Ӌ���[��Y�J��]�ܚ�ΈQ��SPUWӑU�Ԓ��K�[�JN�]\��B��ۜ��K����]\��[J]�Z[X�N�	�Q��SPUWӑU�Ԓ�˚��[�	�	�_X
JNJN�Y��[X]\��Y����[X[�
	�ܙX]K\��ܘ[I�B��\�ܚ\[ۊ	�\�[�\���X�\�HY\��[���ܘ[H[�H�ۛ�X�Y�]�ܚ��B���\]Z\�Y�[ۊ	�K[�]�ܚ�Y��	�K�ˈڋ[\X�\��\��X���B���\]Z\�Y�[ۊ	�K[�[YH^��	���ܘ[H�[YI�B���\]Z\�Y�[ۊ	�KY\�[�][ۈ\���	��\�H�X�����[[�	�B���[ۊ	�KX��[Z\��[ۈ�]O��	۝[Y\�X�8�%�H�	H
\��[�Y�JH܈�H	�
�]
I��[X�\��
B���[ۊ	�KX��[Z\��[ۋ]\H�[���	�\��[�Y�H�]Y\�Y	�	�\��[�Y�I�B���[ۊ	�KX����YKY^\����	�]�X�][ۈ�[�����[X�\��
B���[ۊ	�KX�]Y�ܞH�[���	��X\�X��[Y\��H�[�[��H�\��	��X\��B���[ۊ	�KX�\��[��H��O��	�T��
�M�
�܈�]��[Z\��[ۜ�I�	�T�	�B���[ۊ	�KY�K\�[��B��X�[ۊ
��HO��ۜ��K����]\��ܙY[���X�HY��[X]\�ܙX]K\��ܘ[H	Ҕ�Ӌ���[��Y�J��_X
JNJN�Y��[X]\��Y����[X[�
	��]��B��\�ܚ\[ۊ	�Y�ܙY�]Y�X�����۝�\��[ۜ����[Z\��[ۜ�Xܛ����]�ܚ���B���[ۊ	�K[�]�ܚ�Y��	ٚ[\��ۙH�]�ܚ��B���[ۊ	�KZ��ۉ�B��X�[ۊ
�Έ��]�ܚ�Έ��[�����ۏΈ���X[�JHO�Y�
�˚��ۊH�ۜ��K�����Ӌ���[��Y�J��]�ܚ�Έ�K�[Έ�X�\�\�Έ�X��Έ�۝�\��[ۜΈ�]�[�YN���[Z\��[ۜ�ZY�HK�[�JN�]\��B��ۜ��K����]\��[J��X�HY��[X]\��]�0���]�ܚ�I��˛�]�ܚ���	�[	�X
JNJN�ZP�Y����[X[�
	�\�	�B��\�ܚ\[ۊ	�\��ۙ�Y�\�YRH�ݚY\���B���[ۊ	�KZ��ۉ�B��X�[ۊ
�Έ���ۏΈ���X[�JHO�Y�
�˚��ۊH��ۜ��K�����Ӌ���[��Y�J��ݚY\�ΈRW�U�ԓT�K�[�JN��]\���B��ۜ��K����]\��[J]�Z[X�N�	�RW�U�ԓT˚��[�	�	�_X
JNJN����]�XX�[X��[H8�%��\�����[����[XZ[][���]\˂���[�][���[\�H�H�[�]]�X]H�^[ۙZYY�[�X�X���˂��ۜ��]�XX��YH��[�P�Y����[X[�
	��]�XX�	�B��\�ܚ\[ۊ	���\����[XZ[][���]\�8�%[�][���[\�H]��[\��N��]�XX��Y����[X[�
	���\���B��\�ܚ\[ۊ	�\��ݙ\��[]�[���\��
��[��Y\�\]�[XZ[�
\�[���\�
��\�[�
I�B���[ۊ	�K[�X�H\���	���[XK\�\\�]Y�X�\�	�	�ZK�\�\�]�����B���[ۊ	�K[Z[�[\�[�\�����	�Z[�[][H\�[�\���[��[\���[X�\�
L
B���[ۊ	�K[[��XY�H��O��	��	�[��B���[ۊ	�KYX��]��	�YYXH�]�]�X���B���[ۊ	�KY�K\�[��B��X�[ۊ\�[��
�Έ��X�N���[���Z[�\�[�\�Έ�[X�\��[��XY�N���[���X��Έ��[����T�[�Έ���X[�JHO��ۜ��X�\�H�˛�X�K��]
	�	�K�X\

�HO����[J
JN�ۜ��K����]\����
	����\��]�XX�	�JN�ۜ��K����X�\Έ	��]\���X[��X�\˚��[�	�	�J_X
N�ۜ��K���Z[�[\�[�\�Έ	��]\���X[���[���˛Z[�\�[�\��J_X
N�ۜ��K���[��XY�N�	��]\���X[��˛[��XY�J_X
NY�
�˙X��H�ۜ��K���X�Έ	��]\���X[��˙X��_X
N��ۜ�\R�^HH���\�˙[���T�S�ӓ�T��TW��VNY�
X\R�^JH�ۜ��K����]\��Y[��	��[���]T�S�ӓ�T��TW��VH�[�X�H]�H��\��X\��	�JN�ۜ��K����]\��[J	�8���΋����˛\�[���\˘��K�\K��JNH[�H�ۜ��K����]\��[J	���X\��[��\�[���\��)��JN�ۜ�\�H΋��\�[�X\K�\�[���\˘��K�\K݌���X\���OI�[���UT�P��\ۙ[�
�X�\��J_I�\O\��\�	�[��XY�OI��˛[��XY�_I��ܝ؞W�]OL�ۜ��H�]۔�[��	��\�	���\��	�R	�S\�[�TKR�^N�	�\R�^_X\�K�[���[�Έ	�]�	�JNY�
���]\�OOH
H�H�ۜ�]HH��Ӌ�\��J����]
H\���\�[�Έ\��^O�]W�ܚY�[�[���[����[�\\��\Έ�[X�\���X��]OΈ��[��O�N�ۜ�]�H
]K��\�[����JK��[\�

HO���[�\\��\��H�˛Z[�\�[�\��NY�
]˛[��OOH
H�ۜ��K����]\��[J	����\�[�X�ݙH\�[�\��\��	�JNH[�H�ۜ��K����]\����
	��X]�[����\�Ή�JN�܈
�ۜ�و]˜�X�JL
JB��ۜ��K���	��]\���X[��]W�ܚY�[�[
_H	��]\��[J��X��]H��	��_X
NB�H�]���ۜ��K����]\��[J	���[��\��H\�[���\��\�ۜ�I�JN�B�B�B��Y�
�˙�T�[�H�ۜ��K����]\��Y[��	���K\�[�8�%��]�\��[�	�JN�]\��B���ۜ��\�[��^HH���\�˙[����T�S��TW��VNY�
\�\�[��^JH�ۜ��K����]\��Y[��	��[���]�T�S��TW��VH�[�X�H]�[XZ[�[�[���JN�ۜ��K����]\��[J	�8���΋�ܙ\�[����K��JNH[�H�ۜ��K����]\��[J	����[�[�]�[XZ[��XH�\�[�8�%�ۙ�Y�\�HKYX��[�H�X�\Y[�\�	�JNB���ۜ��]HH]�Z]�XY��۔��[�O�]�XX��]O��U�PP�ђSJ
K���\�Έ�K[XZ[Έ�K][��\Έ�HJN�]K���\�˜\�
��X�N��˛�X�KZ[�\�[�\�Έ�˛Z[�\�[�\��]�Y]��]�]J
K��T����[��
K�T�[��H[�˙�T�[�JN]�Z]]�ZX�ܚ]T��[�J�U�PP�ђSJ
K�]JN�ۜ��K����]\��[J	���[��]�Y8�%�\��[�H�]�XX��]\���]�Y]��JNJN��]�XX��Y����[X[�
	�[XZ[	�B��\�ܚ\[ۊ	���[XZ[�\]Y[��H�XH�\�[�8�%�S�T�SH��T������\X[��H\�[�\��\�ۜ�X�[]I�B���\]Z\�Y�[ۊ	�K\�X�\Y[���ݔ]��	��Ո�][XZ[�[YK��\[�K����B���\]Z\�Y�[ۊ	�K\�X��X�^��B���\]Z\�Y�[ۊ	�KX��H]��	�X\���ۋ�[��H�[H�]��X�Z�\��_I�B���[ۊ	�KY���HY���	�]\��HH�\�Y�YY�\�[��XZ[��B���[ۊ	�K\�]H\��\���	�X^�[��\��\���[X�\��
B���[ۊ	�KY�K\�[��B��X�[ۊ\�[��
�Έ��X�\Y[�Έ��[����X��X����[�����N���[������OΈ��[����]N��[X�\���T�[�Έ���X[�JHO��ۜ��K����]\����
	����[XZ[�\]Y[��I�JN�ۜ��K����X�\Y[�Έ	��]\���X[��˜�X�\Y[��_X
N�ۜ��K����X��X��	��]\���X[��˜�X��X�
_X
N�ۜ��K�����N�	��]\���X[��˘��J_X
N�ۜ��K����]N�	��]\���X[���[���˜�]JJ_K��
N�]�ݐ�۝[����[���H�ݐ�۝[�H]�Z]�˜�XY�[J�˜�X�\Y[��	�]�	�NH�]��ۜ��K�\��܊�]\���Y
�[����XY�X�\Y[���[N�	��˜�X�\Y[��X
JN���\�˙^]
JNB��ۜ�����H�ݐ�۝[���[J
K��]
	���K��[\����X[�N�ۜ�XY\�H�����K��]
	�	�K�X\


HO���[J
K����\��\�J
JN�ۜ�[XZ[YHXY\��[�^ي	�[XZ[	�NY�
[XZ[YOOHLJH��ۜ��K�\��܊�]\���Y
	��Ո]\�]�H[��[XZ[���[[��JN����\�˙^]
JN�B��ۜ��X�\Y[��H���˜�X�JJK�X\

�HO����]
	�	�V�[XZ[YO˝�[J
JK��[\����X[�N��ۜ��K����]\��[J�	ܙX�\Y[�˛[��H�X�\Y[����[�
JN�܈
�ۜ�Y�و�X�\Y[�˜�X�J
JJH�ۜ��K���	��]\��[J	���_H	�Y�X
NY�
�X�\Y[�˛[���
JH�ۜ��K����]\��[J… and ${recipients.length - 5} more`));

    if (opts.dryRun) {
      console.log(kleur.yellow('\ndry-run — no emails sent'));
      const state = await readJsonPromote<OutreachState>(OUTREACH_FILE(), { podcasts: [], emails: [], launches: [] });
      state.emails.push({ recipients: opts.recipients, subject: opts.subject, sentAt: new Date().toISOString(), count: 0, dryRun: true });
      await atomicWritePromote(OUTREACH_FILE(), state);
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.log(kleur.yellow('\nhint: set RESEND_API_KEY to send via Resend'));
      console.log(kleur.dim('  export RESEND_API_KEY=re_...'));
      return;
    }

    let bodyTpl: string;
    try { bodyTpl = await fs.readFile(opts.body, 'utf8'); }
    catch { console.error(kleur.red(`cannot read body file: ${opts.body}`)); process.exit(1); }

    const fromAddr = opts.from ?? `hello@${process.env.RESEND_DOMAIN ?? 'your-domain.com'}`;
    let sent = 0;
    for (const addr of recipients) {
      const payload = JSON.stringify({ from: fromAddr, to: [addr], subject: opts.subject, text: bodyTpl });
      const r = spawnSync('curl', ['-s', '-X', 'POST', 'https://api.resend.com/emails',
        '-H', 'Content-Type: application/json', '-H', `Authorization: Bearer ${resendKey}`,
        '-d', payload], { encoding: 'utf8' });
      if (r.status === 0) { sent++; process.stdout.write('.'); }
      else process.stdout.write('x');
    }
    console.log();
    console.log(kleur.green(`\nsent ${sent}/${recipients.length} emails`));

    const state = await readJsonPromote<OutreachState>(OUTREACH_FILE(), { podcasts: [], emails: [], launches: [] });
    state.emails.push({ recipients: opts.recipients, subject: opts.subject, sentAt: new Date().toISOString(), count: sent, dryRun: false });
    await atomicWritePromote(OUTREACH_FILE(), state);
  });

outreachCmd
  .command('launch')
  .description('Schedule / coordinate a launch post on Product Hunt, BetaList, Hacker News Show, Indie Hackers')
  .option('--site <id...>', 'producthunt | betalist | hn-show | indiehackers', 'producthunt')
  .option('--schedule <iso>', 'launch time; PH prefers 12:01 AM PST')
  .option('--tagline <text>')
  .option('--gallery <path...>')
  .action(async (opts: { site: string | string[]; schedule?: string; tagline?: string; gallery?: string[] }) => {
    const sites = Array.isArray(opts.site) ? opts.site : [opts.site];
    const LAUNCH_URLS: Record<string, string> = {
      producthunt: 'https://www.producthunt.com/posts/new',
      betalist:    'https://betalist.com/submit',
      'hn-show':   'https://news.ycombinator.com/submit',
      indiehackers: 'https://www.indiehackers.com/post/new',
    };

    console.log(kleur.bold('\nlaunch checklist'));
    for (const site of sites) {
      console.log(`\n  ${kleur.cyan(site.toUpperCase())}`);
      const url = LAUNCH_URLS[site];
      if (url) console.log(`    ${kleur.dim('→')} ${url}`);
      if (site === 'producthunt') {
        console.log(kleur.dim('    · best time: 12:01 AM PST on a Tuesday–Thursday'));
        console.log(kleur.dim('    · need: tagline (≤60 chars), gallery (3+ images), description'));
        console.log(kleur.dim('    · tip: hunter with 500+ followers multiplies reach'));
      } else if (site === 'hn-show') {
        console.log(kleur.dim('    · title must start with "Show HN:"'));
        console.log(kleur.dim('    · post between 9–11 AM EST on weekdays'));
      }
      if (opts.tagline) console.log(`    tagline: ${kleur.white(opts.tagline)}`);
      if (opts.schedule) console.log(`    schedule: ${kleur.yellow(opts.schedule)}`);
      if (opts.gallery?.length) console.log(`    gallery: ${opts.gallery.join(', ')}`);
    }

    const state = await readJsonPromote<OutreachState>(OUTREACH_FILE(), { podcasts: [], emails: [], launches: [] });
    state.launches.push({ sites, schedule: opts.schedule, tagline: opts.tagline, createdAt: new Date().toISOString() });
    await atomicWritePromote(OUTREACH_FILE(), state);
    console.log(kleur.dim('\nlaunch saved — `sh1pt promote outreach status` to review'));
  });

outreachCmd
  .command('status')
  .description('Open podcast pitches, active email sequences, upcoming launch slots')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    const state = await readJsonPromote<OutreachState>(OUTREACH_FILE(), { podcasts: [], emails: [], launches: [] });
    if (opts.json) { console.log(JSON.stringify(state, null, 2)); return; }

    if (!state.podcasts.length && !state.emails.length && !state.launches.length) {
      console.log(kleur.dim('no outreach recorded — run `sh1pt promote outreach podcasts|email|launch`'));
      return;
    }
    if (state.podcasts.length) {
      console.log(kleur.bold('\npodcast pitches:'));
      for (const p of state.podcasts)
        console.log(`  ${kleur.dim(p.pitchedAt.slice(0,10))}  niche=${p.niche}  min=${p.minListeners}${p.dryRun ? kleur.dim(' (dry)') : ''}`);
    }
    if (state.emails.length) {
      console.log(kleur.bold('\nemail sequences:'));
      for (const e of state.emails)
        console.log(`  ${kleur.dim(e.sentAt.slice(0,10))}  ${kleur.cyan(e.subject)}  sent=${e.count}${e.dryRun ? kleur.dim(' (dry)') : ''}`);
    }
    if (state.launches.length) {
      console.log(kleur.bold('\nlaunch slots:'));
      for (const l of state.launches)
        console.log(`  ${kleur.dim(l.createdAt.slice(0,10))}  sites=${l.sites.join(',')}${l.schedule ? `  @${l.schedule}` : ''}${l.tagline ? `  "${l.tagline}"` : ''}`);
    }
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
  .action(async (opts: { network?: string[] }) => {
    const networks = opts.network ?? ['bridge-discord', 'bridge-matrix', 'bridge-irc'];
    const state = await readJsonPromote<BridgeState>(BRIDGE_FILE(), { routes: [], networks: [] });

    const SETUP_HINTS: Record<string, string[]> = {
      'bridge-discord':  ['DISCORD_BOT_TOKEN', '→ discord.com/developers → Bot → Token'],
      'bridge-slack':    ['SLACK_BOT_TOKEN', '→ api.slack.com/apps → OAuth & Permissions'],
      'bridge-telegram': ['TELEGRAM_BOT_TOKEN', '→ @BotFather → /newbot'],
      'bridge-matrix':   ['MATRIX_HOMESERVER,MATRIX_ACCESS_TOKEN', '→ Element Settings → Help & About → Access Token'],
      'bridge-irc':      ['IRC_SERVER,IRC_NICK', '→ set IRC_SASL_PASS for authenticated nicks'],
      'bridge-signal':   ['SIGNAL_PHONE', '→ install signal-cli and link your device'],
      'bridge-nostr':    ['NOSTR_NSEC', '→ export your Nostr private key as nsec1…'],
      'bridge-mastodon': ['MASTODON_INSTANCE,MASTODON_ACCESS_TOKEN', '→ Preferences → Development → New Application'],
    };

    for (const net of networks) {
      console.log(kleur.bold(`\n${net}`));
      const info = SETUP_HINTS[net];
      const envKeys = (info ? info[0] : `${net.replace('bridge-', '').toUpperCase()}_TOKEN`).split(',');
      const hint = info ? info[1] : '';
      if (hint) console.log(kleur.dim(`  ${hint}`));
      console.log(kleur.dim(`  env: ${envKeys.join(', ')}`));
      const missing = envKeys.filter((k) => !process.env[k]);
      if (missing.length === 0) {
        console.log(kleur.green('  ✓ credentials found'));
        if (!state.networks.includes(net)) state.networks.push(net);
      } else {
        console.log(kleur.yellow(`  missing: ${missing.join(', ')}`));
      }
    }

    await atomicWritePromote(BRIDGE_FILE(), state);
    console.log(kleur.dim('\n`sh1pt promote bridge status` to review configured networks'));
  });

bridgeCmd
  .command('connect <from> <to...>')
  .description('Define a relay route. Format: "<network>:<channel>". Repeatable destinations.')
  .option('--filter <rule...>', 'no-bots | no-pings | no-links | no-emojis')
  .action(async (from: string, to: string[], opts: { filter?: string[] }) => {
    const state = await readJsonPromote<BridgeState>(BRIDGE_FILE(), { routes: [], networks: [] });
    const filters = opts.filter ?? [];
    const existing = state.routes.findIndex((r) => r.from === from && r.to.join(',') === to.join(','));
    if (existing >= 0) {
      state.routes[existing].filters = filters;
      console.log(kleur.yellow(`updated route: ${from} → ${to.join(', ')}`));
    } else {
      state.routes.push({ from, to, filters, addedAt: new Date().toISOString() });
      console.log(kleur.green(`added route: ${from} → ${to.join(', ')}`));
    }
    if (filters.length) console.log(kleur.dim(`  filters: ${filters.join(', ')}`));
    await atomicWritePromote(BRIDGE_FILE(), state);
    console.log(kleur.dim('run `sh1pt promote bridge start` to activate'));
  });

bridgeCmd
  .command('start')
  .description('Run the bridge daemon (persistent process — pair with deploy-fly for HA)')
  .option('--detach', 'background mode')
  .action(async (opts: { detach?: boolean }) => {
    const state = await readJsonPromote<BridgeState>(BRIDGE_FILE(), { routes: [], networks: [] });

    if (state.pid) {
      try { process.kill(state.pid, 0); console.log(kleur.yellow(`bridge already running (pid ${state.pid})`)); return; }
      catch { state.pid = undefined; state.startedAt = undefined; }
    }

    if (state.routes.length === 0) {
      console.log(kleur.yellow('no routes defined — run `sh1pt promote bridge connect <from> <to>` first'));
      return;
    }

    console.log(kleur.bold('\nbridge routes:'));
    for (const r of state.routes)
      console.log(`  ${kleur.cyan(r.from)} → ${r.to.join(', ')}${r.filters.length ? kleur.dim(` (${r.filters.join(',')})`) : ''}`);

    if (opts.detach) {
      console.log(kleur.yellow('\ndaemon mode — pair with a process manager:'));
      console.log(kleur.dim('  pm2 start "sh1pt promote bridge start" --name sh1pt-bridge'));
      console.log(kleur.dim('  fly deploy --app sh1pt-bridge'));
    } else {
      state.pid = process.pid;
      state.startedAt = new Date().toISOString();
      await atomicWritePromote(BRIDGE_FILE(), state);
      console.log(kleur.cyan('\nbridge running (foreground) — ctrl+c to stop'));
      console.log(kleur.dim('(relay loop implementation: connect network adapters + event bus)'));
    }
  });

bridgeCmd
  .command('stop')
  .description('Stop the bridge daemon')
  .action(async () => {
    const state = await readJsonPromote<BridgeState>(BRIDGE_FILE(), { routes: [], networks: [] });
    if (!state.pid) { console.log(kleur.dim('bridge is not running')); return; }
    try {
      process.kill(state.pid, 'SIGTERM');
      console.log(kleur.yellow(`stopped bridge (pid ${state.pid})`));
    } catch {
      console.log(kleur.dim(`pid ${state.pid} already gone`));
    }
    state.pid = undefined;
    state.startedAt = undefined;
    await atomicWritePromote(BRIDGE_FILE(), state);
  });

bridgeCmd
  .command('status')
  .description('Active routes + message counts + last-seen per network')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    const state = await readJsonPromote<BridgeState>(BRIDGE_FILE(), { routes: [], networks: [] });
    if (opts.json) { console.log(JSON.stringify(state, null, 2)); return; }

    if (!state.routes.length && !state.networks.length) {
      console.log(kleur.dim('no bridge configured — run `sh1pt promote bridge setup` then `bridge connect`'));
      return;
    }

    if (state.networks.length) {
      console.log(kleur.bold('\nconfigured networks:'));
      for (const n of state.networks) console.log(`  ${kleur.cyan(n)}`);
    }

    if (state.routes.length) {
      console.log(kleur.bold('\nroutes:'));
      for (const r of state.routes)
        console.log(`  ${kleur.cyan(r.from)} → ${r.to.join(', ')}${r.filters.length ? kleur.dim(` [${r.filters.join(',')}]`) : ''}`);
    }

    if (state.pid) {
      try {
        process.kill(state.pid, 0);
        console.log(kleur.green(`\ndaemon running (pid ${state.pid})${state.startedAt ? `  since ${state.startedAt.slice(0, 16)}` : ''}`));
      } catch {
        console.log(kleur.yellow(`\ndaemon crashed (last pid ${state.pid}) — run \`bridge start\` to restart`));
      }
    } else {
      console.log(kleur.dim('\ndaemon not running — `sh1pt promote bridge start` to begin'));
    }
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
  .action(async (opts: { kind: string; format: string; markdown: string; template?: string; provider: string; out: string; uploadToLumin?: boolean }) => {
    const outDir = opts.out.replace(/\/?$/, '/');
    const slug = `${opts.kind}-${Date.now()}`;
    const outPath = `${outDir}${slug}.${opts.format}`;

    console.log(kleur.bold('\ndocs generate'));
    console.log(`  kind:     ${kleur.cyan(opts.kind)}`);
    console.log(`  format:   ${kleur.cyan(opts.format)}`);
    console.log(`  provider: ${kleur.cyan(opts.provider)}`);
    console.log(`  markdown: ${kleur.cyan(opts.markdown)}`);
    console.log(`  out:      ${kleur.cyan(outPath)}`);
    if (opts.template) console.log(`  template: ${kleur.cyan(opts.template)}`);

    await fs.mkdir(outDir, { recursive: true });

    if (opts.provider === 'docs-marp') {
      const marpArgs = [opts.markdown, '--output', outPath];
      if (opts.template) marpArgs.push('--theme', opts.template);
      if (opts.format === 'pdf') marpArgs.push('--pdf');
      else if (opts.format === 'pptx') marpArgs.push('--pptx');
      console.log(kleur.dim('\nrunning marp…'));
      const r = spawnSync('marp', marpArgs, { encoding: 'utf8', stdio: 'inherit' });
      if (r.error) { console.log(kleur.yellow('marp not found — install: npm install -g @marp-team/marp-cli')); return; }
      if (r.status !== 0) { console.error(kleur.red('marp failed')); process.exit(1); }
      console.log(kleur.green(`\ngenerated: ${outPath}`));
    } else if (opts.provider === 'docs-pandoc') {
      const pandocArgs = [opts.markdown, '-o', outPath];
      if (opts.template) pandocArgs.push('--reference-doc', opts.template);
      console.log(kleur.dim('\nrunning pandoc…'));
      const r = spawnSync('pandoc', pandocArgs, { encoding: 'utf8', stdio: 'inherit' });
      if (r.error) { console.log(kleur.yellow('pandoc not found — https://pandoc.org/installing.html')); return; }
      if (r.status !== 0) { console.error(kleur.red('pandoc failed')); process.exit(1); }
      console.log(kleur.green(`\ngenerated: ${outPath}`));
    } else if (opts.provider === 'docs-gslides') {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        console.log(kleur.yellow('set GOOGLE_SERVICE_ACCOUNT_JSON to use the Google Slides provider'));
        return;
      }
      console.log(kleur.dim('Google Slides export — requires Slides API integration (not yet implemented)'));
    } else if (opts.provider === 'docs-lumin') {
      if (!process.env.LUMIN_API_KEY) {
        console.log(kleur.yellow('set LUMIN_API_KEY to use the LuminPDF provider'));
        return;
      }
      console.log(kleur.dim('LuminPDF upload — requires source PDF; generate with docs-marp first'));
    } else {
      console.log(kleur.yellow(`unknown provider: ${opts.provider}`));
      return;
    }

    if (opts.uploadToLumin) {
      const luminKey = process.env.LUMIN_API_KEY;
      if (!luminKey) {
        console.log(kleur.yellow('LUMIN_API_KEY not set — skipping upload'));
      } else {
        console.log(kleur.dim('\nuploading to LuminPDF…'));
        const r = spawnSync('curl', ['-s', '-X', 'POST', 'https://api.luminpdf.com/v1/documents',
          '-H', `Authorization: Bearer ${luminKey}`, '-F', `file=@${outPath}`], { encoding: 'utf8' });
        if (r.status === 0) {
          try {
            const data = JSON.parse(r.stdout) as { url?: string };
            if (data.url) console.log(kleur.green(`  shareable: ${data.url}`));
            else console.log(kleur.dim(`  ${r.stdout.slice(0, 200)}`));
          } catch { console.log(kleur.dim(`  ${r.stdout.slice(0, 200)}`)); }
        }
      }
    }

    const docs = await readJsonPromote<DocRecord[]>(DOCS_FILE(), []);
    docs.push({ kind: opts.kind, format: opts.format, provider: opts.provider, outPath, generatedAt: new Date().toISOString() });
    await atomicWritePromote(DOCS_FILE(), docs);
  });

docsCmd
  .command('list')
  .description('Recently generated docs')
  .option('--json')
  .action(async (opts: { json?: boolean }) => {
    const docs = await readJsonPromote<DocRecord[]>(DOCS_FILE(), []);
    if (opts.json) { console.log(JSON.stringify({ docs }, null, 2)); return; }
    if (!docs.length) {
      console.log(kleur.dim('no docs generated yet — run `sh1pt promote docs generate`'));
      return;
    }
    console.log(kleur.bold('\ngenerated docs:'));
    for (const d of docs)
      console.log(`  ${kleur.dim(d.generatedAt.slice(0, 10))}  ${kleur.cyan(d.kind)}  ${d.format}  via ${d.provider}  ${kleur.dim(d.outPath)}`);
  });

// Publish to package registries. Promote because publishing IS
// promotion — it's how a package gets users. Only works from inside
// the sh1pt monorepo (wraps root-level pnpm publish:* scripts).
const publishCmd = promoteCmd
  .command('publish')
  .description('Publish sh1pt build artifacts to a package registry');

publishCmd
  .command('npm')
  .description('Publish sh1pt packages to npm (cli only by default; --all for core+policy+cli)')
  .option('--all', 'publish core + policy + cli')
  .option('--dry-run', 'package + verify without uploading')
  .option('--otp <code>', 'one-time password for npm 2FA')
  .action((opts: { all?: boolean; dryRun?: boolean; otp?: string }) => {
    const script = opts.dryRun ? 'publish:dry' : opts.all ? 'publish:all' : 'publish:cli';
    const env: Record<string, string> = {};
    if (opts.otp) env.NPM_OTP = opts.otp;
    process.exit(runShell(['pnpm', script], env));
  });
