import { defineAffiliate, tokenSetup } from '@profullstack/sh1pt-core';

interface Config {
  accountId?: string;
}

export default defineAffiliate<Config>({
  id: "affiliate-admitad",
  label: "Admitad",
  side: "both",

  async connect(ctx, config) {
    const token = ctx.secret("ADMITAD_ACCESS_TOKEN");
    if (!token) throw new Error("ADMITAD_ACCESS_TOKEN not in vault — run `sh1pt promote affiliates setup`");
    return { accountId: config.accountId ?? "affiliate-admitad" };
  },

  async createProgram(ctx, program) {
    ctx.log(`[stub] ${"affiliate-admitad"} createProgram name=${program.name} commission=${program.commissionRate}${program.commissionType === 'percentage' ? '%' : ''}`);
    return {
      programId: `stub-${Date.now()}`,
      marketplaceUrl: "https://www.admitad.com",
    };
  },

  async getTrackingLink(ctx, programId, destinationUrl) {
    ctx.log(`[stub] ${"affiliate-admitad"} getTrackingLink program=${programId}`);
    return { url: destinationUrl };
  },

  async stats(ctx, programId) {
    ctx.log(`[stub] ${"affiliate-admitad"} stats program=${programId}`);
    return { publishers: 0, clicks: 0, conversions: 0, revenue: 0, commissionsPaid: 0, currency: 'USD' };
  },

  setup: tokenSetup<Config>({
    secretKey: "ADMITAD_ACCESS_TOKEN",
    label: "Admitad",
    vendorDocUrl: "https://www.admitad.com",
    steps: [
      "Register a client at admitad.com → API → Manage clients",
      "Run the OAuth2 client_credentials flow to mint an access token",
      "Paste the access token below",
    ],
  }),
});
