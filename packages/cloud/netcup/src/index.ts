import { defineCloud, tokenSetup, type Instance, type Quote, type InstanceSpec } from '@profullstack/sh1pt-core';

// netcup — Server Control Panel (SCP) REST API.
//
// netcup's model differs from every other adapter here: servers are BOUGHT in
// the Customer Control Panel (a checkout with a contract), and the SCP API only
// ever sees servers that already exist on the account. There is no order
// endpoint and no cancel endpoint — the SOAP webservice never had one, and the
// REST API that replaced it on 2026-04-30 does not either (63 paths, none of
// them create or delete a server).
//
// So `provision` here means ADOPT: take a server already on the account that
// has no OS installed, install one on it, and hand it back as an Instance. That
// is the real netcup workflow, and it is genuinely useful — `POST /servers/{id}/image`
// takes an ssh key list and a `customScript`, so a provision can land a fully
// configured box in one call.
//
// API docs: https://www.netcup.com/en/helpcenter/documentation/server/rest-api
// OpenAPI:  https://www.servercontrolpanel.de/scp-core/api/v1/openapi
interface Config {
  defaultImage?: string;      // image flavour alias/name, e.g. 'Ubuntu 24.04'
  // Adopt only servers whose name/nickname matches this prefix. Without it,
  // provision refuses to touch anything when the account holds more than one
  // uninstalled server — wiping the wrong box is not a recoverable mistake.
  adoptPrefix?: string;
  // Shell script handed to the installer, run on first boot. This is where
  // root-ubuntu.sh goes.
  customScript?: string;
}

const API = 'https://www.servercontrolpanel.de/scp-core/api/v1';
const TOKEN_URL = 'https://www.servercontrolpanel.de/realms/scp/protocol/openid-connect/token';

// netcup publishes no pricing endpoint, so quotes come from the published
// price list. Monthly is the real number — netcup bills monthly contracts, not
// by the hour — and hourly is derived only to satisfy the Quote shape.
// Prices in EUR incl. 19% VAT, verified 2026-08-16.
const PRICES: Array<{ sku: string; cpu: number; memory: number; storage: number; monthly: number }> = [
  { sku: 'VPS 500 G12', cpu: 2, memory: 2, storage: 64, monthly: 3.97 },
  { sku: 'VPS 1000 G12', cpu: 4, memory: 8, storage: 256, monthly: 10.37 },
  { sku: 'VPS 2000 G12', cpu: 8, memory: 16, storage: 512, monthly: 19.25 },
  { sku: 'VPS 4000 G12', cpu: 12, memory: 32, storage: 1024, monthly: 32.41 },
  { sku: 'VPS 8000 G12', cpu: 16, memory: 64, storage: 2048, monthly: 47.95 },
];

const HOURS_PER_MONTH = 730;

// ── Response shapes ──────────────────────────────────────────────

type ServerState = 'ON' | 'OFF' | 'SUSPENDED';

interface NetcupServerTemplate {
  id: number;
  name: string;
}

interface NetcupServerListItem {
  id: number;
  name: string;
  hostname?: string | null;
  nickname?: string | null;
  disabled: boolean;
  template?: NetcupServerTemplate | null;
}

interface NetcupServerInfo {
  state: ServerState;
  uptimeInSeconds?: number;
  currentServerMemoryInMiB?: number;
  maxServerMemoryInMiB?: number;
  cpuCount?: number;
  template?: string | null;
}

interface NetcupIPv4 {
  id: number;
  ip: string;
  netmask?: string;
  gateway?: string | null;
}

interface NetcupSite {
  id: number;
  city: string;
}

interface NetcupServer extends NetcupServerListItem {
  serverLiveInfo?: NetcupServerInfo | null;
  ipv4Addresses?: NetcupIPv4[];
  site?: NetcupSite;
  maxCpuCount?: number;
  disksAvailableSpaceInMiB?: number;
  architecture?: 'AMD64' | 'ARM64';
}

interface NetcupImageFlavour {
  id: number;
  name: string;
  alias: string;
}

