import { createHash, createHmac } from 'node:crypto';
import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accessKey?: string;
  accountId?: string;
  apiHost?: string;
  marketplace?: string;
  marketplaceHost?: string;
  partnerTag?: string;
  region?: string;
  subtag?: string;
}

const DEFAULT_API_HOST = 'webservices.amazon.com';
const DEFAULT_MARKETPLACE_HOST = 'www.amazon.com';
const DEFAULT_REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';

export default defineAffiliate<Config>({
  id: 'affiliate-amazon-associates',
  label: 'Amazon Associates / PA-API',
  side: 'publisher',

  async connect(ctx, config) {
    const partnerTag = requirePartnerTag(config);
    await paapiRequest(ctx, config, 'SearchItems', {
      Keywords: 'sh1pt',
      SearchIndex: 'All',
      ItemCount: 1,
      PartnerTag: partnerTag,
      PartnerType: 'Associates',
      Marketplace: marketplace(config),
      Resources: ['ItemInfo.Title'],
    });
    return { accountId: config.accountId ?? partnerTag };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    const partnerTag = requirePartnerTag(config);
    ctx.log(`amazon associates link · asin=${programId}`);
    const url = new URL(destinationUrl || `https://${marketplaceHost(config)}/dp/${encodeURIComponent(programId)}`);
    if (!url.searchParams.has('tag')) url.searchParams.set('tag', partnerTag);
    const subtag = cleanSubtag(config.subtag);
    if (subtag && !url.searchParams.has('ascsubtag')) url.searchParams.set('ascsubtag', subtag);
    return { url: url.toString() };
  },

  setup: tokenSetup<Config>({
    secretKey: 'AMAZON_PAAPI_SECRET',
    label: 'Amazon Associates / PA-API',
    vendorDocUrl: 'https://webservices.amazon.com/paapi5/documentation/',
    steps: [
      'Join Amazon Associates for the target marketplace',
      'Apply for Product Advertising API access and create access credentials',
      'Paste the PA-API secret key below; enter the access key and partner tag as fields',
    ],
    fields: [
      {
        key: 'accessKey',
        message: 'Amazon PA-API access key:',
      },
      {
        key: 'partnerTag',
        message: 'Amazon Associates partner tag, for example example-20:',
      },
      {
        key: 'marketplaceHost',
        message: 'Marketplace host for tagged links (default: www.amazon.com):',
      },
    ],
  }),
});

async function paapiRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  operation: 'SearchItems' | 'GetItems',
  payload: Record<string, unknown>,
): Promise<unknown> {
  const accessKey = requireValue(config.accessKey, 'Amazon PA-API accessKey is required');
  const secretKey = requireValue(ctx.secret('AMAZON_PAAPI_SECRET'), 'AMAZON_PAAPI_SECRET not in vault');
  const apiHost = config.apiHost ?? DEFAULT_API_HOST;
  const region = config.region ?? DEFAULT_REGION;
  const path = `/paapi5/${operation.toLowerCase()}`;
  const body = JSON.stringify(payload);
  const now = new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const target = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`;
  const headers = signedHeaders({
    accessKey,
    apiHost,
    amzDate,
    body,
    dateStamp,
    path,
    region,
    secretKey,
    target,
  });
  const res = await fetch(`https://${apiHost}${path}`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon PA-API ${res.status}: ${redact(text, [accessKey, secretKey]).slice(0, 200)}`);
  }
  return res.json();
}

function signedHeaders(input: {
  accessKey: string;
  apiHost: string;
  amzDate: string;
  body: string;
  dateStamp: string;
  path: string;
  region: string;
  secretKey: string;
  target: string;
}): Record<string, string> {
  const canonicalHeaders = [
    'content-encoding:amz-1.0',
    'content-type:application/json; charset=utf-8',
    `host:${input.apiHost}`,
    `x-amz-date:${input.amzDate}`,
    `x-amz-target:${input.target}`,
    '',
  ].join('\n');
  const signedHeaderNames = 'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = [
    'POST',
    input.path,
    '',
    canonicalHeaders,
    signedHeaderNames,
    sha256(input.body),
  ].join('\n');
  const credentialScope = `${input.dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    input.amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(signingKey(input.secretKey, input.dateStamp, input.region), stringToSign);
  return {
    accept: 'application/json',
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: input.apiHost,
    'x-amz-date': input.amzDate,
    'x-amz-target': input.target,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${credentialScope}`,
      `SignedHeaders=${signedHeaderNames}`,
      `Signature=${signature}`,
    ].join(', '),
  };
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secretKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer | string, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function amzTimestamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function marketplace(config: Config): string {
  return `www.${marketplaceHost(config).replace(/^www\./, '')}`;
}

function marketplaceHost(config: Config): string {
  return config.marketplaceHost ?? config.marketplace ?? DEFAULT_MARKETPLACE_HOST;
}

function requirePartnerTag(config: Config): string {
  return requireValue(config.partnerTag ?? config.accountId, 'Amazon Associates partnerTag is required');
}

function requireValue(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

function cleanSubtag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function redact(value: string, secrets: string[]): string {
  return secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), value);
}
