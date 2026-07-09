import { defineTarget, exec, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface Config {
  functionName: string;
  handler?: string;
  runtime?: string;
  role?: string;
  zipFile?: string;
  invokePayload?: string;
  region?: string;
  description?: string;
  environment?: Record<string, string>;
  layers?: string[];
  memorySize?: number;
  timeout?: number;
  publish?: boolean;
}

function functionName(config: Config): string {
  const fn = config.functionName?.trim();
  if (!fn) throw new Error('functionName is required');
  return fn;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (!text) throw new Error(`deploy-lambda requires ${field}`);
  return text;
}

function optionalInteger(value: number | undefined, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`deploy-lambda ${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function environmentVariables(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const entries = Object.entries(value);
  for (const [key, entryValue] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]+$/.test(key)) {
      throw new Error(`deploy-lambda environment variable "${key}" must start with a letter and contain only letters, numbers, or underscores`);
    }
    if (typeof entryValue !== 'string') {
      throw new Error(`deploy-lambda environment variable "${key}" must be a string`);
    }
  }
  return value;
}

function layerArns(value: string[] | undefined): string[] | undefined {
  return value?.map((layer, index) => optionalText(layer, `layers[${index}]`)!);
}

function normalizedConfig(config: Config): Config {
  return {
    ...config,
    functionName: functionName(config),
    handler: optionalText(config.handler, 'handler'),
    runtime: optionalText(config.runtime, 'runtime'),
    role: optionalText(config.role, 'role'),
    zipFile: optionalText(config.zipFile, 'zipFile'),
    region: optionalText(config.region, 'region'),
    description: optionalText(config.description, 'description'),
    environment: environmentVariables(config.environment),
    layers: layerArns(config.layers),
    memorySize: optionalInteger(config.memorySize, 'memorySize', 128, 10240),
    timeout: optionalInteger(config.timeout, 'timeout', 1, 900),
  };
}

function region(ctx: { secret(key: string): string | undefined }, config: Config): string {
  return optionalText(config.region, 'region') ?? optionalText(ctx.secret('AWS_REGION'), 'AWS_REGION') ?? 'us-east-1';
}

function zipFile(ctx: { outDir: string }, config: Config): string {
  return optionalText(config.zipFile, 'zipFile') ?? join(ctx.outDir, 'function.zip');
}

function applyOptionalCreateArgs(args: string[], config: Config): string[] {
  config = normalizedConfig(config);
  if (config.description) args.push('--description', config.description);
  if (config.timeout !== undefined) args.push('--timeout', String(config.timeout));
  if (config.memorySize !== undefined) args.push('--memory-size', String(config.memorySize));
  if (config.layers?.length) args.push('--layers', ...config.layers);
  if (config.environment) {
    args.push('--environment', JSON.stringify({ Variables: config.environment }));
  }
  if (config.publish) args.push('--publish');
  return args;
}

function updateArgs(config: Config, artifact: string, awsRegion: string): string[] {
  config = normalizedConfig(config);
  const args = [
    'lambda',
    'update-function-code',
    '--function-name',
    functionName(config),
    '--zip-file',
    `fileb://${artifact}`,
    '--region',
    awsRegion,
  ];
  if (config.publish) args.push('--publish');
  return args;
}

function createArgs(config: Config, artifact: string, awsRegion: string, role: string): string[] {
  config = normalizedConfig(config);
  return applyOptionalCreateArgs([
    'lambda',
    'create-function',
    '--function-name',
    functionName(config),
    '--runtime',
    config.runtime ?? 'nodejs20.x',
    '--role',
    role,
    '--handler',
    config.handler ?? 'index.handler',
    '--zip-file',
    `fileb://${artifact}`,
    '--region',
    awsRegion,
  ], config);
}

function renderPlan(
  ctx: { outDir: string; version: string; secret(key: string): string | undefined },
  config: Config
): string {
  config = normalizedConfig(config);
  const artifact = zipFile(ctx, config);
  const awsRegion = region(ctx, config);
  const plannedRole = config.role ?? '<AWS_LAMBDA_ROLE>';
  return `${JSON.stringify({
    provider: 'aws-lambda',
    functionName: functionName(config),
    region: awsRegion,
    handler: config.handler ?? 'index.handler',
    runtime: config.runtime ?? 'nodejs20.x',
    role: config.role ?? null,
    roleSecret: config.role ? null : 'AWS_LAMBDA_ROLE',
    artifact,
    environment: config.environment ?? {},
    layers: config.layers ?? [],
    memorySize: config.memorySize ?? null,
    timeout: config.timeout ?? null,
    publish: config.publish ?? false,
    version: ctx.version,
    commands: {
      update: ['aws', ...updateArgs(config, artifact, awsRegion)],
      create: ['aws', ...createArgs(config, artifact, awsRegion, plannedRole)],
    },
  }, null, 2)}\n`;
}

