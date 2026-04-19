import { smokeTest } from '@sh1pt/core/testing';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'docs', requireSupports: true });
