import { contractTestDocs } from '@sh1pt/core/testing';
import docs from './index.js';

contractTestDocs(docs, {
  sampleConfig: { theme: 'default' },
  sampleSpec: {
    kind: 'pitch-deck',
    title: 'test deck',
    format: 'pptx',
    markdown: '# slide 1\n\n---\n\n# slide 2',
  },
});
