import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeCredentials } from '../credentials.js';
import { accountFetch, invitesCmd, redeemCmd } from './account.js';

describe('redeem / invites commands', () => {
  let dir: string;
  const saved = { xdg: process.env.XDG_CONFIG_HOME, api: process.env.SH1PT_API_URL };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sh1pt-account-'));
    process.env.XDG_CONFIG_HOME = dir;
    process.env.SH1PT_API_URL = 'https://sh1pt.test';
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (saved.xdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = saved.xdg;
    if (saved.api === undefined) delete process.env.SH1PT_API_URL;
    else process.env.SH1PT_API_URL = saved.api;
  });

  it('registers redeem <code> and invites create/revoke', () => {
    expect(redeemCmd.name()).toBe('redeem');
    expect(invitesCmd.commands.map((c) => c.name())).toEqual(['create', 'revoke']);
  });

  it('refuses without a saved session', async () => {
    await expect(accountFetch('/api/v1/invites')).rejects.toThrow(/sh1pt login/);
  });

  it('sends the saved access token as a bearer to the API base', async () => {
    await writeCredentials({ access_token: 'tok123', refresh_token: 'r' });
    let seen: { url: string; auth: string | null; type: string | null } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen = { url, auth: h.get('authorization'), type: h.get('content-type') };
      return new Response('{}');
    }) as unknown as typeof fetch;
    await accountFetch('/api/v1/credits/redeem', { method: 'POST', body: '{"code":"x"}' }, fake);
    expect(seen).toEqual({
      url: 'https://sh1pt.test/api/v1/credits/redeem',
      auth: 'Bearer tok123',
      type: 'application/json',
    });
  });
});
