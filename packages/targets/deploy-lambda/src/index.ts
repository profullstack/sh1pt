import { defineTarget, setupGuide, exec } from '@profullstack/sh1pt-core';

interface Config {
  functionName: string;
  handler?: string;
  runtime?: string;
  role?: string;
  zipFile?: string;
  invokePayload?: string;
}

export default defineTarget<Config>({
  id: 'deploy-lambda',
  kind: 'web',
  label: 'AWS Lambda',

  async build(ctx, config) {
    ctx.log('lambda: verifying AWS CLI availability');

    try {
      await exec('aws', ['--version'], { log: ctx.log, throwOnNonZero: false });
    } catch {
      throw new Error(
        'AWS CLI not found. Install it from https://aws.amazon.com/cli/'
      );
    }

    // Check credentials are configured
    try {
      await exec('aws', ['sts', 'get-caller-identity'], {
        log: ctx.log,
        throwOnNonZero: false,
      });
    } catch {
      throw new Error(
        'AWS credentials not configured. Run: aws configure'
      );
    }

    const fn = config.functionName;
    ctx.log(`lambda: preparing deployment for function "${fn}"`);

    return { artifact: config.zipFile ?? `${ctx.outDir}/function.zip` };
  },

  async ship(ctx, config) {
    const fn = config.functionName;
    const region = ctx.secret('AWS_REGION') ?? 'us-east-1';

    if (!fn) throw new Error('functionName is required');

    // Check if function exists
    ctx.log(`lambda: checking if function "${fn}" exists`);
    const { exitCode } = await exec(
      'aws',
      ['lambda', 'get-function', '--function-name', fn, '--region', region],
      { log: ctx.log, throwOnNonZero: false }
    );

    if (ctx.dryRun) {
      const action = exitCode === 0 ? 'update-function-code' : 'create-function';
      ctx.log(`lambda: dry-run — would ${action} "${fn}"`);
      return { id: 'dry-run', meta: { functionName: fn, region, action } };
    }

    if (exitCode === 0) {
      // Update existing function code
      ctx.log(`lambda: updating code for "${fn}"`);
      const { stdout } = await exec(
        'aws',
        [
          'lambda', 'update-function-code',
          '--function-name', fn,
          '--zip-file', `fileb://${ctx.artifact}`,
          '--region', region,
        ],
        { log: ctx.log, throwOnNonZero: true }
      );
      const info = JSON.parse(stdout) as { FunctionArn?: string; Version?: string };
      return {
        id: info.FunctionArn ?? fn,
        meta: { functionName: fn, region, version: info.Version },
      };
    } else {
      // Create new function
      ctx.log(`lambda: creating function "${fn}"`);
      const handler = config.handler ?? 'index.handler';
      const runtime = config.runtime ?? 'nodejs20.x';
      const role = config.role ?? ctx.secret('AWS_LAMBDA_ROLE');
      if (!role) throw new Error('role required. Set AWS_LAMBDA_ROLE secret or pass in config');

      const { stdout } = await exec(
        'aws',
        [
          'lambda', 'create-function',
          '--function-name', fn,
          '--runtime', runtime,
          '--role', role,
          '--handler', handler,
          '--zip-file', `fileb://${ctx.artifact}`,
          '--region', region,
        ],
        { log: ctx.log, throwOnNonZero: true }
      );
      const info = JSON.parse(stdout) as { FunctionArn?: string };
      return {
        id: info.FunctionArn ?? fn,
        meta: { functionName: fn, region },
      };
    }
  },

  async status(id) {
    return { state: 'live', url: `https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/${id}` };
  },

  setup: setupGuide({
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
