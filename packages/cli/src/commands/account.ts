// `sh1pt redeem <code>` and `sh1pt invites [create|revoke]`: credit codes
// (days of sh1pt Pro) and the three invites every account gets. Both talk
// to sh1pt.com with the session `sh1pt login` saved.

import { Command } from 'commander';
import kleur from 'kleur';
import { apiBaseUrl, ensureFreshAccess, readCredentials } from '../credentials.js';

type Fetcher = typeof fetch;

export async function accountFetch(path: string, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<Response> {
  const stored = await readCredentials();
  if (!stored) throw new Error('Not signed in. Run `sh1pt login` first.');
  const creds = (await ensureFreshAccess(stored)) ?? stored;
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${creds.access_token}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetcher(`${apiBaseUrl()}${path}`, { ...init, headers });
}

async function json<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const redeemCmd = new Command('redeem')
  .description('Redeem a credit code for days of sh1pt Pro')
  .argument('<code>', 'the code, e.g. CR-XXXX-XXXX-XXXX-XXXX')
  .option('--json', 'print the API response as JSON')
  .action(async (code: string, opts: { json?: boolean }) => {
    const res = await accountFetch('/api/v1/credits/redeem', { method: 'POST', body: JSON.stringify({ code }) });
    const body = await json<{ ok?: boolean; days?: number; plan?: { proUntil: string | null; daysLeft: number } }>(res);
    if (opts.json) {
      console.log(JSON.stringify(body, null, 2));
      if (!res.ok) process.exitCode = 1;
      return;
    }
    if (!res.ok || !body.ok) throw new Error(body.error ?? `redeem failed (${res.status})`);
    console.log(kleur.green(`✓ ${body.days} days of sh1pt Pro added.`));
    if (body.plan?.proUntil) console.log(`  Pro until ${body.plan.proUntil.slice(0, 10)} (${body.plan.daysLeft} days left)`);
  });

interface InviteRow {
  id: string;
  createdAt: number;
  expiresAt: number | null;
  note: string;
  status: string;
  bonus?: string;
}

export const invitesCmd = new Command('invites')
  .description('Your sh1pt invites: 3 per account, 7 days of Pro for you and each new person who joins')
  .option('--json', 'print the API response as JSON')
  .action(async (opts: { json?: boolean }) => {
    const res = await accountFetch('/api/v1/invites');
    const body = await json<{
      quota: { total: number; left: number };
      invites: InviteRow[];
      canInvite: boolean;
      unlocksAt: string | null;
    }>(res);
    if (!res.ok) throw new Error(body.error ?? `invites failed (${res.status})`);
    if (opts.json) {
      console.log(JSON.stringify(body, null, 2));
      return;
    }
    console.log(`${body.quota.left} of ${body.quota.total} invites left`);
    if (!body.canInvite && body.unlocksAt) console.log(kleur.dim(`  invites unlock ${body.unlocksAt.slice(0, 10)}`));
    for (const i of body.invites) {
      const extra = [i.note, `created ${fmt(i.createdAt)}`, i.bonus ? `bonus ${i.bonus}` : ''].filter(Boolean).join(' · ');
      console.log(`  ${i.status.padEnd(8)} ${i.id}  ${kleur.dim(extra)}`);
    }
  });

invitesCmd
  .command('create')
  .description('Create an invite link (shown once)')
  .option('--note <text>', 'who it is for (only you see it)')
  .action(async (opts: { note?: string }) => {
    const res = await accountFetch('/api/v1/invites', { method: 'POST', body: JSON.stringify({ note: opts.note ?? '' }) });
    const body = await json<{ url?: string; code?: string }>(res);
    if (!res.ok || !body.url) throw new Error(body.error ?? `create failed (${res.status})`);
    console.log(body.url);
    console.error(kleur.dim(`code ${body.code} · send the link; it works once, for someone new`));
  });

invitesCmd
  .command('revoke')
  .description('Withdraw an unused invite (refunds the slot)')
  .argument('<id>', 'invite id from `sh1pt invites`')
  .action(async (id: string) => {
    const res = await accountFetch(`/api/v1/invites/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const body = await json<{ ok?: boolean }>(res);
    if (!res.ok) throw new Error(body.error ?? `revoke failed (${res.status})`);
    console.log(kleur.green('✓ withdrawn'));
  });
