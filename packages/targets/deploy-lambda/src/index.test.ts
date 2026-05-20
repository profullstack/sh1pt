import { fakeBuildContext, fakeShipContext, smokeTest } from '@profullstack/sh1pt-core/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

vi.mock('@profullstack/sh1pt-core', async () => ({
  ...await vi.importActual<typeof import('@profullstack/sh1pt-core')>('@profullstack/sh1pt-core'),
  exec: execMock,
}));

import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'deploy', requireKind: true });

const tempDirs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('AWS Lambda deployment target', () => {
  it('writes a deploy plan with resolved AWS CLI commands', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'sh1pt-lambda-'));
    tempDirs.push(outDir);

    const result = await adapter.build(fakeBuildContext({
      outDir,
      version: '1.2.3',
      secret: (key: string) => key === 'AWS_REGION' ? 'eu-west-1' : undefined,
    }) as any, {
      functionName: 'my-function',
      handler: 'dist/index.handler',
      runtime: 'nodejs22.x',
      zipFile: '/repo/dist/function.zip',
      environment: { NODE_ENV: 'production' },
      layers: ['arn:aws:lambda:eu-west-1:123456789012:layer:deps:1'],
      memorySize: 512,
      timeout: 30,
      publish: true,
    });

    expect(result.artifact).toBe(join(outDir, 'lambda-deploy.json'));
    expect(execMock).not.toHaveBeenCalled();

    const plan = JSON.parse(await readFile(result.artifact, 'utf-8'));
    expect(plan).toMatchObject({
      provider: 'aws-lambda',
      functionName: 'my-function',
      region: 'eu-west-1',
      handler: 'dist/index.handler',
      runtime: 'nodejs22.x',
      roleSecret: 'AWS_LAMBDA_ROLE',
      artifact: '/repo/dist/function.zip',
      environment: { NODE_ENV: 'production' },
      layers: ['arn:aws:lambda:eu-west-1:123456789012:layer:deps:1'],
      memorySize: 512,
      timeout: 30,
      publish: true,
      version: '1.2.3',
    });
    expect(plan.commands.update).toEqual([
      'aws',
      'lambda',
      'update-function-code',
      '--function-name',
      'my-function',
      '--zip-file',
      'fileb:///repo/dist/function.zip',
      '--region',
      'eu-west-1',
      '--publish',
    ]);
    expect(plan.commands.create).toEqual(expect.arrayContaining([
      '--role',
      '<AWS_LAMBDA_ROLE>',
      '--handler',
      'dist/index.handler',
      '--environment',
      JSON.stringify({ Variables: { NODE_ENV: 'production' } }),
    ]));
  });

  it('keeps dry-run shipping side-effect free', async () => {
    await expect(adapter.ship(fakeShipContext({
      dryRun: true,
      secret: (key: string) => key === 'AWS_REGION' ? 'ap-southeast-1' : undefined,
    }) as any, {
      functionName: 'my-function',
      zipFile: '/repo/dist/function.zip',
      publish: true,
    })).resolves.toMatchObject({
      id: 'dry-run',
      meta: {
        functionName: 'my-function',
        region: 'ap-southeast-1',
        commands: {
          update: expect.arrayContaining(['update-function-code', '--publish']),
          create: expect.arrayContaining(['create-function', '<AWS_LAMBDA_ROLE>']),
        },
      },
    });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('updates an existing function in real ship mode', async () => {
    execMock
      .mockResolvedValueOnce({ exitCode: 0, stdout: '{}', stderr: '' })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          FunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:my-function',
          Version: '7',
        }),
        stderr: '',
      });

    const ctx = fakeShipContext({
      dryRun: false,
      env: { CI: 'true' },
    });
    const result = await adapter.ship(ctx as any, {
      functionName: 'my-function',
      zipFile: '/repo/dist/function.zip',
      region: 'us-east-2',
    });

    expect(execMock).toHaveBeenNthCalledWith(1, 'aws', [
      'lambda',
      'get-function',
      '--function-name',
      'my-function',
      '--region',
      'us-east-2',
    ], {
      env: { CI: 'true' },
      log: ctx.log,
      throwOnNonZero: false,
    });
    expect(execMock).toHaveBeenNthCalledWith(2, 'aws', [
      'lambda',
      'update-function-code',
      '--function-name',
      'my-function',
      '--zip-file',
      'fileb:///repo/dist/function.zip',
      '--region',
      'us-east-2',
    ], {
      env: { CI: 'true' },
      log: ctx.log,
      throwOnNonZero: true,
    });
    expect(result).toEqual({
      id: 'arn:aws:lambda:us-east-2:123456789012:function:my-function',
      meta: {
        functionName: 'my-function',
        region: 'us-east-2',
        version: '7',
      },
    });
  });

  it('requires a Lambda role before creating a new function', async () => {
    execMock.mockResolvedValueOnce({ exitCode: 254, stdout: '', stderr: 'not found' });

    await expect(adapter.ship(fakeShipContext({
      dryRun: false,
    }) as any, {
      functionName: 'my-function',
      zipFile: '/repo/dist/function.zip',
    })).rejects.toThrow('AWS_LAMBDA_ROLE not in vault');
  });

  it('build validates functionName before writing a plan', async () => {
    await expect(adapter.build(fakeBuildContext() as any, {
      functionName: '',
    })).rejects.toThrow('functionName is required');
  });
});
