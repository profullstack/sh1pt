import { defineCaptcha, tokenSetup, type CaptchaSolution } from '@profullstack/sh1pt-core';

// CaptchaSolver (captchasolver.com) — alternative to 2Captcha, 2Captcha-
// compatible API, often cheaper for Turnstile and hCaptcha. Same
// caveats: last resort, respect ToS, rate-limit aggressively.
interface Config {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const API = 'https://api.captchasolver.com';

export default defineCaptcha<Config>({
  id: 'captcha-solver',
  label: 'CaptchaSolver',
  supports: [
    'recaptcha-v2', 'recaptcha-v2-invisible', 'recaptcha-v3',
    'hcaptcha', 'turnstile', 'funcaptcha',
    'image-select', 'text-image',
  ],

  async connect(ctx) {
    if (!ctx.secret('CAPTCHASOLVER_API_KEY')) {
      throw new Error('CAPTCHASOLVER_API_KEY not in vault — run `sh1pt secret set CAPTCHASOLVER_API_KEY`');
    }
    ctx.log('captchasolver connected');
    return { accountId: 'captchasolver' };
  },

  async solve(ctx, challenge) {
    if (!ctx.secret('CAPTCHASOLVER_API_KEY')) throw new Error('CAPTCHASOLVER_API_KEY not in vault');
    ctx.log(`captchasolver solve · ${challenge.kind}`);
    // TODO: 2Captcha-compatible API — createTask → getTaskResult polling
    return { token: 'stub-token', kind: challenge.kind, solvedInMs: 0 } satisfies CaptchaSolution;
  },

  setup: tokenSetup<Config>({
    secretKey: 'CAPTCHASOLVER_API_KEY',
    label: 'CaptchaSolver',
    vendorDocUrl: 'https://captchasolver.com/profile',
    steps: [
      'Open captchasolver.com → sign up / log in → top up balance',
      'Copy your API key from profile settings',
      'Reminder: use as LAST RESORT — respect vendor ToS and rate-limit aggressively',
    ],
  }),
});
