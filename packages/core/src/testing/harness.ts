// Shared test harness — fake contexts, no-op loggers, in-memory vault.
// Everything every contract test needs to feel out an adapter without
// touching the network.

export function fakeLog(): (msg: string, level?: 'info' | 'warn' | 'error') => void {
  return () => {};
}

export function makeVault(secrets: Record<string, string> = {}) {
  return (key: string): string | undefined => secrets[key];
}

export function fakeBuildContext(overrides: Record<string, unknown> = {}) {
  return {
    projectDir: '/tmp/fake-project',
    outDir: '/tmp/fake-out',
    version: '0.0.1',
    channel: 'beta',
    env: {},
    secret: makeVault({}),
    log: fakeLog(),
    ...overrides,
  };
}

export function fakeShipContext(overrides: Record<string, unknown> = {}) {
  return {
    ...fakeBuildContext(overrides),
    artifact: '/tmp/fake-out/artifact',
    dryRun: true,
    ...overrides,
  };
}

export function fakeConnectContext(secrets: Record<string, string> = {}) {
  return { secret: makeVault(secrets), log: fakeLog() };
}

export function fakeCampaignContext(overrides: Record<string, unknown> = {}) {
  return {
    projectDir: '/tmp/fake',
    appName: 'fake-app',
    storeUrls: {},
    budget: { amount: 50, currency: 'USD', cadence: 'daily' as const },
    start: new Date(),
    objective: 'install' as const,
    creatives: [],
    secret: makeVault({}),
    log: fakeLog(),
    dryRun: true,
    ...overrides,
  };
}

// Checks whether an error message follows the "not in vault — run
// `sh1pt secret set ...`" hint pattern that the secrets-model rule
// requires. Used by every contract test that verifies connect() when
// no secret is present.
export function looksLikeVaultHint(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (msg.includes('not in vault') || msg.includes('not set'))
    && (msg.includes('sh1pt secret') || msg.includes('vault') || msg.includes('required'));
}
