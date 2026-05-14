import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildContext, BuildResult, Target, TargetSpec } from '@profullstack/sh1pt-core';
import { loadManifestFromProject } from './manifest-loader.js';

export interface BuildProjectOptions {
  projectDir: string;
  channel: string;
  targets?: string[];
  dryRun?: boolean;
  log?: BuildContext['log'];
}

export interface TargetBuildResult {
  targetId: string;
  adapterId: string;
  artifact: string;
  meta?: Record<string, unknown>;
}

export async function buildProject(options: BuildProjectOptions): Promise<TargetBuildResult[]> {
  const { manifest, projectDir } = await loadManifestFromProject(options.projectDir);
  const targetEntries = selectTargets(manifest.targets, options.targets);
  const results: TargetBuildResult[] = [];

  for (const [targetId, spec] of targetEntries) {
    if (spec.enabled === false) continue;

    const adapter = await loadTargetAdapter(spec.use);
    const config = adapter.validate ? adapter.validate(spec.config) : spec.config;
    const outDir = join(projectDir, '.sh1pt', 'build', options.channel, targetId);
    await mkdir(outDir, { recursive: true });

    const result: BuildResult = await adapter.build({
      projectDir,
      outDir,
      version: manifest.version,
      channel: options.channel,
      env: currentEnv(),
      secret: (key) => process.env[key],
      log: options.log ?? (() => {}),
      dryRun: options.dryRun,
    }, config);

    results.push({
      targetId,
      adapterId: adapter.id,
      artifact: result.artifact,
      meta: result.meta,
    });
  }

  return results;
}

function selectTargets(targets: Record<string, TargetSpec>, requested?: string[]): Array<[string, TargetSpec]> {
  if (!requested?.length) return Object.entries(targets);

  const selected: Array<[string, TargetSpec]> = [];
  for (const targetId of requested) {
    const spec = targets[targetId];
    if (!spec) {
      const available = Object.keys(targets).sort().join(', ');
      throw new Error(`Unknown target "${targetId}". Available targets: ${available}`);
    }
    selected.push([targetId, spec]);
  }
  return selected;
}

async function loadTargetAdapter(use: string): Promise<Target<unknown>> {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(use)) {
    throw new Error(`Invalid target adapter id: ${use}`);
  }

  const packageName = `@profullstack/sh1pt-target-${use}`;
  try {
    return normalizeAdapter(await import(packageName), packageName);
  } catch (packageError) {
    const localUrl = new URL(`../../targets/${use}/src/index.ts`, import.meta.url);
    try {
      return normalizeAdapter(await import(localUrl.href), localUrl.href);
    } catch {
      const message = packageError instanceof Error ? packageError.message : String(packageError);
      throw new Error(`Could not load target adapter "${use}" (${packageName}): ${message}`);
    }
  }
}

function normalizeAdapter(mod: unknown, source: string): Target<unknown> {
  const maybeDefault = mod && typeof mod === 'object' && 'default' in mod
    ? (mod as { default: unknown }).default
    : mod;

  if (!maybeDefault || typeof maybeDefault !== 'object' || !('build' in maybeDefault)) {
    throw new Error(`Target adapter ${source} did not export a buildable adapter`);
  }

  return maybeDefault as Target<unknown>;
}

function currentEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}