interface NetcupSshKey {
  id: number;
  name?: string;
}

interface NetcupTokenResponse {
  access_token: string;
  expires_in: number;
}

// ── Adapter ──────────────────────────────────────────────────────

export default defineCloud<Config>({
  id: 'cloud-netcup',
  label: 'netcup (VPS, Root Server — adopt & install; ordering is manual)',
  supports: ['cpu-vps'],

  async connect(ctx, _config) {
    requireCredentials(ctx);
    ctx.log('netcup connect · requesting token...');
    const token = await accessToken(ctx);
    const servers = await netcupRequest<NetcupServerListItem[]>(ctx, 'GET', '/servers', undefined, token);
    const accountId = ctx.secret('NETCUP_SCP_CLIENT_ID') ?? ctx.secret('NETCUP_SCP_USERNAME') ?? 'netcup-account';
    ctx.log(`netcup connected · account=${accountId} · servers=${servers.length}`);
    return { accountId };
  },

  async quote(ctx, spec, _config) {
    const match = pickPlan(spec);
    if (!match) {
      ctx.log(`netcup quote · nothing in the published price list satisfies cpu=${spec.cpu ?? '-'} memory=${spec.memory ?? '-'}GB storage=${spec.storage ?? '-'}GB`, 'warn');
      return { hourly: 0, monthly: 0, currency: 'EUR', provider: 'netcup', sku: 'none', spot: false };
    }
    ctx.log(`netcup quote · ${match.sku} · €${match.monthly.toFixed(2)}/mo (list price — netcup bills monthly, not hourly)`);
    return {
      hourly: round4(match.monthly / HOURS_PER_MONTH),
      monthly: match.monthly,
      currency: 'EUR',
      provider: 'netcup',
      sku: match.sku,
      spot: false,
    } satisfies Quote;
  },

  // Adopt an already-purchased, not-yet-installed server and install an OS on
  // it. Never touches a server that already has a template — that is somebody's
  // running box, and installing over it destroys the disk.
  async provision(ctx, spec, config) {
    requireCredentials(ctx);
    const token = await accessToken(ctx);
    const servers = await netcupRequest<NetcupServerListItem[]>(ctx, 'GET', '/servers', undefined, token);

    const candidates = adoptable(servers, config.adoptPrefix);
    if (candidates.length === 0) {
      throw new Error(orderInstructions(spec, config.adoptPrefix, servers.length));
    }
    if (candidates.length > 1 && !config.adoptPrefix) {
      throw new Error(
        `netcup provision: ${candidates.length} servers on the account have no OS installed ` +
        `(${candidates.map(s => s.name).join(', ')}). Installing wipes the target disk, so refusing to guess. ` +
        `Set adoptPrefix in the provider config to name which one to take.`,
      );
    }

    const target = candidates[0]!;
    const flavours = await netcupRequest<NetcupImageFlavour[]>(ctx, 'GET', `/servers/${target.id}/imageflavours`, undefined, token);
    const image = pickImage(flavours, spec.image ?? config.defaultImage);
    if (!image) {
      throw new Error(
        `netcup provision: no image flavour matches "${spec.image ?? config.defaultImage ?? '(unset)'}". ` +
        `Available: ${flavours.map(f => f.alias || f.name).join(', ')}`,
      );
    }

    const hostname = sanitizeHostname(spec.tags?.[0] ?? target.nickname ?? target.name);
    ctx.log(`netcup provision · adopting server ${target.name} (id=${target.id}) · image=${image.alias || image.name} · hostname=${hostname}`);

    if (ctx.dryRun) {
      ctx.log('netcup provision · dry run — no image installed');
      return stubInstance(String(target.id), 'provisioning');
    }

    const sshKeyIds = await resolveSshKeyIds(ctx, spec.sshKeyIds, token);
    await netcupRequest<unknown>(ctx, 'POST', `/servers/${target.id}/image`, {
      imageFlavourId: image.id,
      hostname,
      rootPartitionFullDiskSize: true,
      ...(sshKeyIds.length ? { sshKeyIds } : {}),
      // No key means password auth has to stay on, or the box is unreachable.
      sshPasswordAuthentication: sshKeyIds.length === 0,
      ...(config.customScript ? { customScript: config.customScript } : {}),
    }, token);

    ctx.log(`netcup provision · image install started on ${target.name} — poll status for readiness`);
    const detail = await netcupRequest<NetcupServer>(ctx, 'GET', `/servers/${target.id}`, undefined, token);
    return serverToInstance(detail, 'provisioning');
  },

  async list(ctx, _config) {
    requireCredentials(ctx);
    const token = await accessToken(ctx);
    ctx.log('netcup list · fetching servers');
    const servers = await netcupRequest<NetcupServerListItem[]>(ctx, 'GET', '/servers', undefined, token);

    const detailed = await Promise.all(servers.map(async (s) => {
      try {
        return serverToInstance(await netcupRequest<NetcupServer>(ctx, 'GET', `/servers/${s.id}`, undefined, token));
      } catch {
        // A server that errors on detail still exists and still bills. Report
        // it from the list shape rather than dropping it from the inventory.
        ctx.log(`netcup list · detail fetch failed for ${s.name}, reporting from list`, 'warn');
        return serverToInstance(s);
      }
    }));
    return detailed;
  },

  // netcup has no cancel endpoint — a server is a monthly contract, terminated
  // from the Customer Control Panel. Powering it off would leave the bill
  // running while reporting success, so this fails loudly instead.
  async destroy(ctx, instanceId, _config) {
    ctx.log(`netcup destroy · refusing · ${instanceId}`, 'error');
    throw new Error(
      `netcup cannot cancel server ${instanceId} over the API — no cancel endpoint exists. ` +
      `A netcup server is a monthly contract: terminate it at https://www.customercontrolpanel.de ` +
      `(Products → your server → Cancel). Until you do, it keeps billing. ` +
      `To wipe it without cancelling, reinstall via provision.`,
    );
  },

  async status(ctx, instanceId, _config) {
    requireCredentials(ctx);
    const token = await accessToken(ctx);
    ctx.log(`netcup status · ${instanceId}`);
    const server = await netcupRequest<NetcupServer>(ctx, 'GET', `/servers/${instanceId}`, undefined, token);
    return serverToInstance(server);
  },

  setup: tokenSetup<Config>({
    secretKey: 'NETCUP_SCP_CLIENT_SECRET',
    label: 'netcup SCP',
    vendorDocUrl: 'https://www.netcup.com/en/helpcenter/documentation/server/rest-api',
    steps: [
      'Log in to https://www.servercontrolpanel.de',
      'Open Options → REST API and enable API access',
      'Create API credentials — note the client id and client secret',
      'Optionally restrict access by IP (Options → REST API → IP filter)',
      'Run: sh1pt secret set NETCUP_SCP_CLIENT_ID <client id>',
      'Run: sh1pt secret set NETCUP_SCP_CLIENT_SECRET <client secret>',
      'Servers are ORDERED at netcup.com — there is no order API. Buy the VPS first, then provision adopts it.',
    ],
    fields: [
      { key: 'defaultImage', message: 'Default image flavour (e.g. Ubuntu 24.04):' },
      { key: 'adoptPrefix', message: 'Only adopt servers whose name starts with (blank = require exactly one uninstalled server):' },
    ],
  }),
});

