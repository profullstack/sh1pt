import { defineTarget, manualSetup } from '@profullstack/sh1pt-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// WhatsApp Business Cloud API (Meta). The most regulated of any chat
// surface: outside the 24-hour customer-initiated window, only
// pre-approved Message Templates may be sent. Phone number must be
// verified and business account must pass Meta Business Verification.
interface Config {
  phoneNumberId: string;                 // Meta-assigned, not the +NNN number
  wabaId: string;                        // WhatsApp Business Account id
  webhookUrl: string;
  tokenKey?: string;                     // defaults to WHATSAPP_BUSINESS_TOKEN
  graphApiVersion?: string;              // defaults to v25.0
  graphApiBaseUrl?: string;              // defaults to https://graph.facebook.com
  subscribeApp?: boolean;                // defaults to true
  verifyTokenKey?: string;               // optional webhook verify_token secret
  // Templates to register with WhatsApp for outbound messages. Each
  // template goes through a separate Meta review (~24h, can reject).
  templates?: {
    name: string;
    language: string;                    // e.g. 'en_US'
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
    body: string;                        // with {{1}}, {{2}} placeholders
    examples?: string[];
    allowCategoryChange?: boolean;
  }[];
}

interface WhatsAppTemplateBody {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: {
    type: 'BODY';
    text: string;
    example?: { body_text: string[][] };
  }[];
  allow_category_change?: boolean;
}

interface GraphResponse {
  id?: string;
  success?: boolean;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface TemplateManifestEntry extends WhatsAppTemplateBody {
  placeholderIndexes: number[];
}

const TEMPLATE_NAME_RE = /^[a-z0-9_]+$/;
const LANGUAGE_RE = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const GRAPH_ID_RE = /^[A-Za-z0-9_-]+$/;
const GRAPH_API_VERSION_RE = /^v\d+(?:\.\d+)?$/;
const DEFAULT_GRAPH_API_VERSION = 'v25.0';
const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com';

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`chat-whatsapp requires ${field}`);
  return text;
}

function optionalText(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireText(value, field);
}

function requireGraphId(value: string | undefined, field: string): string {
  const id = requireText(value, field);
  if (!GRAPH_ID_RE.test(id)) {
    throw new Error(`chat-whatsapp ${field} must be a URL-safe Graph API id`);
  }
  return id;
}

