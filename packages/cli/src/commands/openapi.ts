import { Command } from 'commander';
import kleur from 'kleur';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSpec, normalize, parseSpec } from '@profullstack/sh1pt-openapi/core';
import { generateTsSdk } from '@profullstack/sh1pt-openapi/gen-sdk-ts';
import { generateMcpServer } from '@profullstack/sh1pt-openapi/gen-mcp';
import { generateDocsSite } from '@profullstack/sh1pt-openapi/gen-docs';
import { diffApis, formatDiff } from '@profullstack/sh1pt-openapi/diff';

// Stainless-style three-in-one: a single OpenAPI spec drives an SDK,
// an MCP server, and a docs site — each emitted to its own dir, ready
// to be shipped via the existing sh1pt deploy/ship verbs.
export const openapiCmd = new Command('openapi')
  .description('Generate SDKs, MCP servers, and docs sites from an OpenAPI spec.');

openapiCmd
  .command('sdk')
  .description('Generate a TypeScript SDK from an OpenAPI spec.')
  .argument('<spec>', 'path or URL to an OpenAPI 3.x spec (json or yaml)')
  .option('--out <dir>', 'output directory', './generated/sdk')
  .option('--lang <lang>', 'language target (only "ts" supported)', 'ts')
  .option('--package-name <name>', 'name field for generated package.json')
  .option('--base-url <url>', 'default base URL (overrides servers[0])')
  .action(async (spec: string, opts: { out: string; lang: string; packageName?: string; baseUrl?: string }) => {
    if (opts.lang !== 'ts') throw new Error(`unsupported lang: ${opts.lang} (only "ts" so far)`);
    const ir = normalize(await loadSpec(spec));
    const outDir = resolve(opts.out);
    const files = await generateTsSdk(ir, { outDir, packageName: opts.packageName, defaultBaseUrl: opts.baseUrl });
    console.log(kleur.green(`✔ wrote ${files.length} files to ${outDir}`));
  });

openapiCmd
  .command('mcp')
  .description('Generate an MCP server from an OpenAPI spec — one tool per operation.')
  .argument('<spec>', 'path or URL to an OpenAPI 3.x spec (json or yaml)')
  .option('--out <dir>', 'output directory', './generated/mcp')
  .option('--package-name <name>', 'name field for generated package.json')
  .option('--base-url <url>', 'default upstream API base URL')
  .action(async (spec: string, opts: { out: string; packageName?: string; baseUrl?: string }) => {
    const ir = normalize(await loadSpec(spec));
    const outDir = resolve(opts.out);
    const files = await generateMcpServer(ir, { outDir, packageName: opts.packageName, defaultBaseUrl: opts.baseUrl });
    console.log(kleur.green(`✔ wrote ${files.length} files to ${outDir}`));
  });

openapiCmd
  .command('docs')
  .description('Generate a markdown docs site from an OpenAPI spec.')
  .argument('<spec>', 'path or URL to an OpenAPI 3.x spec (json or yaml)')
  .option('--out <dir>', 'output directory', './generated/docs')
  .action(async (spec: string, opts: { out: string }) => {
    const ir = normalize(await loadSpec(spec));
    const outDir = resolve(opts.out);
    const files = await generateDocsSite(ir, { outDir });
    console.log(kleur.green(`✔ wrote ${files.length} files to ${outDir}`));
  });

openapiCmd
  .command('all')
  .description('Generate SDK + MCP + docs in one shot.')
  .argument('<spec>', 'path or URL to an OpenAPI 3.x spec (json or yaml)')
  .option('--out <dir>', 'parent output directory', './generated')
  .action(async (spec: string, opts: { out: string }) => {
    const ir = normalize(await loadSpec(spec));
    const out = resolve(opts.out);
    const [sdk, mcp, docs] = await Promise.all([
      generateTsSdk(ir, { outDir: `${out}/sdk` }),
      generateMcpServer(ir, { outDir: `${out}/mcp` }),
      generateDocsSite(ir, { outDir: `${out}/docs` }),
    ]);
    console.log(kleur.green(`✔ sdk: ${sdk.length} files, mcp: ${mcp.length} files, docs: ${docs.length} files → ${out}`));
  });

openapiCmd
  .command('diff')
  .description('Fail CI when an API change would break existing clients (the OpenAPI `buf breaking`).')
  .argument('<base>', 'the published spec: path, URL, or <git-ref>:<path> (e.g. origin/main:openapi.json)')
  .argument('<head>', 'the proposed spec: path, URL, or <git-ref>:<path>')
  .option('--fail-on <level>', 'exit 1 on "breaking", "warning", or "never"', 'breaking')
  .option('--all', 'also list non-breaking additions')
  .option('--json', 'print the diff as JSON')
  .action(async (base: string, head: string, opts: { failOn: string; all?: boolean; json?: boolean }) => {
    if (!['breaking', 'warning', 'never'].includes(opts.failOn)) {
      throw new Error(`--fail-on must be breaking, warning or never (got ${opts.failOn})`);
    }
    const diff = diffApis(normalize(await readSpecArg(base)), normalize(await readSpecArg(head)));
    if (opts.json) console.log(JSON.stringify(diff, null, 2));
    else console.log(formatDiff(diff, { includeInfo: opts.all }));
    const fail = (opts.failOn === 'breaking' && diff.breaking > 0)
      || (opts.failOn === 'warning' && diff.breaking + diff.warnings > 0);
    if (fail) process.exitCode = 1;
  });

// A local file or URL goes through loadSpec. Anything else shaped like
// <ref>:<path> is read from git, so CI can diff against the base branch
// without checking it out.
async function readSpecArg(arg: string): Promise<Record<string, unknown>> {
  if (/^https?:\/\//i.test(arg) || existsSync(arg)) return loadSpec(arg);
  const m = /^([^:]+):(.+)$/.exec(arg);
  if (!m) throw new Error(`openapi: ${arg} is not a file, URL, or <git-ref>:<path>`);
  let text: string;
  try {
    text = execFileSync('git', ['show', `${m[1]}:${m[2]}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(`openapi: git show ${m[1]}:${m[2]} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return parseSpec(text, m[2]);
}