// ── Helpers ──────────────────────────────────────────────────────

function requireCredentials(ctx: { secret(k: string): string | undefined }): void {
  const hasClient = ctx.secret('NETCUP_SCP_CLIENT_ID') && ctx.secret('NETCUP_SCP_CLIENT_SECRET');
  const hasPassword = ctx.secret('NETCUP_SCP_USERNAME') && ctx.secret('NETCUP_SCP_PASSWORD');
  if (!hasClient && !hasPassword) {
    throw new Error(
      'netcup credentials not in vault — set NETCUP_SCP_CLIENT_ID + NETCUP_SCP_CLIENT_SECRET ' +
      '(SCP → Options → REST API), or NETCUP_SCP_USERNAME (your CCP customer number) + NETCUP_SCP_PASSWORD',
    );
  }
}

export function orderInstructions(spec: InstanceSpec, adoptPrefix: string | undefined, serverCount: number): string {
  const plan = pickPlan(spec);
  const which = plan ? `${plan.sku} (€${plan.monthly.toFixed(2)}/mo)` : 'a VPS matching your spec';
  const scoped = adoptPrefix ? ` matching prefix "${adoptPrefix}"` : '';
  return (
    `netcup provision: no server without an OS${scoped} on this account (${serverCount} server(s) seen). ` +
    `netcup has no order API — servers are bought through checkout, not provisioned. ` +
    `Order ${which} at https://www.netcup.com/en/server/vps, wait for the SCP welcome mail, ` +
    `then re-run this command and it will adopt the new server and install the image.`
  );
}

