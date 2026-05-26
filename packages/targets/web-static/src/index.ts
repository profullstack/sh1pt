import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { cp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

interface Config {
  dir: string;                 // built output directory
  provider: 'cloudflare-pages' | 'netlify' | 's3-cloudfront' | 'vercel';
  project?: string;
  domain?: string;
}

async function listFiles(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(root, path);
    if (entry.isFile()) return [relative(root, path).split(sep).join('/')];
    return [];
  }));
  return files.flat().sort();
}

function resolveSourceDir(ctx: { projectDir: string }, dir: string): string {
  if (!dir?.trim()) throw new Error('web-static requires dir');
  return resolve(ctx.projectDir, dir);
}

function siteUrl(config: Config): string | undefined {
  return config.domain ? `https://${config.domain}` : undefined;
}

export default defineTarget<Config>({
  id: 'web-static',
  kind: 'web',
  label: 'Static web (CDN)',
  async build(ctx, config) {
    const sourceDir = resolveSourceDir(ctx, config.dir);
    const info = await stat(sourceDir);
    if (!info.isDirectory()) throw new Error(`web-static dir is not a directory: ${sourceDir}`);

    const artifact = join(ctx.outDir, 'static');
    await mkdir(ctx.outDir, { recursive: true });
    await cp(sourceDir, artifact, { recursive: true, force: true });

    const files = await listFiles(artifact);
    const manifest = {
      provider: config.provider,
      project: config.project,
      domain: config.domain,
      sourceDir,
      artifact,
      version: ctx.version,
      files,
    };
    await writeFile(join(ctx.outDir, 'web-static-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    ctx.log(`staged static site from ${sourceDir} · files=${files.length}`);
    return { artifact, meta: { files: files.length, manifest: join(ctx.outDir, 'web-static-manifest.json') } };
  },
  async ship(ctx, config) {
    const url = siteUrl(config);
    const project = config.project ? `/${config.project}` : '';
    ctx.log(`static site ready for ${config.provider}${project}${url ? ` · ${url}` : ''}`);
    if (ctx.dryRun) return { id: 'dry-run', url, meta: { provider: config.provider, project: config.project } };
    return {
      id: `${config.provider}:${ctx.version}`,
      url,
      meta: {
        artifact: ctx.artifact,
        provider: config.provider,
        project: config.project,
      },
    };
  },

  setup: manualSetup({
    label: "Web / static hosting",
    steps: [
      "No auth here \u2014 web-static is a meta-target that picks the right",
      "hosting adapter (deploy-denodeploy, deploy-workers, deploy-fly, \u2026)",
      "based on your sh1pt.config.ts. Configure the underlying adapter instead.",
    ],
  }),
});
