import { defineCloud, tokenSetup, type Instance, type InstanceKind, type InstanceSpec, type Quote } from '@profullstack/sh1pt-core';

// Pulsed Media — Finnish host (since 2010) selling seedboxes, storage boxes,
// streamboxes and dedicated servers. Cheap, HDD-heavy, 10–20 Gbps ports.
//
// The shape of this provider is unusual and worth stating plainly, because it
// decides what every method below can honestly do:
//
//   - There is NO provisioning API. Ordering happens through a WHMCS checkout
//     at pulsedmedia.com/clients/, and cancellation happens in the same client
//     area. No REST endpoint creates or destroys a service.
//   - There is no inventory API either. What you get once a service is live is
//     a per-user PMSS panel over HTTPS (`https://<host>/user-<username>/`),
//     plus SSH/SFTP/rsync/rclone/WebDAV as a *user*, never as root.
//   - PMSS — the stack running the boxes — is open source (GPL-3.0) at
//     github.com/MagnaCapax/PMSS, which is where the panel paths come from.
//
// So `provision` here means ADOPT, the same way cloud-netcup does: take a
// service that is already paid for, prove it is reachable, and hand it back as
// an Instance. Services are declared in the adapter config because nothing on
// the provider side will enumerate them for us.
//
// Store (the Eternal Väinämöinen line):
//   https://pulsedmedia.com/clients/index.php/store/the-eternal-vainamoinen
// Wiki:  https://wiki.pulsedmedia.com/
// Affiliate: https://pulsedmedia.com/affiliates.php (automatic weekly credit)

export interface PulsedMediaService {
  host: string;            // e.g. 'ha1.pulsedmedia.com' — from the welcome mail
  username: string;        // seedbox/storage username
  sku?: string;            // plan name from PLANS, e.g. 'Eternal Väinämöinen Storage 4TB R5 10G'
  kind?: InstanceKind;     // override the kind implied by the sku
  label?: string;          // free-text note carried into Instance.metadata
}

interface Config {
  // Every service on the account. Pulsed Media exposes no list endpoint, so
  // this array IS the inventory.
  services?: PulsedMediaService[];
  // Single-service shorthand — equivalent to one entry in `services`.
  host?: string;
  username?: string;
}

const STORE_URL = 'https://pulsedmedia.com/clients/index.php/store/the-eternal-vainamoinen';
const CLIENT_AREA = 'https://pulsedmedia.com/clients/index.php/clientarea';

const HOURS_PER_MONTH = 730;

export interface Plan {
  sku: string;
  kind: InstanceKind;
  storage: number;         // GB, decimal — the number the store advertises
  monthly: number;         // EUR
  portGbps: number;
  egressGiB: number | null;   // null = not published
  cpu?: number;            // cores; undefined where the store does not publish it
  memory?: number;         // GB;    undefined where the store does not publish it
  disk: 'hdd-raid5' | 'ssd-raid0' | 'ssd-raid10';
}

