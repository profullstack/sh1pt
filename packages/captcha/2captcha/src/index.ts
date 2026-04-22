import { defineCaptcha, type CaptchaSolution } from '@profullstack/sh1pt-core';

// 2Captcha (2captcha.com) — human + AI-assisted CAPTCHA solving. ~$1
// per 1k image challenges, ~$2 per 1k reCAPTCHAs. Used ONLY as a last
// resort when a vendor has no API and we need to drive a browser.
// Respects robots.txt / ToS / rate limits is the adapter's problem.
interface Config {
  // key stored in sh1pt secrets vault — NOT in .env. Prompt on setup.
  //   sh1pt secret set TWOCAPTCHA_API_KEY
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const API = 'https://api.2captcha.com';

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
    // TODO: GET /res.php?action=getbalance&key=... → response balance
    ctx.log('2captcha connected');
    return { accountId: '2captcha' };
  },

  async solve(ctx, challenge) {
    const key = ctx.secret('TWOCAPTCHA_API_KEY');
    if (!key) throw new Error('TWOCAPTCHA_API_KEY not in vault');
    ctx.log(`2captcha solve · ${challenge.kind}`);
    // TODO:
    //  1. POST /in.php with { key, method, googlekey|sitekey, pageurl, … } → captchaId
    //  2. Poll /res.php?action=get&id=<captchaId> every pollIntervalMs until OK|<token>
    //  3. Return { token, kind, solvedInMs, cost }
    return { token: 'stub-token', kind: challenge.kind, solvedInMs: 0 } satisfies CaptchaSolution;
  },

  async balance() {
    // TODO: GET /res.php?action=getbalance&key=...
    return { amount: 0, currency: 'USD' };
  },
});
