import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'security' });

const tempDirs: string[] = [];
const oldPath = process.env.PATH;

afterEach(async () => {
  process.env.PATH = oldPath;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('security-snyk CLI integration', () => {
  const ctx = {
    secret: (key: string) => key === 'SNYK_TOKEN' ? 'snyk-token' : undefined,
    log: () => {},
  };

  it('runs dependency scans and maps vulnerabilities to findings', async () => {
    const { binDir, logPath } = await installFakeSnyk({
      stdout: JSON.stringify({
        vulnerabilities: [{
          id: 'SNYK-JS-LODASH-567746',
          severity: 'high',
          title: 'Prototype Pollution',
          packageName: 'lodash',
          from: ['demo@1.0.0', 'lodash@4.17.15'],
        }],
      }),
    });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    const result = await adapter.scan(ctx, { path: '.', kind: 'dependencies' }, { org: 'demo-org' });

    expect(result.findings).toEqual([{
      id: 'SNYK-JS-LODASH-567746',
      severity: 'high',
      title: 'Prototype Pollution',
      packageName: 'lodash',
      path: 'demo@1.0.0 > lodash@4.17.15',
    }]);
    expect(await readJsonLines(logPath)).toEqual([{
      args: ['test', '.', '--org=demo-org', '--json'],
      org: 'demo-org',
      token: 'snyk-token',
    }]);
  });

  it('uses container and iac command families for those scan kinds', async () => {
    const { binDir, logPath } = await installFakeSnyk({ stdout: '[]' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    await adapter.scan(ctx, { path: 'web:latest', kind: 'container' }, {});
    await adapter.scan(ctx, { path: './infra', kind: 'iac' }, {});

    expect(await readJsonLines(logPath)).toEqual([
      { args: ['container', 'test', 'web:latest', '--json'], token: 'snyk-token' },
      { args: ['iac', 'test', './infra', '--json'], token: 'snyk-token' },
    ]);
  });

  it('checks auth and account state during connect', async () => {
    const { binDir, logPath } = await installFakeSnyk({ stdout: '{}' });
    process.env.PATH = `${binDir}:${oldPath ?? ''}`;

    await expect(adapter.connect(ctx, { org: 'demo-org' })).resolves.toEqual({ accountId: 'demo-org' });
    expect(await readJsonLines(logPath)).toEqual([
      { args: ['auth', 'snyk-token'], org: 'demo-org' },
      { args: ['whoami', '--org=demo-org'], org: 'demo-org' },
    ]);
  });

  it('fails with a vault hint when the token is missing', async () => {
    await expect(adapter.scan({ secret: () => undefined, log: () => {} }, { path: '.' }, {})).rejects.toThrow('SNYK_TOKEN not in vault');
  });
});

async function installFakeSnyk(opts: { stdout: string }): Promise<{ binDir: string; logPath: string }> {
  const binDir = await mkdtemp(join(tmpdir(), 'sh1pt-snyk-bin-'));
  const logPath = join(binDir, 'snyk-log.jsonl');
  tempDirs.push(binDir);
  const script = join(binDir, 'snyk');
  await writeFile(script, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs');",
    `const logPath = ${JSON.stringify(logPath)};`,
    "const org = process.env.SNYK_CFG_ORG;",
    "const body = { args: process.argv.slice(2), ...(org ? { org } : {}), token: process.env.SNYK_TOKEN };",
    "fs.appendFileSync(logPath, JSON.stringify(body) + '\\n');",
    `process.stdout.write(${JSON.stringify(opts.stdout)});`,
  ].join('\n'), 'utf-8');
  await chmod(script, 0o755);
  return { binDir, logPath };
}

async function readJsonLines(path: string): Promise<unknown[]> {
  return (await readFile(path, 'utf-8')).trim().split('\n').map((line) => JSON.parse(line));
}
