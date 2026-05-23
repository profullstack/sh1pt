import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  runSetup,
  type AdapterWithSetup,
  type SocialPlatform,
  type SocialPost,
  getAdapterConfig,
} from '@profullstack/sh1pt-core';
import { describeInput, resolveInput } from '../input.js';
import { merchCmd } from './merch.js';
import { shipCmd as shipSub } from './ship.js';
import { makeCliSetupContext } from '../setup-context.js';
import { ensureInstalled, loadInstalledPackage } from '../installer.js';
import { runShell } from './build.js';

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
      'Add the redirect URIs listed below under "Callback URI / Redirect URL"',
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
      'Create or use an existing Meta Business app at https://developers.facebook.com/apps/',
      'Add the "Instagram Basic Display" product',
      'Under Instagram Basic Display → "Basic Display", configure OAuth redirect URIs',
      'Note your App ID and App Secret from Settings → Basic',
    ],
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    url: 'https://developers.tiktok.com/apps/',
    docUrl: 'https://developers.tiktok.com/documentation/login-kit-web/manage-user-tokens/',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['user.info.basic', 'video.publish', 'video.upload'],
    steps: [
      'Go to https://developers.tiktok.com/apps/ and click "Create App"',
      'Fill in your app name, description, and upload icons',
      'Add the redirect URIs listed below under "Redirect URL"',
      'Enable the "Login Kit" and "Content Publishing" permissions',
      'Copy your Client Key (App ID) and Client Secret',
    ],
  },
  {
    platform: 'reddit',
    label: 'Reddit',
    url: 'https://www.reddit.com/prefs/apps',
    docUrl: 'https://github.com/reddit-archive/reddit/wiki/OAuth2',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['identity', 'submit', 'read', 'edit'],
    steps: [
      'Go to https://www.reddit.com/prefs/apps and click "create another app…"',
      'Choose "web app" type',
      'Set the redirect URI to http://127.0.0.1:8765/callback',
      'Note your Client ID (the string under the app name) and Client Secret',
    ],
  },
  {
    platform: 'google',
    label: 'Google (YouTube)',
    url: 'https://console.cloud.google.com/apis/credentials',
    docUrl: 'https://developers.google.com/youtube/registering_an_application',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/youtube.upload'],
    steps: [
      'Go to https://console.cloud.google.com/apis/credentials and create a project',
      'Enable the YouTube Data API v3 from "Library"',
      'Create OAuth 2.0 Client ID → "Web application"',
      'Add the redirect URIs listed below under "Authorized redirect URIs"',
      'Copy your Client ID and Client Secret',
    ],
  },
  {
    platform: 'github',
    label: 'GitHub',
    url: 'https://github.com/settings/developers',
    docUrl: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['repo', 'workflow', 'user'],
    steps: [
      'Go to https://github.com/settings/developers and click "New OAuth App"',
      'Fill in Application name, Homepage URL, and Authorization callback URL',
      'Add the redirect URIs listed below',
      'Click "Register application"',
      'Copy your Client ID and generate + copy a Client Secret',
    ],
  },
  {
    platform: 'discord',
    label: 'Discord',
    url: 'https://discord.com/developers/applications',
    docUrl: 'https://discord.com/developers/docs/topics/oauth2',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['identify', 'guilds', 'bot', 'webhook.incoming'],
    steps: [
      'Go to https://discord.com/developers/applications and click "New Application"',
      'Go to the "OAuth2" page and note your Client ID and Client Secret',
      'Add the redirect URIs listed below',
      'If using a bot, go to "Bot" page and create + copy the bot token',
    ],
  },
  {
    platform: 'pinterest',
    label: 'Pinterest',
    url: 'https://developers.pinterest.com/apps/',
    docUrl: 'https://developers.pinterest.com/docs/getting-started/set-up-app/',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'],
    steps: [
      'Go to https://developers.pinterest.com/apps/ and click "Create app"',
      'Fill in your app name and description',
      'Add the redirect URIs listed below under "Redirect URIs"',
      'Copy your App ID and App Secret',
    ],
  },
  {
    platform: 'spotify',
    label: 'Spotify',
    url: 'https://developer.spotify.com/dashboard',
    docUrl: 'https://developer.spotify.com/documentation/web-api/tutorials/getting-started',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['user-read-private', 'user-read-email', 'playlist-modify-public', 'playlist-modify-private'],
    steps: [
      'Go to https://developer.spotify.com/dashboard and click "Create App"',
      'Fill in the app name and description',
      'Add the redirect URIs listed below under "Redirect URIs"',
      'Copy your Client ID and Client Secret',
    ],
  },
  {
    platform: 'snapchat',
    label: 'Snapchat',
    url: 'https://kit.snapchat.com/portal',
    docUrl: 'https://docs.snap.com/snap-kit/snap-kit-overview',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['snapchat-marketing-api', 'business_manager'],
    steps: [
      'Go to https://kit.snapchat.com/portal and log in with a Business account',
      'Create a new app under the Business portal',
      'Enable the OAuth2.0 Client and add the redirect URIs listed below',
      'Copy your OAuth Client ID and Client Secret',
    ],
  },
  {
    platform: 'twitch',
    label: 'Twitch',
    url: 'https://dev.twitch.tv/console/apps',
    docUrl: 'https://dev.twitch.tv/docs/authentication/register-app/',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['user:read:email', 'chat:read', 'chat:edit', 'channel:manage:broadcast'],
    steps: [
      'Go to https://dev.twitch.tv/console/apps and click "Register Your Application"',
      'Enter a name, add the redirect URIs listed below, and select "Chat Bot" or "Other" category',
      'Copy your Client ID',
      'Click "New Secret" to generate and copy a Client Secret',
    ],
  },
  {
    platform: 'microsoft',
    label: 'Microsoft (Azure AD / LinkedIn)',
    url: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    docUrl: 'https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app',
    redirectUris: ['http://127.0.0.1:8765/callback', 'https://sh1pt.com/auth/callback'],
    scopes: ['User.Read', 'Mail.Send', 'Files.ReadWrite'],
    steps: [
      'Go to Azure Portal → App Registrations → "New Registration"',
      'Enter a name and select "Accounts in any organizational directory"',
      'Add the redirect URIs listed below (type: Web)',
      'Copy your Application (Client) ID',
      'Create a Client Secret under "Certificates & Secrets" and copy it',
    ],
  },
];

