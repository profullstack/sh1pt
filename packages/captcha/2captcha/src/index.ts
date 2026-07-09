import {
  defineCaptcha,
  tokenSetup,
  type CaptchaChallenge,
  type CaptchaSolution,
} from '@profullstack/sh1pt-core';

// 2Captcha (2captcha.com) — human + AI-assisted CAPTCHA solving. ~$1
// per 1k image challenges, ~$2 per 1k reCAPTCHAs. Used ONLY as a last
// resort when a vendor has no API and we need to drive a browser.
// Respects robots.txt / ToS / rate limits is the adapter's problem.
interface Config {
  // key stored in sh1pt secrets vault — NOT in .env. Prompt on setup.
  //   sh1pt secret set TWOCAPTCHA_API_KEY
  baseUrl?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  recaptchaV3MinScore?: number;
  languagePool?: 'en' | 'rn';
  softId?: number;
}

const API = 'https://api.2captcha.com';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export default defineCaptcha<Config>({
  id: 'captcha-2captcha',
  label: '2Captcha',
  supports: [
    'recaptcha-v2', 'recaptcha-v2-invisible', 'recaptcha-v3',
    'hcaptcha', 'turnstile', 'funcaptcha',
    'text-image',
  ],

  async connect(ctx, config) {
    const key = ctx.secret('TWOCAPTCHA_API_KEY');
    if (!key) throw new Error('TWOCAPTCHA_API_KEY not in vault — run `sh1pt secret set TWOCAPTCHA_API_KEY`');
    const balance = await post2Captcha<GetBalanceResponse>(config, '/getBalance', { clientKey: key });
    ctx.log(`2captcha connected · balance=$${balance.balance.toFixed(4)}`);
    return { accountId: '2captcha', balanceUsd: balance.balance };
  },

  async solve(ctx, challenge, config) {
    const key = ctx.secret('TWOCAPTCHA_API_KEY');
    if (!key) throw new Error('TWOCAPTCHA_API_KEY not in vault');
    ctx.log(`2captcha solve · ${challenge.kind}`);

    const task = await to2CaptchaTask(challenge, config);
    const created = await post2Captcha<CreateTaskResponse>(config, '/createTask', {
      clientKey: key,
      task,
      ...(config.languagePool ? { languagePool: config.languagePool } : {}),
      ...(config.softId !== undefined ? { softId: config.softId } : {}),
    });
    const startedAt = Date.now();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    while (Date.now() - startedAt <= timeoutMs) {
      if (ctx.signal?.aborted) throw new Error('2Captcha solve aborted');
      await sleep(pollIntervalMs);
      const result = await post2Captcha<TaskResultResponse>(config, '/getTaskResult', {
        clientKey: key,
        taskId: created.taskId,
      });
      if (result.status === 'processing') continue;
      if (result.status !== 'ready') throw new Error(`2Captcha returned unexpected status: ${String(result.status)}`);

      return {
        token: extractSolutionToken(result.solution),
        kind: challenge.kind,
        solvedInMs: solvedInMs(result, startedAt),
        cost: result.cost === undefined ? undefined : Number(result.cost),
      } satisfies CaptchaSolution;
    }

    throw new Error(`2Captcha solve timed out after ${timeoutMs}ms`);
  },

  setup: tokenSetup<Config>({
    secretKey: 'TWOCAPTCHA_API_KEY',
    label: '2Captcha',
    vendorDocUrl: 'https://2captcha.com/enterpage',
    steps: [
      'Open 2captcha.com → sign up / log in → top up balance',
      'Copy your API key from the dashboard',
      'Reminder: use as LAST RESORT — respect vendor ToS and rate-limit aggressively',
    ],
  }),
});

type JsonObject = Record<string, unknown>;

interface TwoCaptchaResponse {
  errorId: number;
  errorCode?: string;
  errorDescription?: string;
}

interface GetBalanceResponse extends TwoCaptchaResponse {
  balance: number;
}

interface CreateTaskResponse extends TwoCaptchaResponse {
  taskId: number;
}

