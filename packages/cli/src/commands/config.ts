import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';

type Stack = 'node' | 'bun' | 'python' | 'rust' | 'cpp' | 'dotnet' | 'custom';

const STACKS: Array<{ value: Stack; title: string; description: string; supported: boolean }> = [
  { value: 'node',   title: 'Node + TypeScript + React',  description: 'Next.js / Expo / Tauri / Chrome ext', supported: true  },
  { value: 'bun',    title: 'Bun + TypeScript',           description: 'Bun + Hono backend, single-binary compile', supported: true  },
  { value: 'python', title: 'Python + FastAPI',           description: 'FastAPI + Supabase backend',         supported: true  },
  { value: 'rust',   title: 'Rust + Axum',                description: 'Axum + Supabase, tiny binaries',     supported: true  },
  { value: 'cpp',    title: 'C++ (planned)',              description: 'Drogon / Crow backend — roadmap',     supported: false },
  { value: 'dotnet', title: '.NET (planned)',             description: 'ASP.NET Core — roadmap',              supported: false },
  { value: 'custom', title: 'Bring your own',             description: 'Skip scaffolding, use existing project', supported: true  },
];

// Config — cross-cutting utility for reading + editing sh1pt.config.ts
// blocks (payments, recipe, cloud, etc.) without hand-editing the file.
// Each logical concern gets a subcommand; today: payments. Future: auth,
// analytics, etc.
export const configCmd = new Command('config')
  .description('Read + edit sh1pt.config.ts from the CLI without opening the file')
  .action(() => { configCmd.help(); });

configCmd
  .command('show')
  .description('Print the resolved (merged with defaults) manifest')
  .option('--json')
  .action((opts: { json?: boolean }) => {
    if (opts.json) { console.log(JSON.stringify({ manifest: 'stub' }, null, 2)); return; }
    console.log(kleur.dim('[stub] config show — render the parsed manifest'));
  });

// ------ payments --------------------------------------------------------

const paymentsCmd = configCmd
  .command('payments')
  .description('Payment providers — CoinPay default, Stripe/PayPal/WorldRemit and more available')
  .action(() => { paymentsCmd.help(); });

paymentsCmd
  .command('list')
  .description('Show enabled providers and which is the default')
  .action(() => {
    console.log(kleur.dim('[stub] config payments list — read manifest.payments'));
  });

paymentsCmd
  .command('add <provider>')
  .description('Enable a provider (e.g. payment-coinpay, payment-stripe, payment-paypal, payment-worldremit)')
  .option('--default', 'also set as defaultProvider')
  .action((provider: string, opts: { default?: boolean }) => {
    console.log(kleur.cyan(`[stub] config payments add ${provider}${opts.default ? ' (as default)' : ''}`));
  });

paymentsCmd
  .command('remove <provider>')
  .description('Disable a provider (keeps it configured but sets enabled: false)')
  .action((provider: string) => {
    console.log(kleur.yellow(`[stub] config payments remove ${provider}`));
  });

paymentsCmd
  .command('default <provider>')
  .description('Set the default payment provider (checkout flows route here unless overridden)')
  .action((provider: string) => {
    console.log(kleur.green(`[stub] config payments default = ${provider}`));
  });

paymentsCmd
  .command('fee <bps>')
  .description('Platform fee in basis points (marketplace boilerplates: 1500 = 15%)')
  .action((bps: string) => {
    console.log(kleur.green(`[stub] config payments fee = ${bps} bps`));
  });

// ------ stack -----------------------------------------------------------

const stackCmd = configCmd
  .command('stack')
  .description('Pick the language / framework stack — node, bun, python, rust, or bring-your-own')
  .action(() => { stackCmd.help(); });

stackCmd
  .command('list')
  .description('Supported and planned stacks')
  .action(() => {
    for (const s of STACKS) {
      const icon = s.supported ? kleur.green('●') : kleur.gray('○');
      const label = s.supported ? kleur.bold(s.title) : kleur.dim(s.title);
      console.log(`  ${icon} ${label}  ${kleur.dim(s.description)}`);
    }
  });

