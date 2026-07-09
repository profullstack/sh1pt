import { contractTestDocs } from '@profullstack/sh1pt-core/testing';
import { describe, expect, it } from 'vitest';
import docs from './index.js';
import { marpArgs } from './index.js';

contractTestDocs(docs, {
  sampleConfig: { theme: 'default' },
  sampleSpec: {
    kind: 'pitch-deck',
    title: 'test deck',
    format: 'pptx',
    markdown: '# slide 1\n\n---\n\n# slide 2',
  },
});

describe('docs-marp command mapping', () => {
  it('uses Marp CLI output extension plus explicit PDF flags and metadata', () => {
    expect(marpArgs(
      '.sh1pt/docs/pitch-deck.md',
      '.sh1pt/docs/pitch-deck.pdf',
      'pdf',
      { title: 'Launch Deck', subtitle: 'Investor version', author: 'Codex' },
      { theme: 'gaia', allowLocalFiles: true },
    )).toEqual([
      '.sh1pt/docs/pitch-deck.md',
      '-o',
      '.sh1pt/docs/pitch-deck.pdf',
      '--theme',
      'gaia',
      '--pdf',
      '--allow-local-files',
      '--title',
      'Launch Deck',
      '--description',
      'Investor version',
      '--author',
      'Codex',
    ]);
  });

  it('maps PPTX and HTML formats without enabling local files by default', () => {
    expect(marpArgs('deck.md', 'deck.pptx', 'pptx', {}, {})).toEqual([
      'deck.md',
      '-o',
      'deck.pptx',
      '--theme',
      'default',
      '--pptx',
    ]);
    expect(marpArgs('deck.md', 'deck.html', 'html', {}, { theme: 'uncover' })).toEqual([
      'deck.md',
      '-o',
      'deck.html',
      '--theme',
      'uncover',
      '--html',
    ]);
  });
});
