import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

contractTestDocs(adapter, {
  sampleConfig: { outputDir: './.sh1pt/test-docs' },
  sampleSpec: {
    kind: 'whitepaper',
    title: 'test paper',
    format: 'pdf',
    markdown: '# Executive summary',
  },
});

afterEach(() => {
  spawnMock.mockReset();
});

describe('docs-pandoc generation', () => {
  it('invokes pandoc with markdown metadata, reference docs, and PDF engine flags', async () => {
    spawnMock.mockImplementation(fakeSuccessfulProcess);
    const result = await adapter.generate({
      secret: () => undefined,
      log: () => {},
      dryRun: false,
    }, {
      kind: 'proposal',
      title: 'Launch Plan',
      subtitle: 'Q2',
      author: 'sh1pt',
      format: 'pdf',
      markdown: '# Plan',
    }, {
      outputDir: './.tmp/docs',
      pdfEngine: 'xelatex',
      metadata: { lang: 'en-US' },
    });

    expect(result.localPath).toBe('.tmp/docs/proposal.pdf');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe('pandoc');
    expect(args).toEqual(expect.arrayContaining([
      '--from', 'markdown',
      '--to', 'pdf',
      '--output', '.tmp/docs/proposal.pdf',
      '--pdf-engine=xelatex',
      '--metadata', 'lang=en-US',
    ]));
    expect(args.at(-1)).toMatch(/input\.md$/);
  });

  it('maps sh1pt md output format to pandoc markdown', async () => {
    spawnMock.mockImplementation(fakeSuccessfulProcess);
    await adapter.generate({
      secret: () => undefined,
      log: () => {},
      dryRun: false,
    }, {
      kind: 'one-pager',
      title: 'One pager',
      format: 'md',
      markdown: '# One pager',
    }, {});

    const args = spawnMock.mock.calls[0]![1] as string[];
    expect(args).toContain('markdown');
  });
});

function fakeSuccessfulProcess(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => child.emit('close', 0));
  return child;
}
