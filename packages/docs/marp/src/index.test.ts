import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import docs from './index.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

contractTestDocs(docs, {
  sampleConfig: { theme: 'default' },
  sampleSpec: {
    kind: 'pitch-deck',
    title: 'test deck',
    format: 'pptx',
    markdown: '# slide 1\n\n---\n\n# slide 2',
  },
});

describe('docs-marp generate', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('runs the Marp CLI with markdown on stdin', async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValueOnce(child);

    const resultPromise = docs.generate({ secret: () => undefined, log: () => {}, dryRun: false }, {
      kind: 'pitch-deck',
      title: 'Investor deck',
      format: 'pdf',
      markdown: '# Title\n\n---\n\n## Traction',
    }, {
      theme: 'gaia',
      allowLocalFiles: true,
      binary: 'marp-test',
      outDir: '/tmp/sh1pt-docs',
    });

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    child.emit('close', 0);
    const result = await resultPromise;

    expect(spawnMock).toHaveBeenCalledWith('marp-test', [
      '--theme',
      'gaia',
      '--pdf',
      '--output',
      '/tmp/sh1pt-docs/pitch-deck.pdf',
      '--allow-local-files',
      '-',
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    expect(child.stdinBody).toBe('# Title\n\n---\n\n## Traction');
    expect(result.localPath).toBe('/tmp/sh1pt-docs/pitch-deck.pdf');
    expect(result.format).toBe('pdf');
  });

  it('surfaces Marp stderr when generation fails', async () => {
    const child = makeChildProcess();
    spawnMock.mockReturnValueOnce(child);

    const resultPromise = docs.generate({ secret: () => undefined, log: () => {}, dryRun: false }, {
      kind: 'sales-deck',
      title: 'Broken deck',
      format: 'html',
      markdown: '# Broken',
    }, {});

    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce());
    child.stderr.emit('data', Buffer.from('invalid theme'));
    child.emit('close', 1);

    await expect(resultPromise).rejects.toThrow('marp exited with code 1: invalid theme');
  });
});

function makeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough & { end(chunk?: unknown): void };
    stderr: PassThrough;
    stdinBody: string;
  };
  child.stdinBody = '';
  child.stderr = new PassThrough();
  child.stdin = new PassThrough() as PassThrough & { end(chunk?: unknown): void };
  const originalEnd = child.stdin.end.bind(child.stdin);
  child.stdin.end = (chunk?: unknown) => {
    if (typeof chunk === 'string') child.stdinBody += chunk;
    return originalEnd(chunk as never);
  };
  return child;
}