socialCmd
  .command('register')
  .description('Walk through registering an OAuth app on a social platform (creates client_id / client_secret in vault)')
  .option('--platform <id>', 'which platform to register on (e.g. facebook, x, linkedin, tiktok, reddit, google, github, discord, pinterest, spotify, twitch)')
  .option('--list', 'list all platforms with registration guides')
  .action(async (opts: { platform?: string; list?: boolean }) => {
    if (opts.list) {
      console.log(kleur.bold('\nOAuth App Registration Guides\n'));
      for (const guide of OAUTH_REGISTRATION_GUIDES) {
        console.log(`  ${kleur.cyan(guide.platform.padEnd(12))} ${guide.label}`);
      }
      console.log(kleur.dim(`\nRun: sh1pt promote social register --platform <id>`));
      return;
    }

    let target = opts.platform;
    if (!target) {
      const res = await prompts({
        type: 'select',
        name: 'platform',
        message: 'Which platform do you need to register an OAuth app on?',
        choices: OAUTH_REGISTRATION_GUIDES.map((g) => ({ title: `${g.label} (${g.platform})`, value: g.platform })),
      });
      target = res.platform as string;
    }

    const guide = OAUTH_REGISTRATION_GUIDES.find((g) => g.platform === target || g.platform === target.replace(/^social-/, ''));
    if (!guide) {
      console.log(kleur.red(`No registration guide for "${target}".`));
      console.log(kleur.dim(`Run: sh1pt promote social register --list`));
      return;
    }

    console.log();
    console.log(kleur.bold().underline(`Register a ${guide.label} OAuth App`));
    console.log();

    for (const step of guide.steps) {
      console.log(`  ${kleur.cyan('‣')} ${step}`);
    }

    console.log();
    console.log(kleur.dim(`  Required redirect URIs:`));
    for (const uri of guide.redirectUris) {
      console.log(`    ${kleur.yellow(uri)}`);
    }
    console.log();
    console.log(kleur.dim(`  Required OAuth scopes:`));
    for (const scope of guide.scopes) {
      console.log(`    ${kleur.green(scope)}`);
    }

    console.log();
    const docUrl = guide.docUrl;
    console.log(kleur.dim(`  Docs: ${docUrl}`));
    console.log(kleur.dim(`  Portal: ${guide.url}`));
    console.log();

    const ctx = makeCliSetupContext();
    const clientId = await ctx.prompt<string>({
      type: 'text',
      message: 'Enter the Client ID / App ID from the platform:',
    });
    if (clientId) {
      await ctx.setSecret(`${guide.platform.toUpperCase()}_CLIENT_ID`, clientId);
    }

    const clientSecret = await ctx.prompt<string>({
      type: 'password',
      message: 'Enter the Client Secret / App Secret (or leave blank if PKCE):',
    });
    if (clientSecret) {
      await ctx.setSecret(`${guide.platform.toUpperCase()}_CLIENT_SECRET`, clientSecret);
    }

    console.log();
    console.log(kleur.green(`  ✓ OAuth app registration details saved for ${guide.label}.`));
    console.log(kleur.dim(`  Next step: run "sh1pt promote social setup --platform ${guide.platform}" to complete the OAuth flow.`));
  });

