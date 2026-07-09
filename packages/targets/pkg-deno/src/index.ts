import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// deno.land/x — the older Deno registry. No real "publish" — it
// auto-imports from a linked GitHub repo whenever a git tag is pushed
// that matches the configured pattern. Superseded by JSR for most use
// cases but still a common URL pattern in the Deno ecosystem.
interface Config {
  moduleName: string;            // registered at deno.land/x/<moduleName>
  sourceRepo: string;            // e.g. 'acme/my-lib' — must be pre-linked
  tagPrefix?: string;            // e.g. 'v' — default: empty
  remote?: string;               // git remote to push tags to — default: origin
  tagMessage?: string;           // set to create an annotated tag
}

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`pkg-deno requires ${field}`);
  return trimmed;
}

function optionalValue(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireValue(value, field);
}

function moduleName(value: string | undefined): string {
  const name = requireValue(value, 'moduleName');
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error('pkg-deno moduleName must contain only lowercase letters, numbers, or underscores');
  }
  return name;
}

function sourceRepo(value: string | undefined): string {
  const repo = requireValue(value, 'sourceRepo');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('pkg-deno sourceRepo must look like owner/repo');
  }
  return repo;
}

function gitRemote(value: string | undefined): string {
  const remote = optionalValue(value, 'remote') ?? 'origin';
  if (value !== undefined && remote !== value) throw new Error('pkg-deno remote must not contain whitespace');
  if (/\s/.test(remote)) throw new Error('pkg-deno remote must not contain whitespace');
  return remote;
}

function tagPrefix(value: string | undefined): string {
  if (value === undefined || value === '') return '';
  const prefix = value;
  if (prefix !== prefix.trim()) throw new Error('pkg-deno tagPrefix must not contain whitespace');
  if (/\s/.test(prefix)) throw new Error('pkg-deno tagPrefix must not contain whitespace');
  return prefix;
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    moduleName: moduleName(config.moduleName),
    sourceRepo: sourceRepo(config.sourceRepo),
    tagPrefix: tagPrefix(config.tagPrefix),
    remote: gitRemote(config.remote),
    tagMessage: optionalValue(config.tagMessage, 'tagMessage'),
  };
}

function tagFor(config: Config, version: string): string {
  config = normalizedConfig(config);
  return `${config.tagPrefix ?? ''}${version}`;
}

function urlFor(config: Config, tag: string): string {
  config = normalizedConfig(config);
  return `https://deno.land/x/${config.moduleName}@${tag}`;
}

function buildPlan(config: Config, version: string) {
  config = normalizedConfig(config);
  const moduleName = config.moduleName;
  const sourceRepo = config.sourceRepo;
  const remote = config.remote ?? 'origin';
  const tag = tagFor(config, version);
  const tagCommand = config.tagMessage
    ? ['tag', '-a', tag, '-m', config.tagMessage]
    : ['tag', tag];

  return {
    provider: 'deno.land/x',
    moduleName,
    sourceRepo,
    version,
    tag,
    remote,
    url: urlFor(config, tag),
    commands: {
      tag: ['git', ...tagCommand],
      push: ['git', 'push', remote, tag],
    },
    note: 'deno.land/x imports from the linked GitHub repository when this tag is pushed.',
  };
}

export default defineTarget<Config>({
  id: 'pkg-deno',
  kind: 'sdk',
  label: 'deno.land/x (git-tag registry)',
  async build(ctx, config) {
    const plan = buildPlan(config, ctx.version);
    const artifact = join(ctx.outDir, 'deno-land-publish.json');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    ctx.log(`wrote deno.land/x tag publish plan for ${plan.moduleName}@${plan.tag}`);
    return { artifact, meta: { tag: plan.tag, url: plan.url } };
  },
  async ship(ctx, config) {
    const plan = buildPlan(config, ctx.version);
    ctx.log(`git ${plan.commands.tag.slice(1).join(' ')} + git ${plan.commands.push.slice(1).join(' ')} · ${plan.url}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: plan };

    await exec('git', plan.commands.tag.slice(1), {
      cwd: ctx.projectDir,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });
    await exec('git', plan.commands.push.slice(1), {
      cwd: ctx.projectDir,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });

    return {
      id: `${plan.moduleName}@${plan.tag}`,
      url: plan.url,
      meta: { tag: plan.tag, remote: plan.remote, sourceRepo: plan.sourceRepo },
    };
  },

  setup: manualSetup({
    label: "deno.land/x",
    vendorDocUrl: "https://deno.land/add_module",
    steps: [
      "Open deno.land/add_module \u2192 add your GitHub repo + tag pattern",
      "deno.land/x pulls from git tags automatically; no token needed",
    ],
  }),
});
