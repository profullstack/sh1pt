import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

// Roku apps run on BrightScript + SceneGraph. Unlike tvOS / Android TV /
// Fire TV, there is no supported React runtime on Roku OS — react-tv is
// abandoned and third-party transpilers (Plenary) are closed-source. So
// this adapter assumes the user supplies a Roku channel source tree
// (manifest + components/ + images/) rather than sharing the JS codebase.
// Future: evaluate building a BrightScript codegen from a constrained
// React subset; out of scope for the v0 stub.
interface Config {
  channelId?: string;         // Roku-assigned, set after first submission
  developerId: string;        // from Roku Developer Dashboard
  sourceDir: string;          // path to the Roku channel source tree
  // channel type — 'public' goes through Roku review, 'beta' is invite-only
  channelType: 'public' | 'beta' | 'private';
}

type RokuManifest = Record<string, string>;

const CHANNEL_TYPES = ['public', 'beta', 'private'] as const;

function requireValue(value: string | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`tv-roku requires ${field}`);
  return trimmed;
}

function requireChannelType(value: string | undefined): Config['channelType'] {
  const channelType = requireValue(value, 'channelType');
  if (!CHANNEL_TYPES.includes(channelType as Config['channelType'])) {
    throw new Error(`tv-roku channelType must be one of: ${CHANNEL_TYPES.join(', ')}`);
  }
  return channelType as Config['channelType'];
}

function parseManifest(text: string): RokuManifest {
  const manifest: RokuManifest = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    manifest[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return manifest;
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

async function packagePlan(ctx: { projectDir: string; outDir: string; version: string }, config: Config) {
  const developerId = requireValue(config.developerId, 'developerId');
  const channelType = requireChannelType(config.channelType);
  const sourceDir = resolve(ctx.projectDir, requireValue(config.sourceDir, 'sourceDir'));
  const info = await stat(sourceDir);
  if (!info.isDirectory()) throw new Error(`tv-roku sourceDir is not a directory: ${sourceDir}`);

  const manifest = parseManifest(await readFile(join(sourceDir, 'manifest'), 'utf-8'));
  const title = requireValue(manifest.title, 'manifest title');
  const major = requireValue(manifest.major_version, 'manifest major_version');
  const minor = requireValue(manifest.minor_version, 'manifest minor_version');
  const build = manifest.build_version ?? ctx.version;
  const icon = manifest.mm_icon_focus_hd ?? manifest.mm_icon_focus_sd ?? manifest.icon_focus_hd;
  if (icon) await access(join(sourceDir, icon));

  const files = await listFiles(sourceDir);
  const expectedPackage = join(ctx.outDir, 'roku-channel.zip');
  return {
    provider: 'roku',
    title,
    version: `${major}.${minor}.${build}`,
    channelId: config.channelId,
    developerId,
    channelType,
    sourceDir,
    expectedPackage,
    files,
    command: ['zip', '-r', expectedPackage, '.'],
    submission: channelType === 'public' ? 'Roku Channel Store review' : `${channelType} channel`,
  };
}

export default defineTarget<Config>({
  id: 'tv-roku',
  kind: 'tv',
  label: 'Roku Channel Store',
  async build(ctx, config) {
    const plan = await packagePlan(ctx, config);
    await mkdir(ctx.outDir, { recursive: true });
    const artifact = join(ctx.outDir, 'roku-package-plan.json');
    await writeFile(artifact, `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');
    ctx.log(`validated Roku manifest for ${plan.title}@${plan.version} · files=${plan.files.length}`);
    return { artifact, meta: { expectedPackage: plan.expectedPackage, files: plan.files.length, command: plan.command } };
  },
  async ship(ctx, config) {
    const channelType = requireChannelType(config.channelType);
    const dest = channelType === 'public' ? 'Roku Channel Store review' : `${channelType} channel`;
    ctx.log(`Roku package ready for ${dest}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { channelType, destination: dest } };
    return {
      id: `${config.channelId ?? 'pending'}@${ctx.version}`,
      meta: {
        artifact: ctx.artifact,
        channelType,
        destination: dest,
        developerId: config.developerId,
      },
    };
  },
  async status(id) {
    return { state: 'in-review', version: id };
  },

  setup: manualSetup({
    label: "Roku Channel Store",
    vendorDocUrl: "https://developer.roku.com/",
    steps: [
      "\u26a0 Roku uses BrightScript \u2014 not JS/React. Need a separate codebase.",
      "Register at developer.roku.com ($0) \u2192 submit a channel package for review",
      "Manual review 1-2 weeks",
    ],
  }),
});
