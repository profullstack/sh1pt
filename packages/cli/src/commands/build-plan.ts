import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ResolvedInput } from '../input.js';

export type BuildPlanConfidence = 'high' | 'medium' | 'low';

export interface BuildPlanTarget {
  id: string;
  confidence: BuildPlanConfidence;
  reason: string;
}

export interface BuildPlanSignal {
  source: string;
  detail: string;
}

export interface BuildPlan {
  source: {
    kind: ResolvedInput['kind'];
    raw: string;
    value: string;
    exists?: boolean;
  };
  projectName?: string;
  root?: string;
  signals: BuildPlanSignal[];
  targets: BuildPlanTarget[];
  warnings: string[];
  nextSteps: string[];
}

type JsonObject = Record<string, unknown>;

const CONFIDENCE_RANK: Record<BuildPlanConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function createBuildPlan(input: ResolvedInput): BuildPlan {
  const plan: BuildPlan = {
    source: {
      kind: input.kind,
      raw: input.raw,
      value: input.value,
      exists: input.exists,
    },
    projectName: input.inferredName,
    signals: [],
    targets: [],
    warnings: [],
    nextSteps: [],
  };

  if (input.kind === 'git') {
    plan.warnings.push('Remote git inputs are classified but not fetched by this offline planner.');
    plan.nextSteps.push('Check out the repo locally, then rerun `sh1pt build --from <path>` for manifest detection.');
    return plan;
  }

  if (input.kind === 'url') {
    plan.warnings.push('Live URL stack probing is not implemented yet; this planner avoids network probes.');
    plan.nextSteps.push('Point `--from` at the local project or a manifest doc to generate target recommendations.');
    return plan;
  }

  const root = localRoot(input.value);
  plan.root = root;

  if (!existsSync(root)) {
    plan.warnings.push(`Local input does not exist: ${root}`);
    plan.nextSteps.push('Create the project directory or pass an existing manifest path.');
    return plan;
  }

  if (!statSync(root).isDirectory()) {
    plan.warnings.push(`Local input is not a directory: ${root}`);
    plan.nextSteps.push('Pass a project directory or supported manifest document.');
    return plan;
  }

  plan.projectName = plan.projectName ?? basename(root);
  inspectPackageJson(root, plan);
  inspectDeploymentFiles(root, plan);
  inspectLanguageManifests(root, plan);

  if (plan.targets.length === 0) {
    plan.warnings.push('No supported build targets were inferred from the local manifests.');
    plan.nextSteps.push('Add sh1pt.config.ts or pass explicit --target values once the project shape is known.');
  } else {
    plan.nextSteps.push('Review the target list, then rerun with explicit --target values when ready to execute real builds.');
  }

  return plan;
}

export function formatBuildPlan(plan: BuildPlan): string[] {
  const lines = [
    `build plan · ${plan.projectName ?? plan.source.raw}`,
    `source: [${plan.source.kind}] ${plan.source.value}`,
  ];
  if (plan.root) lines.push(`root: ${plan.root}`);
  lines.push('mode: offline manifest scan; no scripts executed');

  if (plan.targets.length > 0) {
    lines.push('targets:');
    for (const target of plan.targets) {
      lines.push(`  - ${target.id} (${target.confidence}) ${target.reason}`);
    }
  }

  if (plan.signals.length > 0) {
    lines.push('signals:');
    for (const signal of plan.signals) {
      lines.push(`  - ${signal.source}: ${signal.detail}`);
    }
  }

  if (plan.warnings.length > 0) {
    lines.push('warnings:');
    for (const warning of plan.warnings) lines.push(`  - ${warning}`);
  }

  if (plan.nextSteps.length > 0) {
    lines.push('next steps:');
    for (const step of plan.nextSteps) lines.push(`  - ${step}`);
  }

  return lines;
}

function localRoot(value: string): string {
  if (!existsSync(value)) return value;
  const stat = statSync(value);
  return stat.isDirectory() ? value : dirname(value);
}

