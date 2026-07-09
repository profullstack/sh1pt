import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Ship target for the Agent Name Service (ANS, https://github.com/agentnameservice).
 *
 * ANS is "DNS for AI agents": it resolves an agent *name* to a verifiable,
 * versioned identity (`ans://v1.0.0.my-agent.example.com`), anchored to domain
 * ownership (DNS/ACME) and backed by a private CA + an append-only transparency
 * log (SCITT/COSE receipts, RFC 9162/6962).
 *
 * Shipping to ANS = registering the built agent under a name you control and
 * proving domain ownership. The sh1pt angle: sh1pt already owns DNS provider
 * adapters (porkbun, cloudflare), so the `verify-dns` challenge can be applied
 * automatically instead of by hand. This adapter computes the challenge TXT
 * record and surfaces it in its result so the ship pipeline / a DNS adapter can
 * upsert it.
 *
 * Scaffold scope (M1): build the registration manifest + compute the `ans://`
 * name and challenge record; dry-run ship returns the full plan with no
 * secrets/network; real ship registers with the ANS registry and emits the TXT
 * record to apply. Completing domain verification and polling the transparency
 * log for the inclusion receipt is the next milestone (see TODOs below).
 */
export interface Config {
  /** Bare agent name, e.g. "my-agent". Combined with version + domain into the ans:// name. */
  agentName: string;
  /** Domain you control and will prove ownership of, e.g. "example.com". */
  domain: string;
  /** Public endpoint the resolved identity should advertise. */
  endpoint?: string;
  /** Declared agent capabilities (free-form tags). */
  capabilities?: string[];
  /** ANS registry base URL. Defaults to the public registry. */
  registryUrl?: string;
  /** Domain-ownership proof method. ANS supports DNS-01 and ACME. */
  verify?: 'dns' | 'acme';
  /**
   * DNS provider used to automate the verify-dns challenge. References a sh1pt
   * DNS adapter id (e.g. "dns-cloudflare", "dns-porkbun") + the zone to write
   * the TXT record into. When omitted, the challenge record is returned for
   * manual installation.
   */
  dns?: { provider: string; zoneId?: string };
}

const DEFAULT_REGISTRY = 'https://registry.ans.dev';
const TOKEN_SECRET = 'ANS_API_TOKEN';

interface AnsManifest {
  provider: 'registry-ans';
  ansName: string;
  agentName: string;
  version: string;
  domain: string;
  endpoint?: string;
  capabilities: string[];
  verify: 'dns' | 'acme';
  challenge: DnsChallenge;
}

interface DnsChallenge {
  type: 'TXT';
  /** Record name where the challenge value goes once issued by the registry. */
  name: string;
  /** Issued by the registry at registration time; null until then. */
  value: string | null;
}

function requireConfig(config: Config): { agentName: string; domain: string } {
  const agentName = config.agentName?.trim();
  const domain = config.domain?.trim();
  if (!agentName) throw new Error('registry-ans requires agentName');
  if (!domain) throw new Error('registry-ans requires domain');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(agentName)) {
    throw new Error(`registry-ans invalid agentName: ${agentName}`);
  }
  return { agentName, domain };
}

/** ans://v<version>.<agentName>.<domain> */
function ansName(config: Config, version: string): string {
  const { agentName, domain } = requireConfig(config);
  return `ans://v${version}.${agentName}.${domain}`;
}

function challengeRecord(config: Config, value: string | null = null): DnsChallenge {
  const { agentName, domain } = requireConfig(config);
  return { type: 'TXT', name: `_ans-challenge.${agentName}.${domain}`, value };
}

function manifestFor(config: Config, version: string): AnsManifest {
  const { agentName, domain } = requireConfig(config);
  return {
    provider: 'registry-ans',
    ansName: ansName(config, version),
    agentName,
    version,
    domain,
    endpoint: config.endpoint,
    capabilities: config.capabilities ?? [],
    verify: config.verify ?? 'dns',
    challenge: challengeRecord(config),
  };
}

export default defineTarget<Config>({
  id: 'registry-ans',
  kind: 'package-manager',
  label: 'Agent Name Service (ANS) — verifiable agent name registry',

  validate(config) {
    requireConfig(config as Config);
    return config as Config;
  },

  async build(ctx, config) {
    const manifest = manifestFor(config, ctx.version);
    const artifact = join(ctx.outDir, 'ans-manifest.json');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    ctx.log(`wrote ANS registration manifest for ${manifest.ansName}`);
    return { artifact, meta: { ansName: manifest.ansName, challenge: manifest.challenge } };
  },

  async ship(ctx, config) {
    const name = ansName(config, ctx.version);
    const verify = config.verify ?? 'dns';
    const challenge = challengeRecord(config);

    // Dry-run: surface the full plan without secrets or network calls.
    if (ctx.dryRun) {
      ctx.log(`ans dry-run · would register ${name} (verify=${verify})`);
      return {
        id: name,
        meta: { ansName: name, verify, challenge, dns: config.dns ?? null, dryRun: true },
      };
    }

    const token = ctx.secret(TOKEN_SECRET);
    if (!token) {
      throw new Error(`${TOKEN_SECRET} not in vault — \`sh1pt secret set ${TOKEN_SECRET} <token>\``);
    }

    const { agentName, domain } = requireConfig(config);
    const registryUrl = (config.registryUrl ?? DEFAULT_REGISTRY).replace(/\/+$/, '');

    // 1. Register the agent + open a domain-ownership challenge.
    ctx.log(`ans · registering ${name} with ${registryUrl}`);
    const registration = await ansRequest<{ challengeToken: string; recordName?: string }>(
      `${registryUrl}/v1/register`,
      token,
      { agentName, version: ctx.version, domain, endpoint: config.endpoint, capabilities: config.capabilities ?? [], verify },
    );

    const issued: DnsChallenge = {
      type: 'TXT',
      name: registration.recordName ?? challenge.name,
      value: registration.challengeToken,
    };
    ctx.log(`ans · install TXT ${issued.name} = ${issued.value}`);

    // 2. TODO(M2): if config.dns is set, apply `issued` via the named sh1pt DNS
    //    provider, then POST /v1/verify and poll the transparency log for the
    //    SCITT inclusion receipt before reporting 'live'. Until then we hand the
    //    challenge record back so the ship pipeline / operator can apply it.
    return {
      id: name,
      url: `${registryUrl}/${encodeURIComponent(name)}`,
      meta: { ansName: name, verify, challenge: issued, dns: config.dns ?? null, status: 'pending-verification' },
    };
  },

  async status(shipId) {
    // TODO(M2): resolve the name against the registry + verify the transparency
    // log receipt. The scaffold reports in-review until verification lands.
    return { state: 'in-review', version: shipId, message: 'pending ANS domain verification' };
  },

  setup: manualSetup({
    label: 'Agent Name Service (ANS)',
    vendorDocUrl: 'https://github.com/agentnameservice/ans',
    steps: [
      'Pick an agentName and a domain you control (e.g. my-agent + example.com)',
      'Create an ANS registry token and run: sh1pt secret set ANS_API_TOKEN <token>',
      'Configure a sh1pt DNS adapter (dns-cloudflare / dns-porkbun) to auto-apply the verify-dns TXT challenge',
      'Optional: set registryUrl to point at a self-hosted ANS registry',
    ],
  }),
});

async function ansRequest<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ANS ${url} failed: ${response.status} ${text || response.statusText}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
