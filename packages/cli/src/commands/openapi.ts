import { Command } from 'commander';
import kleur from 'kleur';
import { resolve } from 'node:path';
import { loadSpec, normalize } from '@profullstack/sh1pt-openapi/core';
import { generateTsSdk } from '@profullstack/sh1pt-openapi/gen-sdk-ts';
import { generateMcpServer } from '@profullstack/sh1pt-openapi/gen-mcp';
import { generateDocsSite } from '@profullstack/sh1pt-openapi/gen-docs';

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
