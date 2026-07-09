type PaymentProviderSummary = {
  key: string;
  use: string;
  enabled: boolean;
  isDefault: boolean;
};

export type PaymentsSummary = {
  path: string;
  defaultProvider?: string;
  platformFeeBps?: number;
  providers: PaymentProviderSummary[];
};

export function parsePaymentsSummary(source: string, path = 'sh1pt.config.ts'): PaymentsSummary | undefined {
  const payments = readObjectBody(source, 'payments');
  if (!payments) return undefined;
  const providers = readObjectBody(payments, 'providers');
  const defaultProvider = readStringProperty(payments, 'defaultProvider');
  const fee = readNumberProperty(payments, 'platformFeeBps');
  const providerBlocks = providers ? readTopLevelObjectEntries(providers) : [];
  return {
    path,
    defaultProvider,
    platformFeeBps: fee,
    providers: providerBlocks.map(({ key, body }) => {
      const use = readStringProperty(body, 'use') ?? key;
      const enabled = readBooleanProperty(body, 'enabled') ?? true;
      return { key, use, enabled, isDefault: use === defaultProvider || key === defaultProvider };
    }),
  };
}

function readObjectBody(source: string, property: string): string | undefined {
  const match = new RegExp(`(?:^|[,{\\s])${propertyKeyPattern(property)}\\s*:`).exec(source);
  if (!match) return undefined;
  const open = source.indexOf('{', match.index + match[0].length);
  if (open === -1) return undefined;
  const close = findMatchingBrace(source, open);
  return close === -1 ? undefined : source.slice(open + 1, close);
}

function readTopLevelObjectEntries(source: string): Array<{ key: string; body: string }> {
  const entries: Array<{ key: string; body: string }> = [];
  const keyRe = /(?:^|,)\s*(['"]?[A-Za-z0-9_-]+['"]?)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = keyRe.exec(source))) {
    const rawKey = match[1];
    if (!rawKey) continue;
    const open = source.indexOf('{', keyRe.lastIndex);
    if (open === -1) continue;
    const between = source.slice(keyRe.lastIndex, open).trim();
    if (between.length > 0) continue;
    const close = findMatchingBrace(source, open);
    if (close === -1) continue;
    entries.push({ key: rawKey.replace(/^['"]|['"]$/g, ''), body: source.slice(open + 1, close) });
    keyRe.lastIndex = close + 1;
  }
  return entries;
}

function findMatchingBrace(source: string, open: number): number {
  let depth = 0;
  let quote: '"' | "'" | '`' | undefined;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function readStringProperty(source: string, key: string): string | undefined {
  const match = new RegExp(`${propertyKeyPattern(key)}\\s*:\\s*['"]([^'"]+)['"]`).exec(source);
  return match?.[1];
}

function readNumberProperty(source: string, key: string): number | undefined {
  const match = new RegExp(`${propertyKeyPattern(key)}\\s*:\\s*(\\d+)`).exec(source);
  return match?.[1] ? Number(match[1]) : undefined;
}

function readBooleanProperty(source: string, key: string): boolean | undefined {
  const match = new RegExp(`${propertyKeyPattern(key)}\\s*:\\s*(true|false)`).exec(source);
  return match?.[1] === undefined ? undefined : match[1] === 'true';
}

function propertyKeyPattern(key: string): string {
  return `['"]?${escapeRegExp(key)}['"]?`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
