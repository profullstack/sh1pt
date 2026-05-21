import { createHash, createHmac } from 'node:crypto';
import { defineAffiliate, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  accessKey?: string;
  apiBase?: string;
  marketplace?: string;
  region?: string;
  subtag?: string;
  testAsin?: string;
}

type AmazonOperation = 'GetItems';

const SECRET_KEY = 'AMAZON_PAAPI_SECRET';
const DEFAULT_API_BASE = 'https://webservices.amazon.com';
const DEFAULT_MARKETPLACE = 'www.amazon.com';
const DEFAULT_REGION = 'us-east-1';
const SERVICE = 'ProductAdvertisingAPI';
const SIGNED_HEADERS = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

export default defineAffiliate<Config>({
  id: 'affiliate-amazon-associates',
  label: 'Amazon Associates / PAAPI',
  side: 'publisher',

  async connect(ctx, config) {
    const accountId = partnerTag(config);
    credentials(ctx, config);
    if (config.testAsin) {
      await paapiPost(ctx, config, 'GetItems', getItemsPayload([config.testAsin], config));
    }
    return { accountId };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    const accountId = partnerTag(config);
    ctx.log(`amazon associates special link · asin=${programId}`);
    return {
      url: specialLink(programId, destinationUrl, accountId, config).toString(),
    };
  },

  setup: tokenSetup<Config>({
    secretKey: SECRET_KEY,
    label: 'Amazon Associates / PAAPI',
    vendorDocUrl: 'https://webservices.amazon.com/paapi5/documentation/sending-request.html',
    steps: [
      'Join the Amazon Associates program for the target marketplace',
      'Store the Associates tag as accountId and the PA-API access key as accessKey',
      'Paste the PA-API secret key below; Amazon now marks PA-API as deprecated in favor of Creators API',
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Amazon Associates tag / PartnerTag:',
      },
      {
        key: 'accessKey',
        message: 'PA-API access key:',
      },
      {
        key: 'marketplace',
        message: 'Optional marketplace host, defaults to www.amazon.com:',
      },
      {
        key: 'region',
        message: 'Optional PA-API signing region, defaults to us-east-1:',
      },
    ],
  }),
});

async function paapiPost(
  ctx: AffiliateConnectContext,
  config: Config,
  operation: AmazonOperation,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const { accessKey, secret } = credentials(ctx, config);
  const apiBase = trimSlash(config.apiBase ?? DEFAULT_API_BASE);
  const url = new URL(`/paapi5/${operation.toLowerCase()}`, apiBase);
  const body = JSON.stringify(payload);
  const headers = signedHeaders({
    accessKey,
    secret,
    host: url.host,
    operation,
    payload: body,
    region: config.region ?? DEFAULT_REGION,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon PA-API ${res.status}: ${redact(text, accessKey, secret, config.accountId).slice(0, 200)}`);
  }
  return res.json();
}

function signedHeaders(input: {
  accessKey: string;
  secret: string;
  host: string;
  operation: AmazonOperation;
  payload: string;
  region: string;
}): Record<string, string> {
  const amzDate = amzTimestamp();
  const dateStamp = amzDate.slice(0, 8);
  const target = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${input.operation}`;
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = [
    'content-encoding:amz-1.0',
    `content-type:${contentType}`,
    `host:${input.host}`,
    `x-amz-date:${amzDate}`,
    `x-amz-target:${target}`,
    '',
  ].join('\n');
  const canonicalRequest = [
    'POST',
    `/paapi5/${input.operation.toLowerCase()}`,
    '',
    canonicalHeaders,
    SIGNED_HEADERS,
    sha256(input.payload),
  ].join('\n');
  const scope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secret}`, dateStamp), input.region), SERVICE), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    'content-encoding': 'amz-1.0',
    'content-type': contentType,
    host: input.host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${SIGNED_HEADERS}, Signature=${signature}`,
  };
}

function getItemsPayload(itemIds: string[], config: Config): Record<string, unknown> {
  return {
    ItemIds: itemIds,
    ItemIdType: 'ASIN',
    Marketplace: config.marketplace ?? DEFAULT_MARKETPLACE,
    PartnerTag: partnerTag(config),
    PartnerType: 'Associates',
    Resources: [
      'Images.Primary.Small',
      'ItemInfo.Title',
      'OffersV2.Listings.Price',
    ],
  };
}

function specialLink(programId: string, destinationUrl: string, accountId: string, config: Config): URL {
  const url = isAmazonUrl(destinationUrl)
    ? new URL(destinationUrl)
    : new URL(`/dp/${encodeURIComponent(asin(programId))}/`, `https://${config.marketplace ?? DEFAULT_MARKETPLACE}`);
  url.searchParams.set('tag', accountId);
  if (config.subtag && !url.searchParams.has('ascsubtag')) {
    url.searchParams.set('ascsubtag', sanitizeSubtag(config.subtag));
  }
  return url;
}

function isAmazonUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /^(.+\.)?amazon\.[a-z.]+$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function asin(value: string): string {
  const cleaned = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(cleaned)) {
    throw new Error('Amazon Associates programId must be a 10-character ASIN when destinationUrl is not an Amazon URL');
  }
  return cleaned;
}

function partnerTag(config: Config): string {
  if (config.accountId) return config.accountId;
  throw new Error('Amazon Associates accountId / PartnerTag is required');
}

function credentials(ctx: AffiliateConnectContext, config: Config): { accessKey: string; secret: string } {
  const secret = ctx.secret(SECRET_KEY);
  if (!secret) throw new Error(`${SECRET_KEY} not in vault`);
  if (!config.accessKey) throw new Error('Amazon PA-API accessKey is required');
  return { accessKey: config.accessKey, secret };
}

function amzTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function sanitizeSubtag(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
