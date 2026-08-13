import { defineTarget, setupGuide, ensureCli, exec } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

interface Config {
  slug: string;                 // plugin/theme slug as WordPress knows it, e.g. "my-plugin"
  type?: 'plugin' | 'theme';    // default "plugin"
  sourceDir?: string;           // dir holding the plugin/theme source, relative to projectDir
  ssh?: string;                 // wp-cli --ssh=[<user>@]<host>[:<port>][<path>]
  path?: string;                // wp-cli --path=<dir> for a local WordPress root
  url?: string;                 // wp-cli --url=<url> for multisite
  siteUrl?: string;             // public site URL, reported back on ship
  activate?: boolean;           // default true
}

const TYPES = ['plugin', 'theme'] as const;
const INSTALL_HINT = 'Install wp-cli: brew install wp-cli, or the phar from https://wp-cli.org/#installing';
const DIST_ARCHIVE_PACKAGE = 'wp-cli/dist-archive-command';

function extensionType(config: Config): (typeof TYPES)[number] {
  const type = config.type ?? 'plugin';
  if (!TYPES.includes(type as (typeof TYPES)[number])) {
    throw new Error(`deploy-wordpress type must be one of: ${TYPES.join(', ')}`);
  }
  return type as (typeof TYPES)[number];
}

function requireSlug(config: Config): string {
  if (!config.slug) throw new Error('deploy-wordpress requires a slug (the plugin/theme directory name)');
  return config.slug;
}

function isWindowsPath(path: string): boolean {
  return path.includes('\\') || /^[A-Za-z]:\//.test(path.replace(/\\/g, '/'));
}

function joinLike(base: string, ...parts: string[]): string {
  return isWindowsPath(base) ? join(base, ...parts) : posix.join(base, ...parts);
}

function sourceDir(ctx: { projectDir: string }, config: Config): string {
  if (!config.sourceDir) return ctx.projectDir;
  return joinLike(ctx.projectDir, config.sourceDir);
}

function packageArtifact(ctx: { outDir: string; version: string }, config: Config): string {
  return joinLike(ctx.outDir, `${requireSlug(config)}-${ctx.version}.zip`);
}

// wp-cli global params — they select which WordPress install every
// subcommand runs against, so every exec gets them appended.
function globalArgs(config: Config): string[] {
  const args: string[] = [];
  if (config.ssh) args.push(`--ssh=${config.ssh}`);
  if (config.path) args.push(`--path=${config.path}`);
  if (config.url) args.push(`--url=${config.url}`);
  return args;
}

function distArchiveArgs(ctx: { projectDir: string; outDir: string; version: string }, config: Config): string[] {
  return ['dist-archive', sourceDir(ctx, config), packageArtifact(ctx, config), '--format=zip'];
}

function installArgs(ctx: { artifact: string }, config: Config): string[] {
  const args = [extensionType(config), 'install', ctx.artifact, '--force'];
  if (config.activate !== false) args.push('--activate');
  return [...args, ...globalArgs(config)];
}

function siteUrl(config: Config): string | undefined {
  if (config.siteUrl) return config.siteUrl;
  if (!config.url) return undefined;
  return /^https?:\/\//.test(config.url) ? config.url : `https://${config.url}`;
}

// `wp plugin get --field=version` prints just the version, but wp-cli may
// prepend warnings (deprecations, PHP notices) on the same stream.
function parseVersion(stdout: string, fallback: string): string {
  const line = stdout.trim().split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return line && /^[\w.+-]+$/.test(line) ? line : fallback;
}

function renderPackagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config): string {
  return `${JSON.stringify({
    provider: 'wordpress',
    type: extensionType(config),
    slug: requireSlug(config),
    version: ctx.version,
    sourceDir: sourceDir(ctx, config),
    artifact: packageArtifact(ctx, config),
    command: ['wp', ...distArchiveArgs(ctx, config)],
  }, null, 2)}\n`;
}

export default defineTarget<Config>({
  id: 'deploy-wordpress',
  kind: 'plugin',
  label: 'WordPress (wp-cli)',

  async build(ctx, config) {
    const type = extensionType(config);
    const slug = requireSlug(config);

    if (ctx.dryRun) {
      const planPath = joinLike(ctx.outDir, 'wordpress-package.json');
      ctx.log(`wp-cli: dry-run dist-archive plan for ${type} ${slug} v${ctx.version}`);
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, renderPackagePlan(ctx, config), 'utf-8');
      return { artifact: planPath };
    }

    await ensureCli('wp', INSTALL_HINT, ctx.log);

    const { stdout } = await exec('wp', ['package', 'list', '--fields=name', '--format=csv'], {
      log: ctx.log,
      throwOnNonZero: false,
    });

    if (!stdout.includes(DIST_ARCHIVE_PACKAGE)) {
      ctx.log(`wp-cli: ${DIST_ARCHIVE_PACKAGE} not installed — installing`);
      await exec('wp', ['package', 'install', DIST_ARCHIVE_PACKAGE], {
        log: ctx.log,
        throwOnNonZero: true,
      });
    }

    ctx.log(`wp-cli: packaging ${type} ${slug} v${ctx.version}`);
    await mkdir(ctx.outDir, { recursive: true });

    await exec('wp', distArchiveArgs(ctx, config), {
      cwd: ctx.projectDir,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return { artifact: packageArtifact(ctx, config) };
  },

  async ship(ctx, config) {
    const type = extensionType(config);
    const slug = requireSlug(config);
    const target = config.ssh ?? config.path ?? '<unset>';

    ctx.log(`wp ${type} install · ${slug}@${ctx.version} · target=${target}`);

    if (ctx.dryRun) {
      ctx.log(`wp-cli: dry-run — would install and activate ${type} ${slug}`);
      return { id: 'dry-run' };
    }

    if (!config.ssh && !config.path) {
      throw new Error(
        'deploy-wordpress requires ssh or path so wp-cli knows which WordPress install to write to. '
        + 'Set ssh: "user@host:/var/www/html" for a remote site, or path: "/var/www/html" for a local one.',
      );
    }

    await ensureCli('wp', INSTALL_HINT, ctx.log);

    await exec('wp', installArgs(ctx, config), {
      log: ctx.log,
      throwOnNonZero: true,
    });

    const { stdout } = await exec('wp', [type, 'get', slug, '--field=version', ...globalArgs(config)], {
      log: ctx.log,
      throwOnNonZero: false,
    });
    const installed = parseVersion(stdout, ctx.version);

    ctx.log(`wp-cli: ${type} ${slug} now at v${installed}`);

    return { id: `${slug}@${installed}`, url: siteUrl(config) };
  },

  async status(shipId, config) {
    const [, version] = shipId.split('@');
    return { state: 'live', version, url: siteUrl(config) };
  },

  setup: setupGuide({
    label: 'WordPress (wp-cli)',
    vendorDocUrl: 'https://wp-cli.org/#installing',
    steps: [
      'Install wp-cli: brew install wp-cli, or download the phar from https://wp-cli.org/#installing',
      `Add the archive builder: wp package install ${DIST_ARCHIVE_PACKAGE}`,
      'Confirm the CLI can reach the site: wp core version --ssh=user@host:/var/www/html',
      'wp-cli authenticates over your SSH agent — no token goes in the sh1pt vault',
      'Set ssh (remote) or path (local) plus slug in the target config',
    ],
  }),
});
