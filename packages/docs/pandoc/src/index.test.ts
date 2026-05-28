import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import docs from './index.js';

contractTestDocs(docs, {
  sampleConfig: {},
  sampleSpec: {
    kind: 'whitepaper',
    title: 'test paper',
    format: 'docx',
    markdown: '# Hello\n\nBody text',
  },
});

const tempDirs: string[] = [];
const oldPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = oldPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('docs-pandoc generation', () => {
  it('writes markdown directly when md output is requested', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pandoc-'));
    tempDirs.push(outDir);

    const result = await docs.generate({ secret: () => undefined, log: () => {}, dryRun: false }, {
      kind: 'proposal',
      title: 'Proposal',
      format: 'md',
      markdown: '# Proposal\n\nScope',
    }, { outDir });

    expect(result).toEqual({
      id: 'pandoc_proposal_md',
      format: 'md',
      localPath: join(outDir, 'proposal.md'),
    });
    await expect(readFile(join(outDir, 'proposal.md'), 'utf-8')).resolves.toBe('# Proposal\n\nScope');
  });

  it('invokes pandoc with input, output, metadata, reference doc, and pdf engine', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-pandoc-out-'));
    const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-pandoc-bin-'));
    tempDirs.push(outDir, binDir);
    await installFakePandoc(binDir);
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ''}`;

    const result = await docs.generate({ secret: () => undefined, log: () => {}, dryRun: false }, {
      kind: 'whitepaper',
      title: 'Whitepaper',
      format: 'pdf',
      markdown: '# Whitepaper\n\nBody',
    }, {
      outDir,
      referenceDoc: './templates/brand.docx',
      pdfEngine: 'xelatex',
      metadata: { title: 'Whitepaper', author: 'sh1pt' },
    });

    expect(result).toEqual({
      id: 'pandoc_whitepaper_pdf',
      format: 'pdf',
      localPath: join(outDir, 'whitepaper.pdf'),
    });

    const args = JSON.parse(await readFile(join(outDir, 'pandoc-args.json'), 'utf-8')) as string[];
    expect(args).toEqual([
      join(outDir, 'whitepaper.md'),
      '-f',
      'markdown',
      '-t',
      'pdf',
      '-o',
      join(outDir, 'whitepaper.pdf'),
      '--reference-doc=./templates/brand.docx',
      '--pdf-engine=xelatex',
      '--metadata',
      'title=Whitepaper',
      '--metadata',
      'author=sh1pt',
    ]);
    await expect(readFile(join(outDir, 'whitepaper.pdf'), 'utf-8')).resolves.toBe('fake pandoc output\n');
    await expect(readFile(join(outDir, 'whitepaper.md'), 'utf-8')).resolves.toBe('# Whitepaper\n\nBody');
  });
});

async function installFakePandoc(binDir: string): Promise<void> {
  if (process.platform === 'win32') {
    const helper = join(binDir, 'pandoc.js');
    await writeFile(helper, [
      'const { writeFileSync } = require("node:fs");',
      'const { dirname, join } = require("node:path");',
      'const args = process.argv.slice(2);',
      'const outIndex = args.indexOf("-o");',
      'const out = outIndex >= 0 ? args[outIndex + 1] : "";',
      'if (!out) throw new Error("missing -o");',
      'writeFileSync(join(dirname(out), "pandoc-args.json"), JSON.stringify(args));',
      'writeFileSync(out, "fake pandoc output\\n");',
    ].join('\n'), 'utf-8');
    await writeFile(join(binDir, 'pandoc.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0pandoc.js" %*\r\n`, 'utf-8');
    return;
  }

  const script = join(binDir, 'pandoc');
  await writeFile(script, [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'out=""',
    'args=("$@")',
    'for ((i=0; i<${#args[@]}; i++)); do',
    '  if [[ "${args[$i]}" == "-o" ]]; then',
    '    out="${args[$((i+1))]}"',
    '  fi',
    'done',
    'node -e "require(\'fs\').writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))" "$(dirname "$out")/pandoc-args.json" "$@"',
    'printf "fake pandoc output\\n" > "$out"',
  ].join('\n'), 'utf-8');
  await chmod(script, 0o755);
}
