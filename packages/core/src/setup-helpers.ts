// Reusable setup() builders. Every adapter's setup() should be one of
// these — bespoke flows are the exception, not the rule. Keeps the 175
// adapter surfaces consistent without forcing every package to hand-roll
// the prompt/validate/persist dance.
//
// Priority order (matches feedback_secrets_and_scraping.md):
//   1. webhookUrlSetup — paste a vendor-provided URL (fastest, no OAuth)
//   2. tokenSetup      — paste a static API key / bearer token
//   3. oauthSetup      — OAuth-style (falls back to manual token paste
//                        until the cloud redirect flow lands)
//   4. manualSetup     — no automation path; print steps, save nothing
//   5. stubSetup       — default for adapters that haven't declared
//                        anything yet (used by defineXxx() auto-default)

import type { SetupContext, SetupResult } from './setup.js';

type SetupFn<C = unknown> = (ctx: SetupContext) => Promise<SetupResult<C>>;

// Helper used by defineXxx() wrappers to auto-install a stub setup on
// every adapter without needing to edit 175 packages. Adapters that
// provide their own setup keep it; the rest get stubSetup(label).
export function autoSetup<T extends { label: string; setup?: SetupFn<any> }>(adapter: T): T {
  return { ...adapter, setup: adapter.setup ?? stubSetup(adapter.label) };
}

// Polymorphic guide helper. Two call sites:
//
//   1. As an adapter `setup:` value — `setupGuide({ label, vendorDocUrl?, steps })`
//      returns a SetupFn that just logs the steps (the manual-paste fallback).
//   2. From inside `ship()` / `build()` when the adapter detects unmet
//      prerequisites — `return setupGuide({ title, steps })` produces a
//      ShipResult-shaped object the caller can return directly.
//
// Discriminated on whether `label` or `title` is supplied.
export interface SetupGuideAsSetupOpts<C = unknown> {
  label: string;
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
}
export interface SetupGuideAsResultOpts {
  title: string;
  steps: string[];
}
export interface SetupGuideResult {
  id: string;
  artifact: string;
  status: 'needs-setup';
  title: string;
  steps: string[];
}
export function setupGuide<C = unknown>(opts: SetupGuideAsSetupOpts<C>): SetupFn<C>;
export function setupGuide(opts: SetupGuideAsResultOpts): SetupGuideResult;
export function setupGuide<C = unknown>(
  opts: SetupGuideAsSetupOpts<C> | SetupGuideAsResultOpts,
): SetupFn<C> | SetupGuideResult {
  if ('label' in opts) {
    const o = opts;
    return async (ctx) => {
      ctx.log(`${o.label}: setup steps`);
      for (const line of o.steps) ctx.log(`  ${line}`);
      if (o.vendorDocUrl) await ctx.open(o.vendorDocUrl);
      return { ok: false, config: (o.config ?? {}) as C, manual: o.steps };
    };
  }
  return {
    id: 'setup-needed',
    artifact: 'setup-needed',
    status: 'needs-setup',
    title: opts.title,
    steps: opts.steps,
  };
}

// Default fallback for adapters that haven't declared a real setup yet.
// Emitted automatically by every defineXxx() so `sh1pt <cat> <name> setup`
// is always available.
export function stubSetup<C = unknown>(label?: string): SetupFn<C> {
  return async (ctx) => {
    const name = label ?? 'this adapter';
    ctx.log(`${name}: setup() not wired yet — only the generic fallback runs.`);
    return {
      ok: false,
      config: {} as C,
      manual: [
        `${name} has no adapter-specific setup flow yet.`,
        'File an issue to prioritize: https://github.com/profullstack/sh1pt/issues',
      ],
    };
  };
}

// For webhook-style adapters (Discord, Slack, Teams, generic HTTP, Telegram bot).
// User pastes a URL; we validate the prefix (optional), write to the vault,
// persist a small config marker.
export interface WebhookUrlSetupOpts<C = unknown> {
  secretKey: string;               // vault key, e.g. 'DISCORD_WEBHOOK_URL'
  label: string;                   // human name, e.g. 'Discord (channel webhook)'
  urlPrefix?: string;              // validation prefix, e.g. 'https://discord.com/api/webhooks/'
  vendorDocUrl?: string;           // opened in browser for context
  steps: string[];                 // manual fallback + pre-paste guidance
  config?: C;                      // marker written to config.json
}

