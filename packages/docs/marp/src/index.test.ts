import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import docs from './index.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

contractTestDocs(docs, {
  sampleConfig: { theme: 'default', outputDir: './.sh1pt/test-docs' },
  sampleSpec: {
    kind: 'pitch-deck',
    title: 'test deck',
    format: 'pptx',
    markdown: '# slide 1\n\n---\n\n# slide 2',
  },
});

afterEach(() => {
  spawnMock.mockReset();
});

describe('docs-marp generation', () => {
  it('runs the Marp CLI for pptx output with local file support', async () => {
    spawnMock.mockImplementation(fakeSuccessfulProcess);
    const result = await docs.generate({
      secret: () => undefined,
      log: () => {},
      dryRun: false,
    }, {
      kind: 'sales-deck',
      title: 'Launch Deck',
      subtitle: 'Investor version',
      author: 'sh1pt',
      format: 'pptx',
      markdown: '# Slide 1\n\n---\n\n# Slide 2',
    }, {
      theme: 'gaia',
      allowLocalFiles: true,
      outputDir: './.tmp/docs',
    });

    expect(result.localPath).toBe('.tmp/docs/sales-deck.pptx');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe('marp');
    expect(args).toEqual(expect.arrayContaining([
      '--theme', 'gaia',
      '--output', '.tmp/docs/sales-deck.pptx',
      '--allow-local-files',
      '--pptx',
    ]));
    expect(args.at(-1)).toMatch(/deck\.md$/);
  });

  it('does not pass a format flag when generating HTML', async () => {
    spawnMock.mockImplementation(fakeSuccessfulProcess);
    await docs.generate({
      secret: () => undefined,
      log: () => {},
      dryRun: false,
    }, {
      kind: 'pitch-deck',
      title: 'HTML deck',
      format: 'html',
      markdown: '# Slide',
    }, {});

    const args = spawnMock.mock.calls[0]![1] as string[];
    expect(args).not.toContain('--html');
  });
});

function fakeSuccessfulProcess(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => child.emit('close', 0));
  return child;
}