function stripSocialPrefix(p: string): string {
  return p.replace(/^social-/, '').toLowerCase();
}

function inferMediaKind(file: string): 'image' | 'video' | 'gif' {
  const lower = file.toLowerCase();
  if (lower.endsWith('.gif')) return 'gif';
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(lower)) return 'video';
  return 'image';
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
  .action(async (opts: {
    body: string;
    title?: string;
    hashtags?: string;
    media?: string[];
    link?: string;
    platform?: string[];
    schedule?: string;
    dryRun?: boolean;
  }) => {
    const post: SocialPost = {
      body: opts.body,
      title: opts.title,
      hashtags: opts.hashtags ? opts.hashtags.split(',').map((h) => h.trim()).filter(Boolean) : undefined,
      media: opts.media?.map((file) => ({ file, kind: inferMediaKind(file) })),
      link: opts.link,
      schedule: opts.schedule ? new Date(opts.schedule) : undefined,
    };

    const names = (opts.platform ?? SOCIAL_PLATFORMS).map(stripSocialPrefix).filter(Boolean);

    if (opts.dryRun) {
      console.log(kleur.cyan('dry-run: social post preview\n'));
      for (const name of names) {
        const pkg = `@profullstack/sh1pt-social-${name}`;
        let adapter: SocialPlatform<unknown> | null = null;
        try {
          adapter = await loadInstalledPackage<SocialPlatform<unknown>>(pkg);
        } catch {
          // not installed — skip
        }
        if (!adapter) {
          console.log(kleur.dim(`  ${name}: not installed — run: sh1pt promote social setup --platform ${name}`));
          continue;
        }
        const max = adapter.requires?.maxBodyChars;
        const truncated = max && post.body.length > max ? post.body.slice(0, max - 3) + '...' : post.body;
        console.log(kleur.bold(`  ${adapter.label ?? name}`));
        console.log(`    body (${truncated.length} chars): ${truncated.slice(0, 80)}${truncated.length > 80 ? '…' : ''}`);
        if (post.hashtags?.length) console.log(`    hashtags: ${post.hashtags.map((h) => `#${h}`).join(' ')}`);
        if (post.link) console.log(`    link: ${post.link}`);
        if (post.schedule) console.log(`    schedule: ${post.schedule.toISOString()}`);
      }
      return;
    }

    let anyPosted = false;
    for (const name of names) {
      const pkg = `@profullstack/sh1pt-social-${name}`;
      let adapter: SocialPlatform<unknown> | null = null;
      try {
        adapter = await loadInstalledPackage<SocialPlatform<unknown>>(pkg);
      } catch {
        // not installed
      }
      if (!adapter) {
        console.log(kleur.dim(`  ${name}: not installed — skipping`));
        continue;
      }

      const adapterConfig = await getAdapterConfig(adapter.id);
      if (!adapterConfig) {
        console.log(kleur.yellow(`  ${name}: not configured — run: sh1pt promote social setup --platform ${name}`));
        continue;
      }

      const ctx = {
        secret: (k: string) => process.env[k],
        log: (m: string) => console.log(kleur.dim(`    [${name}] ${m}`)),
        dryRun: false,
      };

      try {
        console.log(kleur.bold(`  posting to ${adapter.label ?? name}…`));
        await adapter.connect(ctx, adapterConfig);
        const result = await adapter.post(ctx, post, adapterConfig);
        console.log(kleur.green(`  ✓ ${adapter.label ?? name} · ${result.url}`));
        anyPosted = true;
      } catch (err) {
        console.error(kleur.red(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`));
      }
    }

    if (!anyPosted) {
      console.log(kleur.yellow('\nno platforms posted — set up accounts with: sh1pt promote social setup'));
    }
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

// AI providers — generate ad copy / social bodies / taglines from a
// prompt. Distinct from `agents/` (which wraps installed CLI binaries
// like `claude` / `codex`); this is HTTP-API-based content generation
// keyed off provider API keys held in the vault.
const AI_PLATFORMS = [
  // Real integrations
  'claude', 'openai', 'qwen', 'gemini',
  // BYOK stubs (OpenRouter-compatible providers — implementations land
  // case-by-case; setup() collects the API key into the vault today)
  'ai21', 'aionlabs', 'akashml', 'alibaba-cloud', 'amazon-bedrock', 'arcee',
  'atlascloud', 'azure', 'baidu', 'baseten', 'cerebras', 'chutes', 'clarifai',
  'cloudflare', 'cohere', 'deepinfra', 'deepseek', 'featherless', 'fireworks',
  'friendli', 'gmicloud', 'google-vertex', 'groq', 'inception', 'inceptron',
  'infermatic', 'inflection', 'ionet', 'kimi', 'liquid', 'mancer', 'minimax',
  'mistral', 'moonshot', 'morph', 'nebius', 'nextbit', 'novita',
  'openinference', 'parasail', 'perceptron', 'perplexity', 'phala', 'reka',
  'relace', 'sambanova', 'siliconflow', 'stepfun', 'switchpoint', 'together',
  'venice', 'wandb', 'xai', 'xiaomi', 'zai',
];

const aiCmd = promoteCmd
  .command('ai')
  .description('Configure AI providers (Claude, OpenAI, Qwen, Gemini + 50+ BYOK stubs) used to draft ad copy and post bodies');

aiCmd
  .command('setup')
  .description("Connect AI providers — runs each provider adapter's setup (API key paste)")
  .option('--platform <id...>', 'e.g. claude openai (or ai-claude, ai-openai)')
  .action(async (opts: { platform?: string[] }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as { platform?: string[] };
    const requested = merged.platform ?? opts.platform;
    let names = (requested ?? []).map(stripAiPrefix).filter(Boolean);

    if (names.length === 0) {
      const res = await prompts({
        type: 'multiselect',
        name: 'picks',
        message: 'Which AI providers to set up?',
        choices: AI_PLATFORMS.map((p) => ({ title: p, value: p })),
        instructions: false,
        hint: 'space to select, return to confirm',
      });
      names = (res.picks as string[] | undefined) ?? [];
      if (names.length === 0) {
        console.log(kleur.dim('nothing selected — aborting.'));
        return;
      }
    }

    const wanted = names.map((n) => `@profullstack/sh1pt-ai-${n}`);
    try {
      await ensureInstalled(wanted);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    const ctx = makeCliSetupContext();
    for (const name of names) {
      console.log();
      console.log(kleur.bold().underline(`ai: ${name}`));
      const pkg = `@profullstack/sh1pt-ai-${name}`;
      const adapter = await loadInstalledPackage<AdapterWithSetup>(pkg);
      if (!adapter || typeof adapter !== 'object' || !('id' in adapter)) {
        console.log(kleur.yellow(`  failed to load ${pkg} after install — file an issue.`));
        continue;
      }
      await runSetup(adapter, ctx);
    }
  });

function stripAiPrefix(p: string): string {
  return p.replace(/^ai-/, '').toLowerCase();
}

// Affiliate-network marketplaces — sister of `social` and `ai` but for
// performance partners. sh1pt user is typically the merchant (listing
// their product in the network so publishers can promote it for a
// commission), though many networks support both sides.
const AFFILIATE_NETWORKS = [
  'cj', 'rakuten', 'shareasale', 'awin', 'impact', 'partnerstack', 'refersion',
  'amazon-associates', 'ebay-partner', 'clickbank', 'skimlinks', 'sovrn',
  'flexoffers', 'avangate', 'tradedoubler', 'jvzoo', 'digistore24',
  'tapfiliate', 'everflow', 'admitad',
];

const affiliatesCmd = promoteCmd
  .command('affiliates')
  .description('Affiliate network marketplaces — CJ, Rakuten, ShareASale, Awin, Impact, Amazon Associates, ClickBank, and more');

affiliatesCmd
  .command('setup')
  .description("Connect affiliate networks — runs each network adapter's setup (API key paste)")
  .option('--network <id...>', 'e.g. cj rakuten impact (or affiliate-cj, affiliate-impact)')
  .action(async (opts: { network?: string[] }, cmd: Command) => {
    const merged = cmd.optsWithGlobals() as { network?: string[]; platform?: string[] };
    const requested = merged.network ?? opts.network ?? merged.platform;
    let names = (requested ?? []).map(stripAffiliatePrefix).filter(Boolean);

    if (names.length === 0) {
      const res = await prompts({
        type: 'multiselect',
        name: 'picks',
        message: 'Which affiliate networks to set up?',
        choices: AFFILIATE_NETWORKS.map((p) => ({ title: p, value: p })),
        instructions: false,
        hint: 'space to select, return to confirm',
      });
      names = (res.picks as string[] | undefined) ?? [];
      if (names.length === 0) {
        console.log(kleur.dim('nothing selected — aborting.'));
        return;
      }
    }

    const wanted = names.map((n) => `@profullstack/sh1pt-affiliate-${n}`);
    try {
      await ensureInstalled(wanted);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    const ctx = makeCliSetupContext();
    for (const name of names) {
      console.log();
      console.log(kleur.bold().underline(`affiliate: ${name}`));
      const pkg = `@profullstack/sh1pt-affiliate-${name}`;
      const adapter = await loadInstalledPackage<AdapterWithSetup>(pkg);
      if (!adapter || typeof adapter !== 'object' || !('id' in adapter)) {
        console.log(kleur.yellow(`  failed to load ${pkg} after install — file an issue.`));
        continue;
      }
      await runSetup(adapter, ctx);
    }
  });

function stripAffiliatePrefix(p: string): string {
  return p.replace(/^affiliate-/, '').toLowerCase();
}

affiliatesCmd
  .command('list')
  .description('List available affiliate network adapters')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ networks: AFFILIATE_NETWORKS }, null, 2));
      return;
    }
    console.log(kleur.dim(`available: ${AFFILIATE_NETWORKS.join(', ')}`));
  });

affiliatesCmd
  .command('create-program')
  .description('List your product as a merchant program in a connected network')
  .requiredOption('--network <id>', 'e.g. cj, impact, partnerstack')
  .requiredOption('--name <text>', 'program name')
  .requiredOption('--destination <url>', 'where clicks should land')
  .option('--commission <rate>', 'numeric — 30 = 30% (percentage) or 30 = $30 (flat)', Number, 20)
  .option('--commission-type <kind>', 'percentage | flat | tiered', 'percentage')
  .option('--cookie-days <n>', 'attribution window', Number, 30)
  .option('--category <kind>', 'saas | ecommerce | finance | other', 'saas')
  .option('--currency <code>', 'ISO 4217 (for flat commissions)', 'USD')
  .option('--dry-run')
  .action((opts) => {
    console.log(kleur.green(`[stub] affiliates create-program ${JSON.stringify(opts)}`));
  });

affiliatesCmd
  .command('stats')
  .description('Aggregated clicks / conversions / commissions across networks')
  .option('--network <id>', 'filter to one network')
  .option('--json')
  .action((opts: { network?: string; json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ networks: [], totals: { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0 } }, null, 2));
      return;
    }
    console.log(kleur.dim(`[stub] affiliates stats · network=${opts.network ?? 'all'}`));
  });

aiCmd
  .command('list')
  .description('List configured AI providers')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ providers: AI_PLATFORMS }, null, 2)); return; }
    console.log(kleur.dim(`available: ${AI_PLATFORMS.join(', ')}`));
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