export function webhookUrlSetup<C = unknown>(opts: WebhookUrlSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    const existing = ctx.secret(opts.secretKey);
    const validPrefix = (v: string) => !opts.urlPrefix || v.startsWith(opts.urlPrefix);

    if (existing && validPrefix(existing)) {
      const reuse = await ctx.prompt<boolean>({
        type: 'confirm',
        message: `${opts.secretKey} already in vault — reuse it?`,
        initial: true,
      });
      if (reuse) return { ok: true, config: (opts.config ?? {}) as C };
    }

    ctx.log(`${opts.label} — paste a webhook URL. Steps:`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const url = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} URL:`,
      validate: opts.urlPrefix
        ? (v) => (!v || v.startsWith(opts.urlPrefix!)) || `Must start with ${opts.urlPrefix}`
        : undefined,
    });

    if (!url || !validPrefix(url)) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }

    await ctx.setSecret(opts.secretKey, url);
    return { ok: true, config: (opts.config ?? {}) as C };
  };
}

// For static-token auth (most APIs: Stripe, Resend, Linear, Porkbun, etc.).
export interface TokenSetupOpts<C = unknown> {
  secretKey: string;               // vault key, e.g. 'STRIPE_SECRET_KEY'
  label: string;                   // human name, e.g. 'Stripe'
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
  // Extra prompts after the primary token (account id, workspace id, etc.).
  // Non-secret values get returned in the config; secret values go to the vault.
  fields?: Array<{
    key: string;                   // config key or secret key
    message: string;
    secret?: boolean;
    required?: boolean;
  }>;
}

export function tokenSetup<C = unknown>(opts: TokenSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    const existing = ctx.secret(opts.secretKey);
    if (existing) {
      const reuse = await ctx.prompt<boolean>({
        type: 'confirm',
        message: `${opts.secretKey} already in vault — reuse it?`,
        initial: true,
      });
      if (reuse) return { ok: true, config: (opts.config ?? {}) as C };
    }

    ctx.log(`${opts.label} setup:`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const token = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} API token:`,
    });

    if (!token) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }
    await ctx.setSecret(opts.secretKey, token);

    const configExtras: Record<string, string> = {};
    for (const field of opts.fields ?? []) {
      const val = await ctx.prompt<string>({
        type: field.secret ? 'password' : 'text',
        message: field.message,
      });
      if (!val && field.required) {
        return {
          ok: false,
          config: { ...(opts.config ?? {}), ...configExtras } as unknown as C,
          manual: [`Required field "${field.key}" not supplied — re-run setup.`, ...opts.steps],
        };
      }
      if (val) {
        if (field.secret) await ctx.setSecret(field.key, val);
        else configExtras[field.key] = val;
      }
    }

    return { ok: true, config: { ...(opts.config ?? {}), ...configExtras } as unknown as C };
  };
}

// OAuth adapters. Two paths:
//
//   1. Loopback PKCE (RFC 8252) — the good UX. CLI starts a tiny HTTP
//      server on localhost:<port>, opens the vendor's auth URL with that
//      as redirect_uri, captures the ?code= callback, exchanges it for a
//      token. No client secret needed (PKCE). Used by `gh auth login`,
//      `gcloud auth login`, Claude Code login, etc.
//
//   2. Manual paste — the universal fallback. Vendor app not registered
//      yet, port can't bind, callback never arrives, token exchange 4xx,
//      etc. → log the reason, print the steps, prompt for a token.
//
// Adapter authors opt in by populating `loopback`. Without it, oauthSetup
// behaves exactly like before (paste-only).
export interface OAuthSetupOpts<C = unknown> {
  secretKey: string;
  label: string;
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
  // Provide to enable the loopback PKCE flow. clientId is public (PKCE
  // means no secret); read from env first to allow per-deploy overrides
  // without touching adapter code: `SH1PT_<UPPER_LABEL>_CLIENT_ID`.
  loopback?: {
    clientId: string;                          // public OAuth client ID
    authUrl: string;                           // e.g. 'https://accounts.google.com/o/oauth2/v2/auth'
    tokenUrl: string;                          // e.g. 'https://oauth2.googleapis.com/token'
    scopes: string[];                          // requested scopes
    redirectUri?: string;                      // default 'http://127.0.0.1:8765/callback'
    refreshSecretKey?: string;                 // vault key for refresh_token; default `${secretKey}_REFRESH`
    extraAuthParams?: Record<string, string>;  // e.g. Google's { access_type: 'offline', prompt: 'consent' }
    // Some providers (Reddit) require Basic-auth on the token endpoint.
    // Most don't — leave undefined to use straight form-encoded POST.
    tokenAuthHeader?: string;
  };
}