// Published list prices in EUR/month, read from the store and the front page on
// 2026-08-28. Pulsed Media bills monthly, so `monthly` is the real number and
// `hourly` is derived only to satisfy the Quote shape.
//
// The two "Trophy" plans on the store page (Paimenpilli, Dragon-R Trophy MRR)
// are giveaway prizes, not orderable SKUs, so they are deliberately absent —
// quoting a price nobody can buy is worse than quoting nothing.
export const PLANS: readonly Plan[] = [
  // ── The Eternal Väinämöinen — storage boxes ──
  { sku: 'Eternal Väinämöinen Storage 1TB R5 10G', kind: 'block-storage', storage: 1000, monthly: 1.99, portGbps: 10, egressGiB: 250, cpu: 0.5, memory: 0.25, disk: 'hdd-raid5' },
  { sku: 'Eternal Väinämöinen Storage 2TB R5 10G', kind: 'block-storage', storage: 2000, monthly: 1.99, portGbps: 10, egressGiB: 250, cpu: 0.5, memory: 0.25, disk: 'hdd-raid5' },
  { sku: 'Eternal Väinämöinen Storage 2TB R5 1G', kind: 'block-storage', storage: 2000, monthly: 1.99, portGbps: 1, egressGiB: 250, cpu: 0.5, memory: 0.25, disk: 'hdd-raid5' },
  { sku: 'Eternal Väinämöinen Storage 4TB R5 10G', kind: 'block-storage', storage: 4000, monthly: 3.99, portGbps: 10, egressGiB: 250, cpu: 1, memory: 0.25, disk: 'hdd-raid5' },

  // ── The Eternal Väinämöinen — seedboxes / streambox ──
  { sku: 'Eternal Väinämöinen SSD Seedbox 250GiB 10G', kind: 'cpu-vps', storage: 250, monthly: 0.58, portGbps: 10, egressGiB: 3000, cpu: 2, memory: 2, disk: 'ssd-raid0' },
  { sku: 'Eternal Väinämöinen Seedbox 1TB R5 10G', kind: 'cpu-vps', storage: 1000, monthly: 1.99, portGbps: 10, egressGiB: 10000, cpu: 2, memory: 1, disk: 'hdd-raid5' },
  { sku: 'Eternal Väinämöinen SSD Seedbox 0.5TB 10G', kind: 'cpu-vps', storage: 455, monthly: 2.99, portGbps: 10, egressGiB: 10000, cpu: 4, memory: 2, disk: 'ssd-raid0' },
  { sku: 'Eternal Väinämöinen Streambox 1', kind: 'cpu-vps', storage: 125, monthly: 4.20, portGbps: 10, egressGiB: 3000, cpu: 4, memory: 3, disk: 'ssd-raid0' },
  { sku: 'Eternal Väinämöinen Seedbox 8TB R5 10G', kind: 'cpu-vps', storage: 8000, monthly: 9.99, portGbps: 10, egressGiB: 20000, cpu: 4, memory: 4, disk: 'hdd-raid5' },

  // ── Standing catalogue (front page). CPU/RAM are not published per plan
  // here, so they stay undefined rather than guessed — see pickPlan().
  { sku: 'M1000 SSD', kind: 'cpu-vps', storage: 230, monthly: 1.99, portGbps: 10, egressGiB: null, disk: 'ssd-raid0' },
  { sku: 'M10G SSD 320G', kind: 'cpu-vps', storage: 320, monthly: 6.49, portGbps: 10, egressGiB: 9700, disk: 'ssd-raid0' },
  { sku: 'M10G 10Gbps RAID5', kind: 'cpu-vps', storage: 2000, monthly: 8.99, portGbps: 10, egressGiB: null, disk: 'hdd-raid5' },
  { sku: 'Dragon-R 20Gbps RAID10', kind: 'cpu-vps', storage: 3000, monthly: 17.99, portGbps: 20, egressGiB: null, disk: 'ssd-raid10' },
  { sku: 'M10G Storage Box 4TB', kind: 'block-storage', storage: 4000, monthly: 8.99, portGbps: 10, egressGiB: null, disk: 'hdd-raid5' },
  { sku: 'M10G Storage Box 8TB', kind: 'block-storage', storage: 8000, monthly: 14.99, portGbps: 10, egressGiB: null, disk: 'hdd-raid5' },
  { sku: 'M10G Storage Box 32TB', kind: 'block-storage', storage: 32000, monthly: 63.99, portGbps: 10, egressGiB: null, disk: 'hdd-raid5' },
];

// ── Adapter ──────────────────────────────────────────────────────

