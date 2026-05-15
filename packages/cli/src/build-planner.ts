import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ResolvedInput } from './input.js';

export interface BuildPlan {
  input: ResolvedInput;
  mode: 'offline';
  targets: string[];
  evidence: string[];
  nextSteps: string[];
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  contributes?: unknown;
}

export function planBuildFrom(input: ResolvedInput): BuildPlan {
  if (input.kind === 'git') {
    return remotePlan(input, 'Clone the repository locally, then rerun `sh1pt build --from <path>` to inspect manifests offline.');
  }
  if (input.kind === 'url') {
    return remotePlan(input, 'Create or point to a local project checkout; sh1pt does not fetch or probe live URLs during planning.');
  }
  if (input.kind === 'doc') {
    return planDoc(input);
  }
  return planPath(input);
}

function remotePlan(input: ResolvedInput, nextStep: string): BuildPlan {
  return {
    input,
    mode: 'offline',
    targets: [],
    evidence: ['remote inputs are classified only; no network access was performed'],
    nextSteps: [nextStep],
  };
}

function planDoc(input: ResolvedInput): BuildPlan {
  const evidence = [input.exists === false ? 'manifest document is missing on disk' : `manifest document: ${input.value}`];
  const targets = new Set<string>();
  if (input.exists) {
    const lower = readText(input.value).toLowerCase();
    if (lower.includes('vercel')) targets.add('deploy-vercel');
    if (lower.includes('netlify')) targets.add('deploy-netlify');
    if (lower.includes('expo') || lower.includes('eas')) targets.add('mobile-expo');
    if (lower.includes('npm')) targets.add('pkg-npm');
    if (lower.includes('docker')) targets.add('pkg-docker');
  }
  return {
    input,
    mode: 'offline',
    targets: [...targets],
    evidence,
    nextSteps: targets.size ? ['Review the inferred targets and run `sh1pt build --target <id>` when ready.'] : ['Add target metadata to the manifest or pass a local project directory.'],
  };
}

function planPath(input: ResolvedInput): BuildPlan {
  if (input.exists === false || !existsSync(input.value)) {
    return {
      input,
      mode: 'offline',
      targets: [],
      evidence: ['local path does not exist'],
      nextSteps: ['Create the project path or pass an existing checkout.'],
    };
  }

  const root = statSync(input.value).isDirectory() ? input.value : dirname(input.value);
  const targets = new Set<string>();
  const evidence: string[] = [];

  const packageJson = readJson(join(root, 'package.json'));
  if (packageJson) {
    evidence.push('package.json');
    targets.add('pkg-npm');
    const deps = depsOf(packageJson);
    const scripts = scriptsOf(packageJson);
    if (deps.has('expo') || deps.has('expo-router') || hasScript(scripts, 'eas ')) targets.add('mobile-expo');
    if (deps.has('electron') || deps.has('tauri') || hasScript(scripts, 'electron') || hasScript(scripts, 'tauri')) {
      targets.add('desktop-mac');
      targets.add('desktop-win');
      targets.add('desktop-linux');
    }
    if (deps.has('@vscode/vsce') || packageJson.engines?.vscode || packageJson.contributes) targets.add('plugin-vscode');
    if (hasScript(scripts, 'vite') || hasScript(scripts, 'next') || deps.has('vite') || deps.has('next')) targets.add('web-static');
  }

  if (existsSync(join(root, 'Dockerfile')) || existsSync(join(root, 'docker-compose.yml'))) {
    evidence.push('Dockerfile/docker-compose');
    targets.add('pkg-docker');
  }
  if (existsSync(join(root, 'vercel.json'))) {
    evidence.push('vercel.json');
    targets.add('deploy-vercel');
  }
  if (existsSync(join(root, 'netlify.toml'))) {
    evidence.push('netlify.toml');
    targets.add('deploy-netlify');
  }
  if (existsSync(join(root, 'eas.json')) || existsSync(join(root, 'app.json')) || existsSync(join(root, 'app.config.ts'))) {
    evidence.push('Expo app/eas config');
    targets.add('mobile-expo');
  }
  if (existsSync(join(root, 'tauri.conf.json')) || existsSync(join(root, 'src-tauri'))) {
    evidence.push('Tauri config');
    targets.add('desktop-mac');
    targets.add('desktop-win');
    targets.add('desktop-linux');
  }
  if (hasAny(root, ['Cargo.toml', 'pyproject.toml', 'go.mod'])) {
    evidence.push('language/package manifest');
  }

  return {
    input,
    mode: 'offline',
    targets: [...targets].sort(),
    evidence,
    nextSteps: targets.size
      ? ['Review the inferred targets and run `sh1pt build --target <id>` when ready.']
      : ['No supported targets inferred; add sh1pt target config or pass a more specific manifest.'],
  };
}

function readJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

function depsOf(pkg: PackageJson): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

function scriptsOf(pkg: PackageJson): Record<string, string> {
  return pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
}

function hasScript(scripts: Record<string, string>, token: string): boolean {
  return Object.values(scripts).some((script) => script.includes(token));
}

function hasAny(root: string, names: string[]): boolean {
  const entries = new Set(readdirSync(root));
  return names.some((name) => entries.has(name));
}
