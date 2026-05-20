import { createHash, createHmac } from 'node:crypto';
import { defineAi, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  baseUrl?: string;
  region?: string;
}

const ACCESS_KEY_SECRET = 'AWS_BEDROCK_ACCESS_KEY_ID';
const SECRET_KEY_SECRET = 'AWS_BEDROCK_SECRET_ACCESS_KEY';
const SESSION_TOKEN_SECRET = 'AWS_BEDROCK_SESSION_TOKEN';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
const SERVICE = 'bedrock';

export default defineAi<Config>({
  id: 'ai-amazon-bedrock',
  label: 'Amazon Bedrock',
  defaultModel: DEFAULT_MODEL,
  models: [
    DEFAULT_MODEL,
    'anthropic.claude-3-haiku-20240307-v1:0',
    'amazon.nova-pro-v1:0',
    'amazon.nova-lite-v1:0',
    'meta.llama3-1-70b-instruct-v1:0',
  ],

  async generate(ctx, prompt, opts, config) {
    const accessKeyId = ctx.secret(ACCESS_KEY_SECRET);
    const secretAccessKey = ctx.secret(SECRET_KEY_SECRET);
    if (!accessKeyId) throw new Error(`${ACCESS_KEY_SECRET} not in vault`);
    if (!secretAccessKey) throw new Error(`${SECRET_KEY_SECRET} not in vault`);

    const region = config.region ?? ctx.secret('AWS_REGION') ?? ctx.secret('AWS_DEFAULT_REGION') ?? DEFAULT_REGION;
    const model = opts.model ?? DEFAULT_MODEL;
    ctx.log(`amazon-bedrock · region=${region} · model=${model} · ${prompt.length} chars in`);
    if (ctx.dryRun) return { text: '[dry-run]', model };

    const body = buildConverseBody(prompt, opts);
    const bodyText = JSON.stringify(body);
    const baseUrl = config.baseUrl ?? `https://bedrock-runtime.${region}.amazonaws.com`;
    const url = new URL(`/model/${encodeURIComponent(model)}/converse`, withTrailingSlash(baseUrl));
    const headers = signAwsRequest({
      accessKeyId,
      secretAccessKey,
      sessionToken: ctx.secret(SESSION_TOKEN_SECRET),
      region,
      url,
      body: bodyText,
      now: new Date(),
    });

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyText,
    });
    if (!res.ok) throw new Error(`Amazon Bedrock ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data = await res.json() as BedrockConverseResponse;
    const text = data.output?.message?.content
      ?.map((part) => part.text ?? '')
      .join('') ?? '';
    return {
      text,
      model: data.trace?.promptRouter?.invokedModelId ?? model,
      inputTokens: data.usage?.inputTokens,
      outputTokens: data.usage?.outputTokens,
    };
  },

  setup: tokenSetup<Config>({
    secretKey: ACCESS_KEY_SECRET,
    label: 'Amazon Bedrock',
    vendorDocUrl: 'https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html',
    steps: [
      'Create an IAM access key with Amazon Bedrock Runtime invoke permissions',
      'Enable access to the Bedrock model you plan to use in the target region',
      'Paste the access key id and secret access key; sh1pt encrypts them in the vault',
    ],
    fields: [
      { key: SECRET_KEY_SECRET, message: 'AWS secret access key:', secret: true, required: true },
      { key: SESSION_TOKEN_SECRET, message: 'AWS session token (optional):', secret: true },
      { key: 'region', message: 'AWS region (default: us-east-1):' },
      { key: 'baseUrl', message: 'Bedrock Runtime base URL (optional):' },
    ],
  }),
});

function buildConverseBody(prompt: string, opts: {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  extra?: unknown;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    ...(opts.system ? { system: [{ text: opts.system }] } : {}),
    ...(isRecord(opts.extra) ? opts.extra : {}),
  };

  const inferenceConfig = {
    ...(isRecord(body.inferenceConfig) ? body.inferenceConfig : {}),
    ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  };
  if (Object.keys(inferenceConfig).length > 0) body.inferenceConfig = inferenceConfig;

  return body;
}

function signAwsRequest(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  url: URL;
  body: string;
  now: Date;
}): Record<string, string> {
  const amzDate = toAmzDate(opts.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(opts.body);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: opts.url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(opts.sessionToken ? { 'x-amz-security-token': opts.sessionToken } : {}),
  };

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${normalizeHeaderValue(headers[key] ?? '')}\n`)
    .join('');
  const canonicalRequest = [
    'POST',
    opts.url.pathname,
    opts.url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${opts.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(
    getSigningKey(opts.secretAccessKey, dateStamp, opts.region, SERVICE),
    stringToSign
  );

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  return hmac(serviceKey, 'aws4_request');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function withTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface BedrockConverseResponse {
  output?: {
    message?: {
      content?: Array<{
        text?: string;
      }>;
    };
  };
  trace?: {
    promptRouter?: {
      invokedModelId?: string;
    };
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