export function adoptable(servers: NetcupServerListItem[], adoptPrefix?: string): NetcupServerListItem[] {
  return servers.filter((s) => {
    if (s.disabled) return false;
    // A template means an OS is already installed. Adopting it would wipe it.
    if (s.template) return false;
    if (!adoptPrefix) return true;
    const p = adoptPrefix.toLowerCase();
    return (s.name?.toLowerCase().startsWith(p) ?? false) || (s.nickname?.toLowerCase().startsWith(p) ?? false);
  });
}

export function pickPlan(spec: InstanceSpec): (typeof PRICES)[number] | null {
  let candidates = PRICES.slice();
  if (spec.cpu) candidates = candidates.filter(p => p.cpu >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter(p => p.memory >= spec.memory!);
  if (spec.storage) candidates = candidates.filter(p => p.storage >= spec.storage!);
  if (spec.maxHourlyPrice) {
    candidates = candidates.filter(p => p.monthly / HOURS_PER_MONTH <= spec.maxHourlyPrice!);
  }
  candidates.sort((a, b) => a.monthly - b.monthly);
  return candidates[0] ?? null;
}

export function pickImage(flavours: NetcupImageFlavour[], wanted?: string): NetcupImageFlavour | null {
  if (!flavours.length) return null;
  if (!wanted) {
    return flavours.find(f => /ubuntu/i.test(f.alias || f.name) && /24\.04|lts/i.test(f.alias || f.name))
      ?? flavours.find(f => /ubuntu/i.test(f.alias || f.name))
      ?? flavours[0]!;
  }
  const w = wanted.toLowerCase();
  return flavours.find(f => (f.alias || '').toLowerCase() === w || (f.name || '').toLowerCase() === w)
    ?? flavours.find(f => (f.alias || '').toLowerCase().includes(w) || (f.name || '').toLowerCase().includes(w))
    ?? null;
}

// netcup validates hostnames against a strict pattern; a rejected hostname
// fails the whole install, so normalize rather than pass through.
export function sanitizeHostname(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 63);
  return cleaned || 'sh1pt-host';
}

export function serverToInstance(s: NetcupServer | NetcupServerListItem, override?: Instance['status']): Instance {
  const detail = s as NetcupServer;
  const live = detail.serverLiveInfo;
  const stateMap: Record<ServerState, Instance['status']> = {
    ON: 'running',
    OFF: 'stopped',
    SUSPENDED: 'stopped',
  };
  const status: Instance['status'] = override
    ?? (s.disabled ? 'stopped' : live?.state ? stateMap[live.state] : 'provisioning');

  const ip = detail.ipv4Addresses?.find(a => a.ip)?.ip;
  const memory = live?.maxServerMemoryInMiB ? Math.round(live.maxServerMemoryInMiB / 1024) : undefined;
  const plan = PRICES.find(p => p.cpu === (detail.maxCpuCount ?? live?.cpuCount) && p.memory === memory);

  return {
    id: String(s.id),
    kind: 'cpu-vps',
    status,
    publicIp: ip,
    // netcup exposes no creation timestamp on a server, and inventing one here
    // would be worse than reporting the epoch honestly.
    createdAt: new Date(0).toISOString(),
    hourlyRate: plan ? round4(plan.monthly / HOURS_PER_MONTH) : 0,
    currency: 'EUR',
    sku: plan?.sku ?? detail.template?.name ?? s.template?.name ?? undefined,
    region: detail.site?.city,
    metadata: {
      name: s.name,
      ...(s.nickname ? { nickname: s.nickname } : {}),
      ...(s.hostname ? { hostname: s.hostname } : {}),
      ...(detail.architecture ? { architecture: detail.architecture } : {}),
      ...(live?.uptimeInSeconds !== undefined ? { uptimeInSeconds: live.uptimeInSeconds } : {}),
      installed: Boolean(s.template),
    },
  };
}