interface TaskResultResponse extends TwoCaptchaResponse {
  status?: 'processing' | 'ready';
  solution?: JsonObject;
  cost?: string;
  createTime?: number;
  endTime?: number;
}

async function post2Captcha<T extends TwoCaptchaResponse>(
  config: Config,
  path: string,
  body: JsonObject,
): Promise<T> {
  const baseUrl = (config.baseUrl ?? API).replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`2Captcha HTTP ${res.status}: ${redact(text, body).slice(0, 200)}`);

  const data = JSON.parse(text) as T;
  if (data.errorId !== 0) {
    const code = data.errorCode ? ` ${data.errorCode}` : '';
    const description = data.errorDescription ? `: ${data.errorDescription}` : '';
    throw new Error(`2Captcha${code}${description}`);
  }
  return data;
}

function redact(text: string, requestBody: JsonObject): string {
  const clientKey = requestBody.clientKey;
  return typeof clientKey === 'string' && clientKey
    ? text.split(clientKey).join('[redacted]')
    : text;
}

async function to2CaptchaTask(challenge: CaptchaChallenge, config: Config): Promise<JsonObject> {
  switch (challenge.kind) {
    case 'recaptcha-v2':
    case 'recaptcha-v2-invisible':
      return {
        type: 'RecaptchaV2TaskProxyless',
        websiteURL: challenge.pageUrl,
        websiteKey: requireSiteKey(challenge),
        ...(challenge.kind === 'recaptcha-v2-invisible' ? { isInvisible: true } : {}),
      };
    case 'recaptcha-v3':
      return {
        type: 'RecaptchaV3TaskProxyless',
        websiteURL: challenge.pageUrl,
        websiteKey: requireSiteKey(challenge),
        pageAction: challenge.action ?? 'verify',
        minScore: config.recaptchaV3MinScore ?? 0.3,
      };
    case 'hcaptcha':
      return {
        type: 'HCaptchaTaskProxyless',
        websiteURL: challenge.pageUrl,
        websiteKey: requireSiteKey(challenge),
      };
    case 'turnstile':
      return {
        type: 'TurnstileTaskProxyless',
        websiteURL: challenge.pageUrl,
        websiteKey: requireSiteKey(challenge),
        ...(challenge.action ? { action: challenge.action } : {}),
      };
    case 'funcaptcha':
      return {
        type: 'FunCaptchaTaskProxyless',
        websiteURL: challenge.pageUrl,
        websitePublicKey: requireSiteKey(challenge),
      };
    case 'text-image':
      return {
        type: 'ImageToTextTask',
        body: await imageBody(challenge),
        ...(challenge.instruction ? { comment: challenge.instruction } : {}),
      };
    default:
      throw new Error(`2Captcha does not support ${challenge.kind}`);
  }
}

function requireSiteKey(challenge: CaptchaChallenge): string {
  if (!challenge.siteKey) throw new Error(`2Captcha ${challenge.kind} challenge requires siteKey`);
  return challenge.siteKey;
}

async function imageBody(challenge: CaptchaChallenge): Promise<string> {
  if (!challenge.imageUrl) throw new Error('2Captcha text-image challenge requires imageUrl');
  const dataUrl = challenge.imageUrl.match(/^data:[^,]+,(?<body>.+)$/);
  if (dataUrl?.groups?.body) return dataUrl.groups.body;

  const res = await fetch(challenge.imageUrl);
  if (!res.ok) throw new Error(`Could not fetch captcha image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}

function extractSolutionToken(solution: JsonObject | undefined): string {
  const token = solution?.gRecaptchaResponse ?? solution?.token ?? solution?.text;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('2Captcha ready response did not include a token');
  }
  return token;
}

function solvedInMs(result: TaskResultResponse, startedAt: number): number {
  if (typeof result.createTime === 'number' && typeof result.endTime === 'number') {
    return Math.max(0, (result.endTime - result.createTime) * 1000);
  }
  return Math.max(0, Date.now() - startedAt);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