function inspectPackageJson(root: string, plan: BuildPlan): void {
  const pkg = readJsonObject(join(root, 'package.json'));
  if (!pkg) return;

  addSignal(plan, 'package.json', 'Node package manifest found');
  addTarget(plan, 'pkg-npm', 'medium', 'package.json can be prepared for npm or workspace packaging');

  const scripts = getStringMap(pkg.scripts);
  if (scripts.build) {
    addSignal(plan, 'package.json', `build script: ${scripts.build}`);
    addTarget(plan, 'web-static', 'medium', 'build script can produce static web artifacts');
  }

  const deps = dependencyNames(pkg);
  if (hasAny(deps, ['next'])) {
    addSignal(plan, 'package.json', 'Next.js dependency detected');
    addTarget(plan, 'web-static', 'high', 'Next.js project can produce web artifacts');
    addTarget(plan, 'deploy-vercel', 'medium', 'Next.js is commonly deployed through Vercel');
  }
  if (hasAny(deps, ['vite', '@vitejs/plugin-react', '@vitejs/plugin-vue', 'astro', '@sveltejs/kit'])) {
    addSignal(plan, 'package.json', 'modern static web build dependency detected');
    addTarget(plan, 'web-static', 'high', 'Vite/Astro/SvelteKit-style project can emit static web artifacts');
  }
  if (hasAny(deps, ['expo'])) {
    addSignal(plan, 'package.json', 'Expo dependency detected');
    addTarget(plan, 'mobile-expo', 'high', 'Expo project can use the mobile Expo target');
  }
  if (hasAny(deps, ['electron', 'electron-builder', '@electron-forge/cli'])) {
    addSignal(plan, 'package.json', 'Electron dependency detected');
    addTarget(plan, 'desktop-mac', 'medium', 'Electron project can be packaged for macOS');
    addTarget(plan, 'desktop-win', 'medium', 'Electron project can be packaged for Windows');
    addTarget(plan, 'desktop-linux', 'medium', 'Electron project can be packaged for Linux');
  }
  if (hasAny(deps, ['@tauri-apps/cli', '@tauri-apps/api'])) {
    addSignal(plan, 'package.json', 'Tauri dependency detected');
    addTarget(plan, 'desktop-mac', 'medium', 'Tauri project can be packaged for macOS');
    addTarget(plan, 'desktop-win', 'medium', 'Tauri project can be packaged for Windows');
    addTarget(plan, 'desktop-linux', 'medium', 'Tauri project can be packaged for Linux');
  }

  const engines = asObject(pkg.engines);
  if (typeof engines?.vscode === 'string') {
    addSignal(plan, 'package.json', 'VS Code extension engine detected');
    addTarget(plan, 'plugin-vscode', 'high', 'VS Code extension manifest can target plugin-vscode');
  }
}