stackCmd
  .command('set [stack]')
  .description('Set the stack for this project (prompts if omitted)')
  .action(async (stack?: string) => {
    let pick = stack as Stack | undefined;
    if (!pick) {
      const response = await prompts({
        type: 'select',
        name: 'pick',
        message: 'Which stack?',
        choices: STACKS.map((s) => ({
          title: s.supported ? s.title : `${s.title} ${kleur.dim('(planned)')}`,
          description: s.description,
          value: s.value,
          disabled: !s.supported,
        })),
        initial: 0,
      });
      pick = response.pick as Stack | undefined;
      if (!pick) return;
    }
    const match = STACKS.find((s) => s.value === pick);
    if (!match) {
      console.error(kleur.red(`unknown stack: ${pick}`));
      process.exit(1);
    }
    if (!match.supported) {
      console.error(kleur.red(`${match.title} isn't ready yet — track it in TARGETS.md`));
      process.exit(1);
    }
    console.log(kleur.green(`✓ stack set to ${match.title}`));
    // TODO: write `stack: '${pick}'` into sh1pt.config.ts (preserving surrounding code via AST edit)
  });

stackCmd
  .command('detect')
  .description('Auto-detect stack from project files (package.json / pyproject.toml / Cargo.toml / …)')
  .action(() => {
    console.log(kleur.dim('[stub] stack detect — look for package.json, pyproject.toml, Cargo.toml, *.csproj, CMakeLists.txt'));
  });

// ------ vcs (git / github / gitlab / gitea) -----------------------------

const vcsCmd = configCmd
  .command('vcs')
  .description('Git, GitHub, GitLab, Gitea integration — tags, releases, PRs, webhooks')
  .action(() => { vcsCmd.help(); });

vcsCmd
  .command('set [provider]')
  .description('Pick a VCS provider (prompts if omitted)')
  .action(async (provider?: string) => {
    let pick = provider;
    if (!pick) {
      const response = await prompts({
        type: 'select',
        name: 'pick',
        message: 'Which VCS?',
        choices: [
          { title: 'GitHub', description: 'github.com — most common', value: 'vcs-github' },
          { title: 'GitLab', description: 'gitlab.com or self-hosted', value: 'vcs-gitlab' },
          { title: 'Gitea / Forgejo / Codeberg', description: 'self-hosted or Codeberg.org', value: 'vcs-gitea' },
          { title: 'None (local git only)', description: 'tag/push via local `git`; no remote API calls', value: 'none' },
        ],
        initial: 0,
      });
      pick = response.pick as string | undefined;
      if (!pick) return;
    }
    console.log(kleur.green(`✓ vcs set to ${pick}`));
  });

vcsCmd
  .command('auth')
  .description('Walk through setting the right token in the vault (GITHUB_TOKEN / GITLAB_TOKEN / GITEA_TOKEN)')
  .option('--provider <id>', 'vcs-github | vcs-gitlab | vcs-gitea')
  .action((opts: { provider?: string }) => {
    console.log(kleur.cyan(`[stub] vcs auth · ${opts.provider ?? 'current'} — prompt for token and write to vault`));
  });

vcsCmd
  .command('release <tag>')
  .description('Create a GitHub/GitLab/Gitea release from the current HEAD with optional asset uploads')
  .option('--name <text>')
  .option('--body <path>', 'path to a markdown file with release notes')
  .option('--draft')
  .option('--prerelease')
  .option('--asset <path...>', 'files to attach')
  .action((tag: string, opts) => {
    console.log(kleur.green(`[stub] vcs release ${tag} ${JSON.stringify(opts)}`));
    // TODO: local git tag + push, then VcsProvider.createRelease() with assets
  });

vcsCmd
  .command('pr')
  .description('Open a PR / MR from a branch (used by `sh1pt iterate` to file agent changes)')
  .requiredOption('--head <branch>')
  .option('--base <branch>', '', 'main')
  .requiredOption('--title <text>')
  .option('--body <path>')
  .option('--draft')
  .action((opts) => {
    console.log(kleur.green(`[stub] vcs pr ${JSON.stringify(opts)}`));
  });

vcsCmd
  .command('hook add')
  .description('Register a webhook from the VCS provider → sh1pt cloud (ship events, PR events, comments)')
  .option('--events <list>', 'comma-separated')
  .action((opts: { events?: string }) => {
    console.log(kleur.cyan(`[stub] vcs hook add · events=${opts.events ?? 'push,pull_request,release'}`));
  });