export default defineCloud<Config>({
  id: 'cloud-pulsedmedia',
  label: 'Pulsed Media (seedbox, storage box, dedicated — adopt & verify; ordering is manual)',
  // Dedicated servers are sold but priced on request, so bare-metal is
  // supported for adoption while quote() will say it cannot price it.
  supports: ['cpu-vps', 'block-storage', 'bare-metal'],

  async connect(ctx, config) {
    requirePassword(ctx);
    const services = resolveServices(config);
    if (services.length === 0) {
      ctx.log('pulsedmedia connect · no services configured — set `services` (or host+username) in the provider config', 'warn');
      return { accountId: 'pulsedmedia' };
    }
    const first = services[0]!;
    await probe(ctx, first);
    ctx.log(`pulsedmedia connected · account=${first.username} · services=${services.length}`);
    return { accountId: first.username };
  },

  async quote(ctx, spec, _config) {
    if (spec.kind === 'bare-metal') {
      ctx.log('pulsedmedia quote · dedicated servers are priced on request — no public price list to quote from', 'warn');
      return zeroQuote('dedicated-on-request');
    }
    const match = pickPlan(spec);
    if (!match) {
      ctx.log(
        `pulsedmedia quote · no published plan satisfies kind=${spec.kind} cpu=${spec.cpu ?? '-'} ` +
        `memory=${spec.memory ?? '-'}GB storage=${spec.storage ?? '-'}GB`,
        'warn',
      );
      return zeroQuote('none');
    }
    ctx.log(`pulsedmedia quote · ${match.sku} · €${match.monthly.toFixed(2)}/mo (list price — billed monthly, not hourly)`);
    return {
      hourly: round4(match.monthly / HOURS_PER_MONTH),
      monthly: match.monthly,
      currency: 'EUR',
      provider: 'pulsedmedia',
      sku: match.sku,
      spot: false,
    } satisfies Quote;
  },

  // Adopt a service that is already paid for. Pulsed Media has no order API, so
  // "provision" cannot create anything — it takes a configured service, proves
  // the panel answers for those credentials, and returns it as an Instance.
  async provision(ctx, spec, config) {
    requirePassword(ctx);
    const services = resolveServices(config);
    const candidates = adoptable(services, spec);
    if (candidates.length === 0) {
      throw new Error(orderInstructions(spec, services.length));
    }
    if (candidates.length > 1) {
      throw new Error(
        `pulsedmedia provision: ${candidates.length} configured services match this spec ` +
        `(${candidates.map(s => serviceId(s)).join(', ')}). Refusing to guess — narrow the spec ` +
        `with kind/storage, or point the config at a single service.`,
      );
    }

    const target = candidates[0]!;
    ctx.log(`pulsedmedia provision · adopting ${serviceId(target)}${target.sku ? ` · ${target.sku}` : ''}`);
    if (ctx.dryRun) {
      ctx.log('pulsedmedia provision · dry run — panel not contacted');
      return toInstance(target, 'provisioning');
    }
    await probe(ctx, target);
    return toInstance(target, 'running');
  },

  async list(ctx, config) {
    requirePassword(ctx);
    const services = resolveServices(config);
    ctx.log(`pulsedmedia list · probing ${services.length} configured service(s)`);
    return Promise.all(services.map(async (s) => {
      try {
        await probe(ctx, s);
        return toInstance(s, 'running');
      } catch {
        // A service whose panel does not answer still exists and still bills.
        // Report it as failed rather than dropping it from the inventory.
        ctx.log(`pulsedmedia list · panel unreachable for ${serviceId(s)}`, 'warn');
        return toInstance(s, 'failed');
      }
    }));
  },

  // Cancelling is a WHMCS client-area action with no API behind it. Deleting
  // files over SFTP would leave the bill running while reporting success, so
  // this fails loudly instead.
  async destroy(ctx, instanceId, _config) {
    ctx.log(`pulsedmedia destroy · refusing · ${instanceId}`, 'error');
    throw new Error(
      `pulsedmedia cannot cancel ${instanceId} over the API — no cancel endpoint exists. ` +
      `A Pulsed Media service is a monthly WHMCS subscription: cancel it at ${CLIENT_AREA} ` +
      `(My Services → the service → Request Cancellation). Until you do, it keeps billing. ` +
      `Wiping the data is a separate step over SFTP/SSH and does not stop the invoice.`,
    );
  },

  async status(ctx, instanceId, config) {
    requirePassword(ctx);
    const services = resolveServices(config);
    const target = services.find(s => serviceId(s) === instanceId);
    if (!target) {
      throw new Error(
        `pulsedmedia status: ${instanceId} is not in the provider config. ` +
        `Known services: ${services.map(serviceId).join(', ') || '(none)'}`,
      );
    }
    try {
      await probe(ctx, target);
      return toInstance(target, 'running');
    } catch {
      return toInstance(target, 'failed');
    }
  },

  setup: tokenSetup<Config>({
    secretKey: 'PULSEDMEDIA_PASSWORD',
    label: 'Pulsed Media',
    vendorDocUrl: 'https://wiki.pulsedmedia.com/',
    steps: [
      `Order a seedbox or storage box at ${STORE_URL} — there is no order API`,
      `Open ${CLIENT_AREA} → My Services and pick the active service`,
      'Take the hostname and username from the welcome email (or the service page)',
      'The password is the seedbox password — the same one the PMSS panel and SFTP use',
      'Run: sh1pt secret set PULSEDMEDIA_PASSWORD <password>',
      'Then record the service so the adapter can see it: set host + username in the provider config',
      'Key-only SSH is fine for transfers, but the panel probe used here needs the password',
    ],
    fields: [
      { key: 'host', message: 'Service hostname (e.g. ha1.pulsedmedia.com):' },
      { key: 'username', message: 'Seedbox / storage username:' },
    ],
  }),
});