export function oauthSetup<C = unknown>(opts: OAuthSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    if (opts.loopback) {
      const ok = await runLoopbackOAuth(ctx, opts);
      if (ok) return { ok: true, config: (opts.config ?? {}) as C };
      ctx.log(`  loopback flow didn't complete — falling back to manual paste.`);
    } else {
      ctx.log(`${opts.label} uses OAuth. Automated OAuth flow not wired for this adapter — capturing a token manually.`);
    }

    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);

    const token = await ctx.prompt<string>({
      type: 'password',
      message: `Paste the ${opts.label} access token (or leave blank to finish later):`,
    });
    if (!token) {
      return { ok: false, config: (opts.config ?? {}) as C, manual: opts.steps };
    }
    await ctx.setSecret(opts.secretKey, token);
    return { ok: true, config: (opts.config ?? {}) as C };
  };
}

// Returns true on successful token capture (access_token saved to vault),
// false on any failure (caller falls through to paste flow).
async function runLoopbackOAuth(ctx: SetupContext, opts: OAuthSetupOpts<unknown>): Promise<boolean> {
  const lb = opts.loopback!;
  const { createServer } = await import('node:http');
  const { randomBytes, createHash } = await import('node:crypto');

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  const redirectUri = lb.redirectUri ?? 'http://127.0.0.1:8765/callback';
  let port: number;
  let callbackPath: string;
  try {
    const u = new URL(redirectUri);
    port = u.port ? Number(u.port) : 80;
    callbackPath = u.pathname || '/callback';
  } catch {
    ctx.log(`  invalid redirectUri: ${redirectUri}`);
    return false;
  }

  const authUrl = new URL(lb.authUrl);
  authUrl.searchParams.set('client_id', lb.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', lb.scopes.join(' '));
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  for (const [k, v] of Object.entries(lb.extraAuthParams ?? {})) {
    authUrl.searchParams.set(k, v);
  }

  ctx.log(`${opts.label}: starting loopback OAuth on ${redirectUri}`);
  ctx.log(`  Click to authenticate: ${authUrl.toString()}`);

  // Race: callback wins, timeout loses, server-bind error loses.
  const codePromise = new Promise<{ code: string } | { error: string }>((resolve) => {
    const server = createServer((req, res) => {
      if (!req.url) return;
      const reqUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404).end();
        return;
      }
      const recvState = reqUrl.searchParams.get('state');
      const code = reqUrl.searchParams.get('code');
      const errorParam = reqUrl.searchParams.get('error');

      const finish = (status: number, body: string, payload: { code: string } | { error: string }) => {
        res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(body);
        // Defer close so the response actually flushes to the browser.
        setTimeout(() => server.close(), 50);
        resolve(payload);
      };

      if (errorParam) {
        finish(400, htmlPage(`✗ ${escapeHtml(errorParam)}`, 'You can close this tab.'), { error: errorParam });
        return;
      }
      if (recvState !== state) {
        finish(400, htmlPage('✗ state mismatch', 'Possible CSRF — re-run setup.'), { error: 'state mismatch' });
        return;
      }
      if (!code) {
        finish(400, htmlPage('✗ missing code', 'No authorization code in callback.'), { error: 'missing code' });
        return;
      }
      finish(200, htmlPage('✓ Logged in', 'You can close this tab and return to the terminal.'), { code });
    });

    server.on('error', (err) => resolve({ error: `bind: ${err.message}` }));
    server.listen(port, '127.0.0.1');
  });

  await ctx.open(authUrl.toString());

  const result = await Promise.race<{ code: string } | { error: string }>([
    codePromise,
    new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout (5m)' }), 5 * 60 * 1000)),
  ]);

  if ('error' in result) {
    ctx.log(`  ${result.error}`);
    return false;
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: result.code,
    redirect_uri: redirectUri,
    client_id: lb.clientId,
    code_verifier: verifier,
  });

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  if (lb.tokenAuthHeader) headers.authorization = lb.tokenAuthHeader;

  let tokenRes: Response;
  try {
    tokenRes = await fetch(lb.tokenUrl, { method: 'POST', headers, body: tokenBody });
  } catch (err) {
    ctx.log(`  token exchange network error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    ctx.log(`  token exchange ${tokenRes.status}: ${body.slice(0, 200)}`);
    return false;
  }

  const data = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    ctx.log(`  token response missing access_token`);
    return false;
  }

  await ctx.setSecret(opts.secretKey, data.access_token);
  if (data.refresh_token) {
    await ctx.setSecret(lb.refreshSecretKey ?? `${opts.secretKey}_REFRESH`, data.refresh_token);
  }
  ctx.log(`  ✓ ${opts.label} authorized.`);
  return true;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function htmlPage(heading: string, body: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,system-ui,sans-serif;max-width:420px;margin:4em auto;text-align:center;color:#222"><h1 style="font-weight:500">${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p></body></html>`;
}

// Browser-mode adapters where the official API is locked behind a paid
// tier (X v2), gated by ID checks (TikTok, Instagram), or simply absent
// (most "social-*" surfaces). The user logs in with their normal browser
// session and pastes the auth cookie(s) back; we save them to the vault
// and the adapter's post() / connect() drives a Playwright session with
// those cookies pre-loaded.
//
// Accepts three input shapes:
//   1. A single value (the user knows the cookie name and pasted only the value)
//   2. `name=value; name2=value2` — the raw `document.cookie` form
//   3. JSON array of `{ name, value, ... }` — the format every browser
//      cookie-export extension produces (Cookie Editor, EditThisCookie, …)
// We pull whichever cookies the adapter declared as required and save
// each under its own vault key.
export interface CookieSetupOpts<C = unknown> {
  label: string;                        // human name, e.g. 'X (Twitter)'
  loginUrl: string;                     // where the user signs in (e.g. 'https://x.com/login')
  // Cookies the adapter needs. Required cookies must all be present after
  // parsing; optional ones are saved if found and skipped otherwise.
  cookies: Array<{
    name: string;                       // cookie name on the vendor domain (e.g. 'auth_token')
    secretKey: string;                  // vault key to save under (e.g. 'X_AUTH_TOKEN')
    description?: string;               // shown to the user, e.g. 'session token'
    required?: boolean;                 // default: true
  }>;
  steps?: string[];                     // extra instructions before pasting
  config?: C;                           // marker written to config.json
}

export function cookieSetup<C = unknown>(opts: CookieSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    const required = opts.cookies.filter((c) => c.required !== false);
    const allReadyInVault = required.every((c) => ctx.secret(c.secretKey));
    if (allReadyInVault) {
      const reuse = await ctx.prompt<boolean>({
        type: 'confirm',
        message: `${opts.label} cookies already in vault — reuse them?`,
        initial: true,
      });
      if (reuse) return { ok: true, config: (opts.config ?? {}) as C };
    }

    ctx.log(`${opts.label} — sign in with your normal browser, then come back here.`);
    ctx.log(`  1. Open ${opts.loginUrl} and sign in.`);
    if (opts.cookies.length === 1) {
      const c = opts.cookies[0]!;
      ctx.log(`  2. Open DevTools → Application → Cookies, copy the value of "${c.name}"${c.description ? ` (${c.description})` : ''}.`);
    } else {
      ctx.log(`  2. Export your cookies for this domain. Either:`);
      ctx.log(`       a) Use a "Cookie Editor" extension and copy the JSON export, or`);
      ctx.log(`       b) Run \`document.cookie\` in the JS console and copy the whole string.`);
      ctx.log(`     We need: ${opts.cookies.map((c) => c.name).join(', ')}.`);
      ctx.log(`     If the paste-all step misses anything, we'll ask for each cookie individually.`);
    }
    if (opts.steps) for (const line of opts.steps) ctx.log(`  ${line}`);
    ctx.log(`  3. Paste below. Nothing leaves your machine until it's encrypted.`);
    await ctx.open(opts.loginUrl);

    const found: Record<string, string> = {};

    // Step A: try a paste-all input first. Use a visible 'text' prompt
    // since long pastes through 'password' (asterisk redraw per char)
    // get mangled in a lot of terminals. The pasted blob is ephemeral —
    // it leaves the screen as soon as the user presses Enter.
    const raw = await ctx.prompt<string>({
      type: 'text',
      message:
        opts.cookies.length === 1
          ? `Paste ${opts.cookies[0]!.name} value (or the full document.cookie), or leave blank:`
          : `Paste cookies (JSON export or "name=value; name2=value2"), or leave blank to enter one at a time:`,
    });

    if (raw && raw.trim().length > 0) {
      const parsed = parseCookies(raw);
      if (opts.cookies.length === 1 && Object.keys(parsed).length === 0) {
        // Single-cookie target and no key/value structure detected —
        // treat the whole paste as the value.
        found[opts.cookies[0]!.name] = raw.trim();
      } else {
        for (const c of opts.cookies) {
          const v = parsed[c.name];
          if (v) found[c.name] = v;
        }
      }
      const namesFound = Object.keys(found);
      if (namesFound.length > 0) {
        ctx.log(`  ✓ found in paste: ${namesFound.join(', ')}`);
      } else {
        ctx.log(`  paste didn't yield any of the cookies we need — falling back to one-at-a-time.`);
      }
    }

    // Step B: per-missing-cookie fallback. Mask each individual paste
    // with 'password' (short values, terminals handle them fine).
    for (const c of opts.cookies) {
      if (found[c.name]) continue;
      const must = c.required !== false;
      const v = await ctx.prompt<string>({
        type: 'password',
        message: `Paste ${c.name}${c.description ? ` (${c.description})` : ''}${must ? '' : ' — optional, blank to skip'}:`,
      });
      if (!v) continue;
      // Accept either "name=value" or just the bare value.
      const cleaned = v.trim().replace(new RegExp(`^${escapeRegex(c.name)}\\s*=\\s*`), '');
      if (cleaned) found[c.name] = cleaned;
    }

    const missingRequired = required.filter((c) => !found[c.name]);
    if (missingRequired.length > 0) {
      return {
        ok: false,
        config: (opts.config ?? {}) as C,
        manual: [
          `Couldn't find required cookie(s): ${missingRequired.map((c) => c.name).join(', ')}.`,
          `Make sure you're logged in at ${opts.loginUrl} before exporting cookies, then re-run setup.`,
        ],
      };
    }

    for (const c of opts.cookies) {
      const v = found[c.name];
      if (v) await ctx.setSecret(c.secretKey, v);
    }
    return { ok: true, config: (opts.config ?? {}) as C };
  };
}