function stubInstance(id: string, status: Instance['status']): Instance {
  return {
    id,
    kind: 'cpu-vps',
    status,
    createdAt: new Date(0).toISOString(),
    hourlyRate: 0,
    currency: 'EUR',
  };
}

async function resolveSshKeyIds(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  requested: string[] | undefined,
  token: string,
): Promise<number[]> {
  if (!requested?.length) return [];
  const userId = ctx.secret('NETCUP_SCP_USER_ID');
  // Numeric ids can be used as-is; names need the account's key list to resolve.
  const numeric = requested.filter(k => /^\d+$/.test(k)).map(Number);
  const named = requested.filter(k => !/^\d+$/.test(k));
  if (!named.length) return numeric;
  if (!userId) {
    ctx.log(`netcup provision · cannot resolve ssh key name(s) ${named.join(', ')} without NETCUP_SCP_USER_ID — using numeric ids only`, 'warn');
    return numeric;
  }
  const keys = await netcupRequest<NetcupSshKey[]>(ctx, 'GET', `/users/${userId}/ssh-keys`, undefined, token);
  for (const name of named) {
    const hit = keys.find(k => k.name === name);
    if (hit) numeric.push(hit.id);
    else ctx.log(`netcup provision · ssh key "${name}" not found on the account`, 'warn');
  }
  return numeric;
}

// ── Transport ────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

export function resetTokenCache(): void {
  tokenCache = null;
}

async function accessToken(ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void }): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const clientId = ctx.secret('NETCUP_SCP_CLIENT_ID');
  const clientSecret = ctx.secret('NETCUP_SCP_CLIENT_SECRET');
  const username = ctx.secret('NETCUP_SCP_USERNAME');
  const password = ctx.secret('NETCUP_SCP_PASSWORD');

  const form = new URLSearchParams();
  if (clientId && clientSecret) {
    form.set('grant_type', 'client_credentials');
    form.set('client_id', clientId);
    form.set('client_secret', clientSecret);
  } else if (username && password) {
    form.set('grant_type', 'password');
    form.set('client_id', ctx.secret('NETCUP_SCP_CLIENT_ID') ?? 'scp-rest-api');
    form.set('username', username);
    form.set('password', password);
  } else {
    throw new Error('netcup credentials not in vault — see `sh1pt setup cloud-netcup`');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`netcup auth failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as NetcupTokenResponse;
  // Expire a minute early so a token never dies mid-request.
  tokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(0, (data.expires_in - 60)) * 1000 };
  return data.access_token;
}

async function netcupRequest<T = unknown>(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const bearer = token ?? await accessToken(ctx);
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(stripUndefined(body));

  const response = await fetch(`${API}${path}`, opts);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch (error) {
    if (!response.ok) data = { message: text || response.statusText };
    else throw error;
  }

  if (!response.ok) {
    throw new Error(`netcup ${method} ${path} failed: ${response.status} ${extractErrorMessage(data, response.statusText)}`);
  }
  return data as T;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data) {
    const d = data as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error', 'detail', 'title']) {
      if (typeof d[key] === 'string') return d[key] as string;
    }
  }
  return fallback;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, stripUndefined(v)]),
  );
}
