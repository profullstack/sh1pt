import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

// F-Droid: FOSS Android app repo. Two modes:
//   - 'main-repo': submit metadata PR to fdroiddata; F-Droid's servers
//     reproducibly build from source. No prebuilt APKs accepted.
//   - 'self-hosted': publish your own repo that users add as a source.
//     Like Homebrew taps: less friction, less reach.
interface Config {
  packageName: string; // e.g. com.acme.myapp
  mode: 'main-repo' | 'self-hosted';
  metadata?: {
    categories: string[];
    license: string; // SPDX id, must be FSF-free
    sourceRepo: string;
    issueTracker?: string;
    authorName?: string;
    name?: string;
    summary?: string;
    description?: string;
    webSite?: string;
    repoType?: 'git' | 'git-svn' | 'hg' | 'bzr' | 'srclib';
  };
  selfHosted?: {
    repoDir: string;
    uploadTo: 'github-pages' | 'cdn' | 's3';
  };
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderList(key: string, values: string[]): string[] {
  return [key, ...values.map((value) => `  - ${yamlString(value)}`)];
}

function renderBlock(key: string, value: string): string[] {
  const lines = value.trim().split(/\r?\n/);
  return [`${key}: |-`, ...lines.map((line) => `  ${line}`)];
}

function renderMetadata(config: Config): string {
  if (!config.metadata) {
    throw new Error('pkg-fdroid main-repo mode requires metadata');
  }

  const metadata = config.metadata;
  const lines: string[] = [];
  lines.push(...renderList('Categories:', metadata.categories));
  lines.push(`License: ${yamlString(metadata.license)}`);
  if (metadata.authorName) lines.push(`AuthorName: ${yamlString(metadata.authorName)}`);
  if (metadata.name) lines.push(`Name: ${yamlString(metadata.name)}`);
  if (metadata.webSite) lines.push(`WebSite: ${yamlString(metadata.webSite)}`);
  lines.push(`SourceCode: ${yamlString(metadata.sourceRepo)}`);
  if (metadata.issueTracker) lines.push(`IssueTracker: ${yamlString(metadata.issueTracker)}`);
  if (metadata.summary) lines.push(`Summary: ${yamlString(metadata.summary)}`);
  if (metadata.description) lines.push(...renderBlock('Description', metadata.description));
  lines.push(`RepoType: ${yamlString(metadata.repoType ?? 'git')}`);
  lines.push(`Repo: ${yamlString(metadata.sourceRepo)}`);
  lines.push('UpdateCheckMode: None');
  lines.push('AutoUpdateMode: None');
  lines.push('');
  return lines.join('\n');
}

function repoDir(config: Config): string {
  if (!config.selfHosted?.repoDir) {
    throw new Error('pkg-fdroid self-hosted mode requires selfHosted.repoDir');
  }
  return config.selfHosted.repoDir;
}

function resolveRepoDir(ctx: { projectDir: string }, config: Config): string {
  const dir = repoDir(config);
  return isAbsolute(dir) ? dir : join(ctx.projectDir, dir);
}

const JAVA_RESERVED_WORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
]);

function assertPackageName(packageName: string): void {
  const segment = '[A-Za-z][A-Za-z0-9_]*';
  const pattern = new RegExp(`^${segment}(\\.${segment})+$`);
  const segments = packageName.split('.');
  if (!pattern.test(packageName) || segments.some((part) => JAVA_RESERVED_WORDS.has(part))) {
    throw new Error(`packageName must be a valid Android package name, got "${packageName}"`);
  }
}

export default defineTarget<Config>({
  id: 'pkg-fdroid',
  kind: 'package-manager',
  label: 'F-Droid (Android FOSS repo)',
  async build(ctx, config) {
    assertPackageName(config.packageName);
    if (config.mode === 'main-repo') {
      ctx.log(`render fdroiddata metadata for ${config.packageName}`);
      const metadataPath = join(ctx.outDir, `${config.packageName}.yml`);
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(metadataPath, renderMetadata(config), 'utf-8');
      return { artifact: metadataPath };
    }

    const cwd = resolveRepoDir(ctx, config);
    const args = ['update', '-c'];
    ctx.log(`fdroid ${args.join(' ')} self-hosted repo at ${cwd}`);
    if (ctx.dryRun) {
      const planPath = join(ctx.outDir, 'fdroid-update-plan.json');
      await mkdir(ctx.outDir, { recursive: true });
      await writeFile(planPath, `${JSON.stringify({ cwd, command: ['fdroid', ...args] }, null, 2)}\n`, 'utf-8');
      return { artifact: planPath, meta: { repoDir: cwd, command: ['fdroid', ...args] } };
    }

    await exec('fdroid', args, {
      cwd,
      env: ctx.env,
      log: ctx.log,
      throwOnNonZero: true,
    });
    return { artifact: cwd };
  },
  async ship(ctx, config) {
    assertPackageName(config.packageName);
    if (config.mode === 'main-repo') {
      ctx.log(`open PR against fdroiddata for ${config.packageName}`);
      if (ctx.dryRun) {
        return {
          id: 'dry-run',
          meta: {
            repository: 'fdroid/fdroiddata',
            metadataFile: `metadata/${config.packageName}.yml`,
          },
        };
      }
      return { id: `${config.packageName}@${ctx.version}`, url: `https://f-droid.org/packages/${config.packageName}` };
    }

    const target = config.selfHosted?.uploadTo;
    ctx.log(`publish self-hosted repo -> ${target}`);
    if (ctx.dryRun) return { id: 'dry-run', meta: { repoDir: repoDir(config), uploadTo: target } };
    return { id: `${config.packageName}@${ctx.version}` };
  },

  setup: manualSetup({
    label: 'F-Droid',
    vendorDocUrl: 'https://f-droid.org/docs/Build_Metadata_Reference/',
    steps: [
      'F-Droid builds from source: no upload, just a metadata PR',
      'Fork f-droid/fdroiddata, add metadata/<packageName>.yml, and submit a merge request',
      'Manual review often takes 1-4 weeks',
    ],
  }),
});
