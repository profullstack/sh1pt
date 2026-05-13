import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// JS/TS CDNs. Most auto-mirror npm, so "publish to CDN" = "publish to
// npm + verify it resolves." Only cdnjs requires an explicit submission
// (PR against cdnjs/packages).
type Mirror = 'jsdelivr' | 'unpkg' | 'esm.sh' | 'cdnjs' | 'skypack' | 'jspm';
const MIRRORS: readonly Mirror[] = ['jsdelivr', 'unpkg', 'esm.sh', 'cdnjs', 'skypack', 'jspm'];

interface Config {
  packageName: string;                 // npm package name
  mirrors: Mirror[];
  // cdnjs submission inputs (only if 'cdnjs' in mirrors)
  cdnjs?: { autoupdateSource: 'npm' | 'git'; sourceRepo?: string; libraryName?: string };
}

const URL_FOR: Record<Mirror, (pkg: string, v: string) => string> = {
  jsdelivr: (pkg, v) => `https://cdn.jsdelivr.net/npm/${pkg}@${v}/`,
  unpkg: (pkg, v) => `https://unpkg.com/${pkg}@${v}/`,
  'esm.sh': (pkg, v) => `https://esm.sh/${pkg}@${v}`,
  cdnjs: (pkg, v) => `https://cdnjs.cloudflare.com/ajax/libs/${pkg}/${v}/`,
  skypack: (pkg, v) => `https://cdn.skypack.dev/${pkg}@${v}`,
  jspm: (pkg, v) => `https://ga.jspm.io/npm:${pkg}@${v}/`,
};

interface MirrorEntry {
  mirror: Mirror;
  url: string;
  source: 'npm' | 'manual';
  autoMirrored: boolean;
}

interface CheckResult {
  mirror: Mirror;
  url: string;
  ok: boolean;
  status: number;
  method: 'HEAD' | 'GET';
}

function requirePackageName(config: Config): string {
  const packageName = config.packageName?.trim();
  if (!packageName) throw new Error('pkg-cdn requires packageName');
  return packageName;
}

function resolveMirrors(config: Config): Mirror[] {
  if (!config.mirrors?.length) throw new Error('pkg-cdn requires at least one mirror');
  const mirrors: Mirror[] = [];
  for (const mirror of config.mirrors) {
    if (!MIRRORS.includes(mirror)) throw new Error(`pkg-cdn unsupported mirror: ${String(mirror)}`);
    if (!mirrors.includes(mirror)) mirrors.push(mirror);
  }
  return mirrors;
}

function cdnjsLibraryName(config: Config): string {
  return config.cdnjs?.libraryName?.trim() || requirePackageName(config).replace(/^@/, '').replace('/', '-');
}

function resolveEntries(config: Config, version: string): MirrorEntry[] {
  const packageName = requirePackageName(config);
  return resolveMirrors(config).map((mirror) => {
    const url = mirror === 'cdnjs'
      ? URL_FOR.cdnjs(cdnjsLibraryName(config), version)
      : URL_FOR[mirror](packageName, version);
    const autoMirrored = mirror !== 'cdnjs';

    return {
      mirror,
      url,
      source: autoMirrored ? 'npm' : 'manual',
      autoMirrored,
    };
  });
}

function manifestFor(config: Config, version: string) {
  const entries = resolveEntries(config, version);
  const usesCdnjs = entries.some((entry) => entry.mirror === 'cdnjs');

  return {
    provider: 'pkg-cdn',
    packageName: requirePackageName(config),
    version,
    mirrors: entries,
    cdnjs: usesCdnjs ? {
      libraryName: cdnjsLibraryName(config),
      autoupdateSource: config.cdnjs?.autoupdateSource ?? 'npm',
      sourceRepo: config.cdnjs?.sourceRepo,
      requiresManualSubmission: true,
    } : undefined,
  };
}

async function checkMirror(entry: MirrorEntry): Promise<CheckResult> {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch is not available for CDN mirror checks');
  }

  const head = await fetch(entry.url, { method: 'HEAD', redirect: 'follow' });
  if (head.ok || head.status !== 405) {
    return {
      mirror: entry.mirror,
      url: entry.url,
      ok: head.ok,
      status: head.status,
      method: 'HEAD',
    };
  }

  const get = await fetch(entry.url, {
    method: 'GET',
    headers: { range: 'bytes=0-0' },
    redirect: 'follow',
  });

  return {
    mirror: entry.mirror,
    url: entry.url,
    ok: get.ok,
    status: get.status,
    method: 'GET',
  };
}

export default defineTarget<Config>({
  id: 'pkg-cdn',
  kind: 'package-manager',
  label: 'JS/TS CDN mirrors (jsDelivr / unpkg / esm.sh / cdnjs / Skypack / JSPM)',
  async build(ctx, config) {
    const manifest = manifestFor(config, ctx.version);
    const artifact = join(ctx.outDir, 'cdn-manifest.json');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    ctx.log(`wrote CDN mirror manifest for ${manifest.packageName}@${ctx.version}`);
    return { artifact, meta: { urls: manifest.mirrors.map((entry) => entry.url) } };
  },
  async ship(ctx, config) {
    const entries = resolveEntries(config, ctx.version);
    const urls = entries.map((entry) => entry.url);
    ctx.log(`cdn mirrors:\n  ${urls.join('\n  ')}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { urls, mirrors: entries } };

    const checks = await Promise.all(entries.map(checkMirror));
    const failures = checks.filter((check) => !check.ok);
    if (failures.length) {
      const detail = failures
        .map((check) => `${check.mirror} ${check.method} ${check.status} ${check.url}`)
        .join('; ');
      throw new Error(`CDN mirror checks failed: ${detail}`);
    }

    return {
      id: `${requirePackageName(config)}@${ctx.version}`,
      url: urls[0],
      meta: { urls, mirrors: entries, checks },
    };
  },
  async status(id) {
    return { state: 'live', version: id };
  },

  setup: manualSetup({
    label: "CDN (jsDelivr / unpkg / esm.sh)",
    vendorDocUrl: "https://www.jsdelivr.com/",
    steps: [
      "Publish to npm first \u2014 jsDelivr + unpkg + esm.sh serve directly from npm",
      "No auth here; this adapter just validates the package resolves on each CDN",
    ],
  }),
});
