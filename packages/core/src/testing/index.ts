// Contract-test runners. Every adapter package imports the runner that
// matches its interface and passes its own instance in — one-line test
// file per adapter, and the whole interface suite runs against it.
//
//   import { contractTestTarget } from '@sh1pt/core/testing';
//   import adapter from './index.js';
//   contractTestTarget(adapter, { sampleConfig: { ... } });
//
// Uses vitest's global describe/it/expect — vitest is a root devDep.

export * from './contract-target.js';
export * from './contract-ad-platform.js';
export * from './contract-cloud.js';
export * from './contract-dns.js';
export * from './contract-merch.js';
export * from './contract-payment.js';
export * from './contract-social.js';
export * from './contract-vcs.js';
export * from './contract-webhook.js';
export * from './contract-agent.js';
export * from './contract-captcha.js';
export * from './contract-recipe.js';
export * from './harness.js';
