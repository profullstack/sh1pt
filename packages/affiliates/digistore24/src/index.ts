import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-digistore24",
  label: "Digistore24",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("DIGISTORE24_API_KEY");
    if (!token) throw new Error("DIGISTORE24_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-digistore24" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-digistore24"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://www.digistore24.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-digistore24"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-digistore24"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "DIGISTORE24_API_KEY",
    label: "Digistore24",
    vendorDocUrl: "https://www.digistore24.com",
    steps: [
      "Log into digistore24.com → Settings → API access",
      "Generate an API key",
      "Paste below",
    ],
  }),
});
