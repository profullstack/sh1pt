import { defineSecurityProvider, manualSetup } from '@profullstack/sh1pt-core';

interface Config {
  org?: string;
}

export default defineSecurityProvider<Config>({
  id: 'security-snyk',
  label: 'Snyk',
  cli: 'snyk',
  async connect(ctx, config) {
    if (!ctx.secret('SNYK_TOKEN')) throw new Error('SNYK_TOKEN not in vault');
    ctx.log(`snyk auth <token> · org=${config.org ?? 'default'}`);
    return { accountId: config.org ?? 'snyk' };
  },
  async scan(ctx, req, config) {
    const org = config.org ? ` --org=${config.org}` : '';
    const command = req.kind === 'container' ? 'container test' : req.kind === 'iac' ? 'iac test' : 'test';
    ctx.log(`snyk ${command} ${req.path}${org} --json`);
    return { findings: [] };
  },
  setup: manualSetup({
    label: 'Snyk CLI',
    vendorDocUrl: 'https://docs.snyk.io/developer-tools/snyk-cli',
    steps: [
      'Install with mise: mise use npm:snyk',
      'Authenticate locally: snyk auth',
      'For CI: sh1pt secret set SNYK_TOKEN <token>',
    ],
  }),
});
