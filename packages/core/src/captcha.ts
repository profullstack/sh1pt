import { autoSetup } from './setup-helpers.js';

// CAPTCHA-solver abstraction. Used by adapters that can't rely on a
// public API and have to drive a browser (Playwright / Puppeteer).
// Treat this as a last resort — most vendors prefer you email their
// API team for proper programmatic access before you scrape.

export type CaptchaKind =
  | 'recaptcha-v2'
  | 'recaptcha-v2-invisible'
  | 'recaptcha-v3'
  | 'hcaptcha'
  | 'turnstile'                  // Cloudflare
  | 'funcaptcha'                 // Arkose Labs
  | 'image-select'               // text-prompt image clicking
  | 'text-image';                // OCR on a distorted image

export interface CaptchaChallenge {
  kind: CaptchaKind;
  pageUrl: string;
  siteKey?: string;              // public key from the challenge embed
  action?: string;               // reCAPTCHA v3 action name
  imageUrl?: string;             // for image-select / text-image kinds
  instruction?: string;          // for image-select ("click all crosswalks")
}

export interface CaptchaSolution {
  token: string;                 // pass this back into the form/request
  kind: CaptchaKind;
  solvedInMs: number;
  cost?: number;                 // USD, if the provider charges per solve
}

export interface CaptchaSolver<Config = unknown> {
  id: string;                    // e.g. 'captcha-2captcha'
  label: string;
  supports: CaptchaKind[];
  connect(ctx: { secret(k: string): string | undefined; log(m: string): void }, config: Config): Promise<{ accountId: string; balanceUsd?: number }>;
  solve(ctx: { secret(k: string): string | undefined; log(m: string): void; signal?: AbortSignal }, challenge: CaptchaChallenge, config: Config): Promise<CaptchaSolution>;
  balance?(config: Config): Promise<{ amount: number; currency: string }>;
}

export function defineCaptcha<Config>(c: CaptchaSolver<Config>): CaptchaSolver<Config> {
  return autoSetup(c);
}

const captchaRegistry = new Map<string, CaptchaSolver<any>>();

export function registerCaptchaSolver(c: CaptchaSolver<any>): void {
  if (captchaRegistry.has(c.id)) throw new Error(`Captcha solver already registered: ${c.id}`);
  captchaRegistry.set(c.id, c);
}

export function getCaptchaSolver(id: string): CaptchaSolver<any> | undefined {
  return captchaRegistry.get(id);
}

export function listCaptchaSolvers(): CaptchaSolver<any>[] {
  return [...captchaRegistry.values()];
}