function inspectDeploymentFiles(root: string, plan: BuildPlan): void {
  if (fileExists(root, 'Dockerfile')) {
    addSignal(plan, 'Dockerfile', 'container build recipe found');
    addTarget(plan, 'pkg-docker', 'high', 'Dockerfile can be packaged as a container image');
  }
  if (fileExists(root, 'docker-compose.yml') || fileExists(root, 'docker-compose.yaml') || fileExists(root, 'compose.yml')) {
    addSignal(plan, 'docker-compose', 'compose file found');
    addTarget(plan, 'deploy-coolify', 'medium', 'Compose-backed services can map to Coolify-style deploys');
  }
  if (fileExists(root, 'vercel.json') || fileExists(root, 'next.config.js') || fileExists(root, 'next.config.mjs') || fileExists(root, 'next.config.ts')) {
    addSignal(plan, 'vercel/next config', 'Vercel or Next.js config found');
    addTarget(plan, 'deploy-vercel', 'high', 'Vercel/Next config can seed a Vercel deploy target');
  }
  if (fileExists(root, 'netlify.toml')) {
    addSignal(plan, 'netlify.toml', 'Netlify config found');
    addTarget(plan, 'deploy-netlify', 'high', 'Netlify config can seed a Netlify deploy target');
  }
  if (fileExists(root, 'wrangler.toml') || fileExists(root, 'wrangler.json')) {
    addSignal(plan, 'wrangler config', 'Cloudflare Workers config found');
    addTarget(plan, 'deploy-workers', 'high', 'Wrangler config can seed a Workers deploy target');
  }
  if (fileExists(root, 'fly.toml')) {
    addSignal(plan, 'fly.toml', 'Fly.io config found');
    addTarget(plan, 'deploy-fly', 'high', 'Fly config can seed a Fly deploy target');
  }
  if (fileExists(root, 'railway.json')) {
    addSignal(plan, 'railway.json', 'Railway config found');
    addTarget(plan, 'deploy-railway', 'high', 'Railway config can seed a Railway deploy target');
  }
  if (fileExists(root, 'render.yaml') || fileExists(root, 'render.yml')) {
    addSignal(plan, 'render config', 'Render blueprint found');
    addTarget(plan, 'deploy-render', 'high', 'Render blueprint can seed a Render deploy target');
  }
}

function inspectLanguageManifests(root: string, plan: BuildPlan): void {
  if (fileExists(root, 'pyproject.toml') || fileExists(root, 'setup.py')) {
    addSignal(plan, 'python manifest', 'Python package manifest found');
    addTarget(plan, 'sdk-pypi', 'medium', 'Python package can be prepared for PyPI distribution');
  }
  if (fileExists(root, 'src-tauri/tauri.conf.json') || fileExists(root, 'src-tauri/tauri.conf.json5')) {
    addSignal(plan, 'src-tauri', 'Tauri config found');
    addTarget(plan, 'desktop-mac', 'high', 'Tauri config can seed a macOS desktop build');
    addTarget(plan, 'desktop-win', 'high', 'Tauri config can seed a Windows desktop build');
    addTarget(plan, 'desktop-linux', 'high', 'Tauri config can seed a Linux desktop build');
  }
  if (fileExists(root, 'app.json') || fileExists(root, 'app.config.js') || fileExists(root, 'app.config.ts')) {
    const appJson = readJsonObject(join(root, 'app.json'));
    if (!appJson || asObject(appJson.expo)) {
      addSignal(plan, 'Expo app config', 'Expo app config found');
      addTarget(plan, 'mobile-expo', 'medium', 'Expo app config can seed the mobile Expo target');
    }
  }
}

function readJsonObject(path: string): JsonObject | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return asObject(parsed);
  } catch {
    return undefined;
  }
}

function addSignal(plan: BuildPlan, source: string, detail: string): void {
  if (plan.signals.some((signal) => signal.source === source && signal.detail === detail)) return;
  plan.signals.push({ source, detail });
}

function addTarget(plan: BuildPlan, id: string, confidence: BuildPlanConfidence, reason: string): void {
  const existing = plan.targets.find((target) => target.id === id);
  if (!existing) {
    plan.targets.push({ id, confidence, reason });
    return;
  }
  if (CONFIDENCE_RANK[confidence] > CONFIDENCE_RANK[existing.confidence]) {
    existing.confidence = confidence;
    existing.reason = reason;
  }
}

function fileExists(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

function dependencyNames(pkg: JsonObject): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = asObject(pkg[field]);
    if (!deps) continue;
    for (const name of Object.keys(deps)) names.add(name);
  }
  return names;
}

function getStringMap(value: unknown): Record<string, string> {
  const object = asObject(value);
  if (!object) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(object)) {
    if (typeof val === 'string') out[key] = val;
  }
  return out;
}

function hasAny(values: Set<string>, needles: string[]): boolean {
  return needles.some((needle) => values.has(needle));
}

function asObject(value: unknown): JsonObject | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  return undefined;
}
