import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-jvzoo",
  label: "JVZoo",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("JVZOO_API_KEY");
    if (!token) throw new Error("JVZOO_API_KEY not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-jvzoo" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-jvzoo"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://www.jvzoo.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-jvzoo"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-jvzoo"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "JVZOO_API_KEY",
    label: "JVZoo",
    vendorDocUrl: "https://www.jvzoo.com",
    steps: [
      "Log into jvzoo.com → Settings → API",
      "Generate an API key",
      "Paste below",
    ],
  }),
});