// Best-effort cookie parser. Accepts:
//   - JSON array (Cookie Editor / EditThisCookie / Get cookies.txt LOCALLY:
//     [{name, value, ...}, ...])
//   - "name=value; name2=value2" pairs (raw document.cookie)
//   - "name=value" newline-separated pairs (curl --cookie style)
//   - Malformed JSON where the brace structure is broken but
//     "name":"X","value":"Y" pairs are still recoverable (the common
//     terminal-paste corruption mode).
function parseCookies(raw: string): Record<string, string> {
  let trimmed = raw.trim().replace(/^﻿/, '');
  // Strip outer wrapping quotes/backticks if the user's shell escaped
  // the paste (some prompts do this with multi-line content).
  for (const wrap of ['"', "'", '`']) {
    if (trimmed.startsWith(wrap) && trimmed.endsWith(wrap) && trimmed.length > 1) {
      trimmed = trimmed.slice(1, -1);
      break;
    }
  }

  const looksLikeJson = trimmed.startsWith('[') || trimmed.startsWith('{');
  if (looksLikeJson) {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : [data];
      const out: Record<string, string> = {};
      for (const entry of arr) {
        if (entry && typeof entry === 'object' && typeof entry.name === 'string' && typeof entry.value === 'string') {
          out[entry.name] = entry.value;
        }
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      // fall through to regex recovery
    }
    const out: Record<string, string> = {};
    // Recover "name":"X" + "value":"Y" pairs even if the surrounding
    // structure is broken. Cookie Editor puts name before value in
    // every entry, so a sliding regex catches them in pairs.
    const re = /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"[^}]*?"value"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      try {
        const name = JSON.parse(`"${m[1]!}"`);
        const value = JSON.parse(`"${m[2]!}"`);
        if (typeof name === 'string' && typeof value === 'string') out[name] = value;
      } catch {
        // skip malformed entry
      }
    }
    if (Object.keys(out).length > 0) return out;
  }

  // name=value; name2=value2 OR newline-separated.
  const out: Record<string, string> = {};
  for (const pair of trimmed.split(/[;\n]/)) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (name) out[name] = value;
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pure instructions — no automation possible (App Store identity
// verification, Google Play payment profile, Apple D-U-N-S, etc.).
export interface ManualSetupOpts<C = unknown> {
  label: string;
  vendorDocUrl?: string;
  steps: string[];
  config?: C;
}

export function manualSetup<C = unknown>(opts: ManualSetupOpts<C>): SetupFn<C> {
  return async (ctx) => {
    ctx.log(`${opts.label}: manual setup only — no automation path yet.`);
    for (const line of opts.steps) ctx.log(`  ${line}`);
    if (opts.vendorDocUrl) await ctx.open(opts.vendorDocUrl);
    return {
      ok: false,
      config: (opts.config ?? {}) as C,
      manual: opts.steps,
    };
  };
}