function graphApiVersion(config: Config): string {
  const rawVersion = optionalText(config.graphApiVersion, 'graphApiVersion') ?? DEFAULT_GRAPH_API_VERSION;
  const version = rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`;
  if (!GRAPH_API_VERSION_RE.test(version)) {
    throw new Error('chat-whatsapp graphApiVersion must look like v25.0');
  }
  return version;
}

function graphApiBaseUrl(config: Config): string {
  const baseUrl = optionalText(config.graphApiBaseUrl, 'graphApiBaseUrl') ?? DEFAULT_GRAPH_API_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('chat-whatsapp graphApiBaseUrl must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('chat-whatsapp graphApiBaseUrl must use HTTPS');
  return baseUrl.replace(/\/+$/, '');
}

function graphUrl(config: Config, path: string): string {
  return `${graphApiBaseUrl(config)}/${graphApiVersion(config)}/${path}`;
}

function validateBaseConfig(config: Config): void {
  requireGraphId(config.phoneNumberId, 'phoneNumberId');
  requireGraphId(config.wabaId, 'wabaId');
  graphApiVersion(config);
  graphApiBaseUrl(config);
  const webhookUrl = requireText(config.webhookUrl, 'webhookUrl');
  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new Error('chat-whatsapp webhookUrl must be a valid HTTPS URL');
  }
  if (parsed.protocol !== 'https:') throw new Error('chat-whatsapp webhookUrl must use HTTPS');
}

function placeholderIndexes(body: string): number[] {
  return Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

function validateTemplate(template: NonNullable<Config['templates']>[number]): TemplateManifestEntry {
  const name = requireText(template.name, 'template.name');
  if (!TEMPLATE_NAME_RE.test(name)) {
    throw new Error(`chat-whatsapp template name "${name}" must contain only lowercase letters, numbers, and underscores`);
  }

  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(template.category)) {
    throw new Error(`chat-whatsapp template "${name}" has invalid category`);
  }

  const language = requireText(template.language, 'template.language');
  if (!LANGUAGE_RE.test(language)) {
    throw new Error(`chat-whatsapp template "${name}" has invalid language "${language}"`);
  }

  const body = requireText(template.body, `template ${name} body`);
  const indexes = placeholderIndexes(body);
  const expected = Array.from({ length: indexes.length }, (_, i) => i + 1);
  if (indexes.some((index, i) => index !== expected[i])) {
    throw new Error(`chat-whatsapp template "${name}" placeholders must be contiguous from {{1}}`);
  }

  if (template.examples && template.examples.length !== indexes.length) {
    throw new Error(`chat-whatsapp template "${name}" needs ${indexes.length} body examples`);
  }

  return {
    name,
    language,
    category: template.category,
    components: [{
      type: 'BODY',
      text: body,
      ...(template.examples?.length ? { example: { body_text: [template.examples] } } : {}),
    }],
    ...(template.allowCategoryChange ? { allow_category_change: true } : {}),
    placeholderIndexes: indexes,
  };
}

function templateManifest(config: Config, version: string) {
  validateBaseConfig(config);
  const phoneNumberId = requireGraphId(config.phoneNumberId, 'phoneNumberId');
  const wabaId = requireGraphId(config.wabaId, 'wabaId');
  const webhookUrl = requireText(config.webhookUrl, 'webhookUrl');
  const templates = (config.templates ?? []).map(validateTemplate);
  return {
    provider: 'chat-whatsapp',
    phoneNumberId,
    wabaId,
    webhookUrl,
    graphApiVersion: graphApiVersion(config),
    version,
    endpoints: {
      messages: graphUrl(config, `${phoneNumberId}/messages`),
      templates: graphUrl(config, `${wabaId}/message_templates`),
      subscribedApps: graphUrl(config, `${wabaId}/subscribed_apps`),
    },
    subscribeApp: config.subscribeApp ?? true,
    templates,
  };
}

function requireSecret(ctx: { secret(key: string): string | undefined }, key: string): string {
  const value = ctx.secret(key);
  if (!value) throw new Error(`${key} not in vault - run: sh1pt secret set ${key} <token>`);
  return value;
}

function templateRequest(template: TemplateManifestEntry): WhatsAppTemplateBody {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    components: template.components,
    ...(template.allow_category_change ? { allow_category_change: true } : {}),
  };
}

function redactSecret(message: string, secret: string): string {
  return secret ? message.split(secret).join('[redacted]') : message;
}

async function callGraph(url: string, token: string, body: object): Promise<GraphResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({})) as GraphResponse;
  if (!res.ok || data.error) {
    const detail = redactSecret(data.error?.message ?? `HTTP ${res.status}`, token);
    const code = data.error?.code ? ` code=${data.error.code}` : '';
    throw new Error(`WhatsApp Graph API request failed:${code} ${detail}`);
  }
  return data;
}

export default defineTarget<Config>({
  id: 'chat-whatsapp',
  kind: 'chat',
  label: 'WhatsApp Business Cloud API',
  async build(ctx, config) {
    const manifest = templateManifest(config, ctx.version);
    const artifact = join(ctx.outDir, 'whatsapp-templates.json');
    await mkdir(ctx.outDir, { recursive: true });
    await writeFile(artifact, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
    ctx.log(`whatsapp · wrote template manifest (${manifest.templates.length} templates)`);
    return {
      artifact,
      meta: {
        templates: manifest.templates.map((template) => template.name),
        endpoints: manifest.endpoints,
      },
    };
  },
  async ship(ctx, config) {
    const manifest = templateManifest(config, ctx.version);
    ctx.log(`whatsapp · submit ${manifest.templates.length} templates for review`);
    if (ctx.dryRun) {
      return {
        id: 'dry-run',
        meta: {
          templates: manifest.templates.map((template) => template.name),
          subscribeApp: manifest.subscribeApp,
          endpoints: manifest.endpoints,
        },
      };
    }

    if (typeof fetch !== 'function') throw new Error('global fetch is not available for WhatsApp Graph API calls');

    const tokenKey = optionalText(config.tokenKey, 'tokenKey') ?? 'WHATSAPP_BUSINESS_TOKEN';
    const token = requireSecret(ctx, tokenKey);
    const submittedTemplates = [];
    for (const template of manifest.templates) {
      const response = await callGraph(manifest.endpoints.templates, token, templateRequest(template));
      submittedTemplates.push({ name: template.name, id: response.id });
    }

    let subscription: GraphResponse | undefined;
    if (manifest.subscribeApp) {
      ctx.log('whatsapp · subscribe app to WABA webhooks');
      subscription = await callGraph(manifest.endpoints.subscribedApps, token, {
        override_callback_uri: manifest.webhookUrl,
        ...(config.verifyTokenKey ? { verify_token: requireSecret(ctx, requireText(config.verifyTokenKey, 'verifyTokenKey')) } : {}),
      });
    }

    return {
      id: `${manifest.phoneNumberId}@${ctx.version}`,
      url: `https://business.facebook.com/wa/manage/phone-numbers/?waba_id=${manifest.wabaId}`,
      meta: {
        templates: submittedTemplates,
        subscription: subscription ? { success: subscription.success ?? true } : undefined,
      },
    };
  },
  async status(id) {
    return { state: 'in-review', version: id, message: 'template approvals can take up to 24h; 24h session window applies for free-form outbound' };
  },

  setup: manualSetup({
    label: "WhatsApp Business Cloud API",
    vendorDocUrl: "https://developers.facebook.com/docs/whatsapp",
    steps: [
      "Register a Meta Business account + request Cloud API access",
      "Complete business verification (2-7 days, requires business docs)",
      "Run: sh1pt secret set WHATSAPP_BUSINESS_TOKEN <token>",
    ],
  }),
});
