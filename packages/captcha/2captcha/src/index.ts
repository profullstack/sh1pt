import { defineCaptcha, tokenSetup, type CaptchaChallenge, type CaptchaSolution } from '@profullstack/sh1pt-core';

// 2Captcha (2captcha.com) — human + AI-assisted CAPTCHA solving. ~$1
// per 1k image challenges, ~$2 per 1k reCAPTCHAs. Used ONLY as a last
// resort when a vendor has no API and we need to drive a browser.
// Respects robots.txt / ToS / rate limits is the adapter's problem.
interface Config {
  // key stored in sh1pt secrets vault — NOT in .env. Prompt on setup.
  //   sh1pt secret set TWOCAPTCHA_API_KEY
  apiKey?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const API = 'https://api.2captcha.com';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 120_000;

export default defineCaptcha<Config>({
  id: 'captcha-twocaptcha',
  label: '2Captcha',
  supports: [
    'recaptcha-v2', 'recaptcha-v2-invisible', 'recaptcha-v3',
    'hcaptcha', 'turnstile', 'funcaptcha',
    'image-select', 'text-image',
  ],

  async connect(ctx) {
    const key = ctx.secret('TWOCAPTCHA_API_KEY');
    if (!key) throw new Error('TWOCAPTCHA_API_KEY not in vault — run `sh1pt secret set TWOCAPTCHA_API_KEY`');
    ctx.log('2captcha connected');
    const balance = await getBalance(key);
    return { accountId: '2captcha', balanceUsd: balance };
  },

  async solve(ctx, challenge, config) {
    const key = ctx.secret('TWOCAPTCHA_API_KEY');
    if (!key) throw new Error('TWOCAPTCHA_API_KEY not in vault');
    ctx.log(`2captcha solve · ${challenge.kind}`);
    const startedAt = Date.now();
    const captchaId = await createTask(key, challenge);
    const token = await pollResult(key, captchaId, configWithDefaults(config), ctx.signal);
    return { token, kind: challenge.kind, solvedInMs: Date.now() - startedAt } satisfies CaptchaSolution;
  },

  async balance(config) {
    if (!config.apiKey) throw new Error('captcha-twocaptcha balance requires config.apiKey');
    return { amount: await getBalance(config.apiKey), currency: 'USD' };
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

type TwoCaptchaParams = Record<string, string | number>;

interface RuntimeConfig extends Config {
  pollIntervalMs: number;
  timeoutMs: number;
}

async function createTask(key: string, challenge: CaptchaChallenge): Promise<string> {
  const params = new URLSearchParams({
    key,
    json: '1',
    ...taskParams(challenge),
  });
  const res = await fetch(`${API}/in.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await readTwoCaptchaResponse(res);
  if (data.status !== 1 || !data.request) {
    throw new Error(`2Captcha task creation failed: ${data.request ?? res.statusText}`);
  }
  return String(data.request);
}

async function pollResult(key: string, captchaId: string, config: RuntimeConfig, signal: AbortSignal | undefined): Promise<string> {
  const deadline = Date.now() + config.timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('2Captcha solve aborted');
    await sleep(config.pollIntervalMs);
    const url = `${API}/res.php?${new URLSearchParams({
      key,
      action: 'get',
      id: captchaId,
      json: '1',
    })}`;
    const res = await fetch(url);
    const data = await readTwoCaptchaResponse(res);
    if (data.status === 1 && data.request) return String(data.request);
    if (data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha solve failed: ${data.request ?? res.statusText}`);
    }
  }
  throw new Error(`2Captcha solve timed out after ${config.timeoutMs}ms`);
}

async function getBalance(key: string): Promise<number> {
  const url = `${API}/res.php?${new URLSearchParams({
    key,
    action: 'getbalance',
    json: '1',
  })}`;
  const res = await fetch(url);
  const data = await readTwoCaptchaResponse(res);
  if (data.status !== 1 || data.request === undefined) {
    throw new Error(`2Captcha balance failed: ${data.request ?? res.statusText}`);
  }
  return Number(data.request);
}

function taskParams(challenge: CaptchaChallenge): TwoCaptchaParams {
  switch (challenge.kind) {
    case 'recaptcha-v2':
    case 'recaptcha-v2-invisible':
      return siteKeyParams('userrecaptcha', challenge, {
        ...(challenge.kind === 'recaptcha-v2-invisible' ? { invisible: 1 } : {}),
      });
    case 'recaptcha-v3':
      return siteKeyParams('userrecaptcha', challenge, {
        version: 'v3',
        ...(challenge.action ? { action: challenge.action } : {}),
      });
    case 'hcaptcha':
      return siteKeyParams('hcaptcha', challenge);
    case 'turnstile':
      return siteKeyParams('turnstile', challenge);
    case 'funcaptcha':
      return siteKeyParams('funcaptcha', challenge);
    case 'text-image':
    case 'image-select':
      if (!challenge.imageUrl) throw new Error(`${challenge.kind} requires challenge.imageUrl`);
      return {
        method: 'base64',
        body: challenge.imageUrl,
        ...(challenge.instruction ? { textinstructions: challenge.instruction } : {}),
      };
  }
}

function siteKeyParams(method: string, challenge: CaptchaChallenge, extra: TwoCaptchaParams = {}): TwoCaptchaParams {
  if (!challenge.siteKey) throw new Error(`${challenge.kind} requires challenge.siteKey`);
  return {
    method,
    googlekey: challenge.siteKey,
    pageurl: challenge.pageUrl,
    ...extra,
  };
}

function configWithDefaults(config: Config): RuntimeConfig {
  return {
    ...config,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

async function readTwoCaptchaResponse(res: Response): Promise<{ status?: number; request?: string | number }> {
  const data = await res.json().catch(() => undefined) as { status?: number; request?: string | number } | undefined;
  if (!data) throw new Error(`2Captcha API returned non-JSON response (${res.status})`);
  if (!res.ok) throw new Error(`2Captcha API request failed (${res.status}): ${data.request ?? res.statusText}`);
  return data;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
