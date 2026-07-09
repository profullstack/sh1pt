import {
  defineAffiliate,
  tokenSetup,
  type AffiliateConnectContext,
  type AffiliateProgram,
} from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
  baseUrl?: string;
  programId?: string;
  assetId?: string;
  affiliateId?: string;
  affiliateEmail?: string;
  sourceId?: string;
}

const DEFAULT_BASE_URL = 'https://api.tapfiliate.com/1.6';

interface TapfiliateProgram {
  id: string;
  title?: string;
  currency?: string;
  default_landing_page_url?: string;
}

interface TapfiliateAffiliate {
  id: string;
  email?: string;
  approved?: boolean | null;
  referral_link?: {
    link?: string;
    asset_id?: string;
    source_id?: string | null;
  };
}

interface TapfiliateCommission {
  amount?: number;
  currency?: string;
  payout?: unknown;
}

interface TapfiliateConversion {
  amount?: number;
  program?: {
    id?: string;
    currency?: string;
  };
  commissions?: TapfiliateCommission[];
}

export default defineAffiliate<Config>({
  id: 'affiliate-tapfiliate',
  label: 'Tapfiliate',
  side: 'merchant',

  async connect(ctx, config) {
    const token = ctx.secret('TAPFILIATE_API_KEY');
    if (!token) throw new Error('TAPFILIATE_API_KEY not in vault - run `sh1pt promote affiliates setup`');
    return { accountId: config.accountId ?? 'affiliate-tapfiliate' };
  },

  async createProgram(ctx, program, config) {
    ctx.log(`tapfiliate - resolve program ${program.name}`);
    const tapProgram = await resolveProgram(ctx, program, config);
    return {
      programId: tapProgram.id,
      marketplaceUrl: tapProgram.default_landing_page_url ?? 'https://tapfiliate.com',
    };
  },

  async getTrackingLink(ctx, programId, _destinationUrl, config) {
    ctx.log(`tapfiliate - tracking link program=${programId}`);
    const affiliate = await resolveAffiliate(ctx, programId, config);
    const link = affiliate.referral_link?.link;
    if (!link) {
      throw new Error(`Tapfiliate affiliate ${affiliate.id} has no referral_link for program ${programId}`);
    }
    return { url: link };
  },

  async stats(ctx, programId, config) {
    ctx.log(`tapfiliate - stats program=${programId}`);
    const [program, affiliates, conversions, clicks] = await Promise.all([
      tapfiliateRequest<TapfiliateProgram>(ctx, config, `/programs/${encodeURIComponent(programId)}/`),
      tapfiliateRequest<TapfiliateAffiliate[]>(ctx, config, `/programs/${encodeURIComponent(programId)}/affiliates/`),
      tapfiliateRequest<TapfiliateConversion[]>(ctx, config, `/conversions/?${query({ program_id: programId })}`),
      optionalTapfiliateRequest<unknown[]>(ctx, config, `/clicks/?${query({ program_id: programId })}`),
    ]);

    const revenue = conversions.reduce((sum, conversion) => sum + numberValue(conversion.amount), 0);
    const commissionsPaid = conversions.reduce((sum, conversion) => {
      return sum + (conversion.commissions ?? []).reduce((inner, commission) => {
        return inner + (commission.payout ? numberValue(commission.amount) : 0);
      }, 0);
    }, 0);

    return {
      publishers: affiliates.filter((affiliate) => affiliate.approved !== false).length,
      clicks: clicks.length,
      conversions: conversions.length,
      revenue,
      commissionsPaid,
      currency: program.currency ?? conversions[0]?.program?.currency ?? 'USD',
    };
  },

  setup: tokenSetup<Config>({
    secretKey: 'TAPFILIATE_API_KEY',
    label: 'Tapfiliate',
    vendorDocUrl: 'https://tapfiliate.com/docs/rest/',
    steps: [
      'Log into tapfiliate.com -> API tab',
      'Generate a new API key',
      'Paste below',
      'Set programId or assetId in config for accounts with multiple programs',
    ],
  }),
});

async function resolveProgram(
  ctx: AffiliateConnectContext,
  program: Pick<AffiliateProgram, 'name' | 'destinationUrl'>,
  config: Config,
): Promise<TapfiliateProgram> {
  if (config.programId) {
    return tapfiliateRequest<TapfiliateProgram>(ctx, config, `/programs/${encodeURIComponent(config.programId)}/`);
  }

  const programs = await tapfiliateRequest<TapfiliateProgram[]>(
    ctx,
    config,
    `/programs/${config.assetId ? `?${query({ asset_id: config.assetId })}` : ''}`,
  );
  const match = programs.find((tapProgram) => {
    return tapProgram.title?.toLowerCase() === program.name.toLowerCase()
      || tapProgram.default_landing_page_url === program.destinationUrl;
  });
  if (match) return match;

  if (programs.length === 1 && !config.assetId) return programs[0]!;

  throw new Error(
    'Tapfiliate REST API does not expose program creation. Set config.programId or config.assetId for an existing Tapfiliate program.',
  );
}

async function resolveAffiliate(
  ctx: AffiliateConnectContext,
  programId: string,
  config: Config,
): Promise<TapfiliateAffiliate> {
  if (config.affiliateId) {
    return tapfiliateRequest<TapfiliateAffiliate>(
      ctx,
      config,
      `/programs/${encodeURIComponent(programId)}/affiliates/${encodeURIComponent(config.affiliateId)}/`,
    );
  }

  const filters = {
    email: config.affiliateEmail,
    source_id: config.sourceId,
  };
  if (!filters.email && !filters.source_id) {
    throw new Error('Tapfiliate tracking links require config.affiliateId, config.affiliateEmail, or config.sourceId');
  }

  const affiliates = await tapfiliateRequest<TapfiliateAffiliate[]>(
    ctx,
    config,
    `/programs/${encodeURIComponent(programId)}/affiliates/?${query(filters)}`,
  );
  const affiliate = affiliates.find((candidate) => candidate.referral_link?.link);
  if (!affiliate) throw new Error(`No Tapfiliate affiliate with a referral link found for program ${programId}`);
  return affiliate;
}

async function optionalTapfiliateRequest<T>(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
): Promise<T> {
  try {
    return await tapfiliateRequest<T>(ctx, config, path);
  } catch (error) {
    if (error instanceof Error && /Tapfiliate 403/.test(error.message)) {
      ctx.log('tapfiliate - clicks endpoint unavailable for this account plan', 'warn');
      return [] as T;
    }
    throw error;
  }
}

async function tapfiliateRequest<T>(
  ctx: AffiliateConnectContext,
  config: Config,
  path: string,
): Promise<T> {
  const apiKey = ctx.secret('TAPFILIATE_API_KEY');
  if (!apiKey) throw new Error('TAPFILIATE_API_KEY not in vault');
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      'content-type': 'application/json',
      'X-Api-Key': apiKey,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tapfiliate ${res.status}: ${text.slice(0, 200)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  return search.toString();
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
