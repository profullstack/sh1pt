import { defineAffiliate, parseHttpUrl, tokenSetup, type AffiliateConnectContext } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  afftrack?: string;
  apiBaseUrl?: string;
  bannerId?: string;
  currency?: string;
  linkBaseUrl?: string;
  sortColumn?: string;
  sortDirection?: 'ASC' | 'DESC';
  version?: string;
}

const TOKEN_KEY = 'SHAREASALE_API_TOKEN';
const AFFILIATE_ID_KEY = 'SHAREASALE_AFFILIATE_ID';
const DEFAULT_API_BASE = 'https://shareasale.com/x.cfm';
const DEFAULT_LINK_BASE = 'https://www.shareasale.com/r.cfm';
const DEFAULT_VERSION = '1.7';

export default defineAffiliate<Config>({
  id: 'affiliate-shareasale',
  label: 'ShareASale',
  side: 'publisher',

  async connect(ctx, config) {
    const affiliateId = affiliateIdFor(ctx, config);
    await shareasaleRequest(ctx, config, {
      affiliateId,
      action: 'dailyActivity',
      sortcol: config.sortColumn ?? 'hits',
      sortdir: config.sortDirection ?? 'desc',
      XMLFormat: '0',
    });
    return { accountId: affiliateId };
  },

  async getTrackingLink(ctx, programId, destinationUrl, config) {
    ctx.log(`shareasale tracking link · merchant=${programId}`);
    const affiliateId = affiliateIdFor(ctx, config);
    if (!destinationUrl) throw new Error('ShareASale destinationUrl is required');
    parseHttpUrl(destinationUrl, 'ShareASale destinationUrl');
    const url = new URL(config.linkBaseUrl ?? DEFAULT_LINK_BASE);
    if (config.bannerId) url.searchParams.set('b', config.bannerId);
    url.searchParams.set('u', affiliateId);
    url.searchParams.set('m', programId);
    url.searchParams.set('urllink', destinationUrl);
    if (config.afftrack) url.searchParams.set('afftrack', config.afftrack);
    return { url: url.toString() };
  },

  async stats(ctx, programId, config) {
    ctx.log(`shareasale daily activity · merchant=${programId}`);
    const affiliateId = affiliateIdFor(ctx, config);
    const data = await shareasaleRequest(ctx, config, {
      affiliateId,
      action: 'dailyActivity',
      sortcol: config.sortColumn ?? 'hits',
      sortdir: config.sortDirection ?? 'desc',
      XMLFormat: '0',
    });
    const rows = collectRows(data);
    const scopedRows = rows.filter((row) => merchantId(row) === programId);
    const activeRows = scopedRows.length > 0 ? scopedRows : rows;
    const clicks = sumFields(activeRows, ['hits', 'clicks', 'uniqueClicks']);
    const conversions = sumFields(activeRows, ['sales', 'transactions', 'orders']);
    const revenue = sumFields(activeRows, ['grossSales', 'grossSale', 'amount', 'saleAmount']);
    const commissions = sumFields(activeRows, ['commissions', 'commission', 'commissionAmount']);
    return {
      publishers: activeRows.length > 0 ? 1 : 0,
      clicks,
      conversions,
      revenue,
      commissionsPaid: commissions,
      currency: config.currency ?? firstString(activeRows, ['currency']) ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: TOKEN_KEY,
    label: 'ShareASale',
    vendorDocUrl: 'https://help.shareasale.com/hc/en-us/articles/5375832636695-API-Building-Blocks',
    steps: [
      'Open ShareASale → Tools → Affiliate API and enable API access',
      'Paste the API token below',
      `Store ${AFFILIATE_ID_KEY} or set accountId so reports and links include the Affiliate ID`,
    ],
    fields: [
      {
        key: 'accountId',
        message: 'Optional ShareASale Affiliate ID:',
      },
      {
        key: 'afftrack',
        message: 'Optional afftrack value for generated links:',
      },
      {
        key: 'bannerId',
        message: 'Optional ShareASale banner id to include in generated links:',
      },
    ],
  }),
});

type ShareASaleRecord = Record<string, unknown>;

async function shareasaleRequest(
  ctx: AffiliateConnectContext,
  config: Config,
  params: Record<string, string>,
): Promise<unknown> {
  const token = ctx.secret(TOKEN_KEY);
  if (!token) throw new Error(`${TOKEN_KEY} not in vault`);
  const url = new URL(config.apiBaseUrl ?? DEFAULT_API_BASE);
  for (const [key, value] of Object.entries({
    ...params,
    token,
    version: config.version ?? DEFAULT_VERSION,
  })) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { accept: 'application/json, text/plain, */*' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`ShareASale ${res.status}: ${redact(text, token).slice(0, 200)}`);
  return parseResponse(text, res.headers.get('content-type') ?? '');
}

function affiliateIdFor(ctx: AffiliateConnectContext, config: Config): string {
  const affiliateId = config.accountId ?? ctx.secret(AFFILIATE_ID_KEY);
  if (!affiliateId) throw new Error('ShareASale accountId / Affiliate ID is required');
  return affiliateId;
}

function parseResponse(text: string, contentType: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  return parseDelimited(trimmed);
}

function parseDelimited(text: string): ShareASaleRecord[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const firstLine = lines[0];
  if (!firstLine) return [];
  const delimiter = chooseDelimiter(firstLine);
  const header = splitLine(firstLine, delimiter).map(normalizeKey);
  if (header.length < 2 || header.every((key) => /^-?\d+(\.\d+)?$/.test(key))) return [];
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    return header.reduce<ShareASaleRecord>((record, key, index) => {
      record[key] = cells[index] ?? '';
      return record;
    }, {});
  });
}

function chooseDelimiter(line: string): string {
  if (line.includes('|')) return '|';
  if (line.includes('\t')) return '\t';
  return ',';
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
}

function collectRows(data: unknown): ShareASaleRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of ['data', 'rows', 'activity', 'dailyActivity', 'merchants']) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [data];
}

function isRecord(value: unknown): value is ShareASaleRecord {
  return typeof value === 'object' && value !== null;
}

function merchantId(row: ShareASaleRecord): string | undefined {
  return stringField(row, ['merchantId', 'merchantid', 'merchantID', 'mid', 'merchant']);
}

function stringField(row: ShareASaleRecord | undefined, keys: string[]): string | undefined {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key] ?? row[normalizeKey(key)];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstString(rows: ShareASaleRecord[], keys: string[]): string | undefined {
  for (const row of rows) {
    const value = stringField(row, keys);
    if (value) return value;
  }
  return undefined;
}

function sumFields(rows: ShareASaleRecord[], keys: string[]): number {
  return rows.reduce((total, row) => total + numericField(row, keys), 0);
}

function numericField(row: ShareASaleRecord, keys: string[]): number {
  for (const key of keys) {
    const value = row[key] ?? row[normalizeKey(key)];
    const parsed = numericValue(value);
    if (parsed) return parsed;
  }
  return 0;
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

function redact(text: string, ...values: Array<string | undefined>): string {
  let redacted = text;
  for (const value of values) {
    if (value) redacted = redacted.split(value).join('[redacted]');
  }
  return redacted;
}
