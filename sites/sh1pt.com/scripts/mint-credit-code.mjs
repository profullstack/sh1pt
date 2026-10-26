#!/usr/bin/env node
// Mint, list or revoke sh1pt credit codes (days of sh1pt Pro) from a shell.
//
//   set -a; . ~/www/sh1pt.com/app.env; set +a
//   node sites/sh1pt.com/scripts/mint-credit-code.mjs --days 30 --label "for Kim" [--max 1] [--expires-days 90]
//   node sites/sh1pt.com/scripts/mint-credit-code.mjs --list
//   node sites/sh1pt.com/scripts/mint-credit-code.mjs --revoke <codeId>
//
// Needs NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.
// Run from a checkout with node_modules installed. The code prints once.
import { createClient } from '@supabase/supabase-js';
import { Credits, supabaseStore } from '@profullstack/redeem-credits';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (source app.env).');
  process.exit(2);
}
const credits = new Credits(supabaseStore(createClient(url, key, { auth: { persistSession: false } })));

if (args.includes('--list')) {
  for (const c of await credits.list()) {
    const state = c.revokedAt ? 'revoked' : c.expiresAt && Date.now() >= c.expiresAt ? 'expired' : `${c.redemptions}/${c.maxRedemptions} used`;
    console.log(`${c.id}  ${c.grant.amount} ${c.grant.unit}  ${state}  ${c.label}`);
  }
} else if (opt('revoke')) {
  await credits.revoke(opt('revoke'));
  console.log('revoked', opt('revoke'));
} else {
  const days = Number(opt('days'));
  if (!Number.isInteger(days) || days < 1 || days > 3660) {
    console.error('--days must be a whole number from 1 to 3660');
    process.exit(2);
  }
  const max = Number(opt('max') ?? 1);
  const expiresDays = opt('expires-days') ? Number(opt('expires-days')) : null;
  const minted = await credits.mint({
    grant: { unit: 'pro_days', amount: days },
    label: opt('label') ?? `${days} days of sh1pt Pro`,
    maxRedemptions: max,
    expiresAt: expiresDays ? Date.now() + expiresDays * 86_400_000 : null,
    createdBy: 'cli',
  });
  console.log(minted.code);
  console.error(`id ${minted.id} · ${days} days of sh1pt Pro · ${max} use(s) · redeem at https://sh1pt.com/dashboard or \`sh1pt redeem ${minted.code}\``);
}
