import { describe, expect, it } from 'vitest';
import { smokeTest } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';
import { buildDopplerSetArgs, parseDopplerSecrets } from './index.js';

smokeTest(adapter, { idPrefix: 'secrets' });

describe('secrets-doppler mapping', () => {
  it('maps Doppler JSON output into secret refs', () => {
    const secrets = parseDopplerSecrets(JSON.stringify({
      API_KEY: 'plain-token',
      FEATURE_FLAG: true,
      COMPUTED: { computed: 'resolved-value' },
      RAW: { raw: 'raw-value' },
      SKIP_NULL: null,
    }), { project: 'app', config: 'prd' });

    expect(secrets).toEqual([
      { key: 'API_KEY', value: 'plain-token', environment: 'prd', path: 'doppler://app/prd' },
      { key: 'FEATURE_FLAG', value: 'true', environment: 'prd', path: 'doppler://app/prd' },
      { key: 'COMPUTED', value: 'resolved-value', environment: 'prd', path: 'doppler://app/prd' },
      { key: 'RAW', value: 'raw-value', environment: 'prd', path: 'doppler://app/prd' },
    ]);
  });

  it('builds safe doppler secrets set argv and skips unset refs', () => {
    expect(buildDopplerSetArgs([
      { key: 'API_KEY', value: 'new-token' },
      { key: 'SKIP_ME' },
    ], { project: 'app', config: 'dev' })).toEqual({
      values: ['API_KEY=new-token'],
      argv: ['secrets', 'set', 'API_KEY=new-token', '--project', 'app', '--config', 'dev'],
    });
  });

  it('rejects invalid Doppler key names before invoking the CLI', () => {
    expect(() => buildDopplerSetArgs([
      { key: 'BAD KEY', value: 'x' },
    ], { project: 'app', config: 'dev' })).toThrow('Invalid Doppler secret key');
  });
});