function parseLambda(stdout: string): Record<string, unknown> {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function regionFromId(id: string, fallback: string): string {
  const parts = id.split(':');
  return id.startsWith('arn:') && parts[3] ? parts[3] : fallback;
}

function functionPathFromId(id: string): string {
  const marker = ':function:';
  const index = id.indexOf(marker);
  return index === -1 ? id : id.slice(index + marker.length);
}

export default defineTarget<Config>({
  id: 'deploy-lambda',
  kind: 'web',
  label: 'AWS Lambda',

  async build(ctx, config) {
    config = normalizedConfig(config);
    const fn = functionName(config);
    const planPath = join(ctx.outDir, 'lambda-deploy.json');
    ctx.log(`lambda plan - function=${fn} region=${region(ctx, config)}`);
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(planPath, renderPlan(ctx, config), 'utf-8');
    return { artifact: planPath };
  },

  async ship(ctx, config) {
    config = normalizedConfig(config);
    const fn = functionName(config);
    const awsRegion = region(ctx, config);
    const artifact = zipFile(ctx, config);
    const updateCommand = ['aws', ...updateArgs(config, artifact, awsRegion)];
    const role = config.role ?? ctx.secret('AWS_LAMBDA_ROLE');
    const createCommand = ['aws', ...createArgs(config, artifact, awsRegion, role ?? '<AWS_LAMBDA_ROLE>')];

    if (ctx.dryRun) {
      ctx.log(`lambda: dry-run would deploy "${fn}"`);
      return {
        id: 'dry-run',
        meta: {
          functionName: fn,
          region: awsRegion,
          commands: {
            update: updateCommand,
            create: createCommand,
          },
        },
      };
    }

    ctx.log(`lambda: checking if function "${fn}" exists`);
    const { exitCode } = await exec(
      'aws',
      ['lambda', 'get-function', '--function-name', fn, '--region', awsRegion],
      { env: ctx.env, log: ctx.log, throwOnNonZero: false }
    );

    if (exitCode === 0) {
      ctx.log(`lambda: updating code for "${fn}"`);
      const { stdout } = await exec(
        'aws',
        updateArgs(config, artifact, awsRegion),
        { env: ctx.env, log: ctx.log, throwOnNonZero: true }
      );
      const info = parseLambda(stdout);
      return {
        id: typeof info.FunctionArn === 'string' ? info.FunctionArn : fn,
        meta: {
          functionName: fn,
          region: awsRegion,
          version: typeof info.Version === 'string' ? info.Version : undefined,
        },
      };
    }

    ctx.log(`lambda: creating function "${fn}"`);
    if (!role) {
      throw new Error('AWS_LAMBDA_ROLE not in vault - run: sh1pt secret set AWS_LAMBDA_ROLE <arn>');
    }

    const { stdout } = await exec(
      'aws',
      createArgs(config, artifact, awsRegion, role),
      { env: ctx.env, log: ctx.log, throwOnNonZero: true }
    );
    const info = parseLambda(stdout);
    return {
      id: typeof info.FunctionArn === 'string' ? info.FunctionArn : fn,
      meta: { functionName: fn, region: awsRegion },
    };
  },

  async status(id, config) {
    const awsRegion = regionFromId(id, config.region ?? 'us-east-1');
    const fn = functionPathFromId(id);
    return {
      state: 'live',
      url: `https://console.aws.amazon.com/lambda/home?region=${encodeURIComponent(awsRegion)}#/functions/${encodeURIComponent(fn)}`,
    };
  },

  setup: manualSetup({
    label: 'AWS Lambda',
    vendorDocUrl: 'https://aws.amazon.com/cli/',
    steps: [
      'Install AWS CLI: brew install awscli',
      'Configure credentials: aws configure',
      'Set region: sh1pt secret set AWS_REGION us-east-1',
      'Create an IAM role for Lambda and set: sh1pt secret set AWS_LAMBDA_ROLE <arn>',
    ],
  }),
});