// ── Helpers ──────────────────────────────────────────────────────

function requirePassword(ctx: { secret(k: string): string | undefined }): void {
  if (!ctx.secret('PULSEDMEDIA_PASSWORD')) {
    throw new Error(
      'PULSEDMEDIA_PASSWORD not in vault — it is the seedbox password shown in the welcome email. ' +
      'Run `sh1pt secret set PULSEDMEDIA_PASSWORD <password>` (see `sh1pt setup cloud-pulsedmedia`).',
    );
  }
}

// The config carries the inventory, either as a list or as the host+username
// shorthand. Both forms collapse to the same array here so nothing downstream
// has to care which one was used.
export function resolveServices(config: Config): PulsedMediaService[] {
  const listed = config.services ?? [];
  const shorthand: PulsedMediaService[] =
    config.host && config.username ? [{ host: config.host, username: config.username }] : [];
  const all = [...listed, ...shorthand];
  const seen = new Set<string>();
  return all.filter((s) => {
    const id = serviceId(s);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function serviceId(s: PulsedMediaService): string {
  return `${s.username}@${s.host}`;
}

// PMSS serves each user their own panel under /user-<username>/. That path is
// the only account-scoped HTTP surface the provider offers, so it doubles as
// the reachability check.
export function panelUrl(s: PulsedMediaService): string {
  return `https://${s.host}/user-${s.username}/`;
}

async function probe(
  ctx: { secret(k: string): string | undefined; log(msg: string, level?: 'info' | 'warn' | 'error'): void },
  service: PulsedMediaService,
): Promise<void> {
  const password = ctx.secret('PULSEDMEDIA_PASSWORD')!;
  const auth = Buffer.from(`${service.username}:${password}`).toString('base64');
  const url = panelUrl(service);

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers: { Authorization: `Basic ${auth}` } });
  } catch (error) {
    throw new Error(`pulsedmedia: ${url} unreachable — ${(error as Error).message}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `pulsedmedia: ${serviceId(service)} rejected the stored password (${response.status}). ` +
      `Reset it in the panel or update PULSEDMEDIA_PASSWORD.`,
    );
  }
  if (!response.ok) {
    throw new Error(`pulsedmedia: ${url} returned ${response.status}`);
  }
  ctx.log(`pulsedmedia · panel ok · ${serviceId(service)}`);
}

// A configured service is adoptable when it does not contradict the spec.
// Anything the spec does not constrain is left alone — most users record a
// service without a sku, and refusing to adopt those would make the whole
// config useless.
export function adoptable(services: PulsedMediaService[], spec: InstanceSpec): PulsedMediaService[] {
  return services.filter((s) => {
    const plan = planFor(s);
    const kind = s.kind ?? plan?.kind;
    if (spec.kind && kind && kind !== spec.kind) return false;
    if (spec.storage && plan && plan.storage < spec.storage) return false;
    return true;
  });
}

export function planFor(s: PulsedMediaService): Plan | undefined {
  if (!s.sku) return undefined;
  const wanted = s.sku.toLowerCase();
  return PLANS.find(p => p.sku.toLowerCase() === wanted)
    ?? PLANS.find(p => p.sku.toLowerCase().includes(wanted));
}

// Cheapest published plan that satisfies the spec. A plan that does not publish
// cpu/memory is excluded whenever the spec constrains them — quoting a box that
// might be smaller than asked for is the worse failure.
export function pickPlan(spec: InstanceSpec): Plan | null {
  let candidates = PLANS.slice();
  if (spec.kind) candidates = candidates.filter(p => p.kind === spec.kind);
  if (spec.storage) candidates = candidates.filter(p => p.storage >= spec.storage!);
  if (spec.cpu) candidates = candidates.filter(p => p.cpu !== undefined && p.cpu >= spec.cpu!);
  if (spec.memory) candidates = candidates.filter(p => p.memory !== undefined && p.memory >= spec.memory!);
  if (spec.maxHourlyPrice) {
    candidates = candidates.filter(p => p.monthly / HOURS_PER_MONTH <= spec.maxHourlyPrice!);
  }
  candidates.sort((a, b) => a.monthly - b.monthly || a.storage - b.storage);
  return candidates[0] ?? null;
}

export function orderInstructions(spec: InstanceSpec, serviceCount: number): string {
  const plan = pickPlan(spec);
  const which = plan ? `${plan.sku} (€${plan.monthly.toFixed(2)}/mo)` : 'a plan matching your spec';
  const seen = serviceCount === 0
    ? 'no services are configured'
    : `${serviceCount} configured service(s) were checked and none match`;
  return (
    `pulsedmedia provision: ${seen}. Pulsed Media has no order API — services are bought through ` +
    `a WHMCS checkout, not provisioned. Order ${which} at ${STORE_URL}, wait for the welcome email, ` +
    `then add { host, username } to the provider config and re-run — provision will adopt it.`
  );
}

export function toInstance(s: PulsedMediaService, status: Instance['status']): Instance {
  const plan = planFor(s);
  const kind = s.kind ?? plan?.kind ?? 'cpu-vps';
  return {
    id: serviceId(s),
    kind,
    status,
    // Pulsed Media exposes no creation timestamp for a service, and inventing
    // one would be worse than reporting the epoch honestly.
    createdAt: new Date(0).toISOString(),
    hourlyRate: plan ? round4(plan.monthly / HOURS_PER_MONTH) : 0,
    currency: 'EUR',
    sku: plan?.sku ?? s.sku,
    metadata: {
      host: s.host,
      username: s.username,
      panel: panelUrl(s),
      ...(s.label ? { label: s.label } : {}),
      ...(plan ? { monthlyEur: plan.monthly, storageGb: plan.storage, portGbps: plan.portGbps, disk: plan.disk } : {}),
      ...(plan?.egressGiB !== undefined && plan?.egressGiB !== null ? { egressGiB: plan.egressGiB } : {}),
    },
  };
}

function zeroQuote(sku: string): Quote {
  return { hourly: 0, monthly: 0, currency: 'EUR', provider: 'pulsedmedia', sku, spot: false };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
