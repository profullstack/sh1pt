/**
 * Meta: signing in, and the app settings that have no API until the app says so.
 *
 * Meta *does* have an app-settings API, but it answers
 * `(#10) Changing app settings through API calls has been disabled for this
 * app` until someone ticks **Allow API Access to App Settings** under the
 * app's Advanced settings. That tick is itself console-only, so a browser is
 * the way in, and afterwards a rename needs no browser at all.
 *
 * Two things make the sign-in work where a naive script stalls:
 *
 *   - Facebook's Arkose "Running security checks" page clears itself, but the
 *     login form's submit button selectors miss, so press Enter in the
 *     password field instead of hunting for a button.
 *   - The default second factor is WhatsApp. `Try another way` offers email,
 *     which lands somewhere a mailbox-reading agent can fetch it from, so the
 *     run never needs a phone. Buttons on those pages are `div[role=button]`.
 */
import { clickFirst, type Session } from '../session.js';

export interface MetaSignInOptions {
  email: string;
  password: string;
  /** Prefer the emailed code over the default WhatsApp one. Default true. */
  preferEmail?: boolean;
  challengeTimeoutMs?: number;
}

const DEVELOPERS = 'https://developers.facebook.com';

const bodyLines = async (session: Session): Promise<string[]> =>
  ((await session.page.locator('body').innerText().catch(() => '')) as string)
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean);

/**
 * True when the profile already carries a signed-in Facebook session.
 *
 * Test for the positive. A signed-out browser asking for `/me` is bounced to
 * `facebook.com/` — a URL with no "login" in it — so "not on a login page"
 * reports a fresh profile as signed in, the sign-in is skipped, and every
 * later step quietly runs as nobody. Require landing on a profile path with
 * no login form on it.
 */
export async function isSignedIn(session: Session): Promise<boolean> {
  const { page } = session;
  await page.goto('https://www.facebook.com/me', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (/login|checkpoint|two_step|recover/.test(page.url())) return false;
  if (await page.locator('#email, input[name="email"]').first().isVisible().catch(() => false)) return false;
  return /^https:\/\/(www\.)?facebook\.com\/[^/?#]+/.test(page.url());
}

export async function signIn(session: Session, options: MetaSignInOptions): Promise<void> {
  const { page } = session;
  if (await isSignedIn(session)) return;

  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const emailBox = page.locator('#email, input[name="email"]').first();
  if (await emailBox.isVisible().catch(() => false)) {
    await emailBox.fill(options.email);
    const password = page.locator('#pass, input[name="pass"]').first();
    await password.fill(options.password);
    // The button selectors miss more often than they hit; Enter always submits.
    await clickFirst(page, ['button[name="login"]', '#loginbutton', 'button[type="submit"]'], { timeoutMs: 4000 })
      .catch(() => password.press('Enter'));
  }

  // Ride the Arkose security check through to whatever it asks next.
  for (let i = 0; i < 10; i += 1) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(4000);
    if (process.env.SH1PT_BROWSER_DEBUG) process.stderr.write(`[meta] check ${i}: ${page.url().slice(0, 90)}\n`);
    if (/codesubmit|two_step|checkpoint/.test(page.url())) break;
  }

  if (options.preferEmail !== false) {
    await clickFirst(page, [
      'div[role="button"]:has-text("Try another way")',
      'button:has-text("Try another way")',
      'text=Try another way',
    ], { timeoutMs: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(4000);
    await clickFirst(page, ['div[role="button"]:has-text("Email")', 'label:has-text("Email")'], { timeoutMs: 8000 })
      .catch(() => undefined);
    await clickFirst(page, ['div[role="button"]:has-text("Continue")', 'button:has-text("Continue")'], { timeoutMs: 8000 })
      .catch(() => undefined);
    await page.waitForTimeout(6000);
  }

  const deadline = Date.now() + (options.challengeTimeoutMs ?? 55 * 60_000);
  while (Date.now() < deadline) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const url = page.url();
    // Without this a stuck run is completely silent for the whole timeout,
    // and every wall Meta puts up looks identical from the outside.
    if (process.env.SH1PT_BROWSER_DEBUG) {
      process.stderr.write(`[meta] ${url.slice(0, 100)}\n[meta]   ${(await bodyLines(session)).slice(0, 6).join(' | ').slice(0, 220)}\n`);
    }
    if (/facebook\.com\/?$/.test(url) && !/login|checkpoint|codesubmit|two_step/.test(url)) return;

    const codeBox = page
      .locator('input[name="code"]:visible, input[autocomplete="one-time-code"]:visible, input[type="text"]:visible')
      .first();
    if (await codeBox.isVisible().catch(() => false)) {
      const code = await session.ask(
        'meta-code',
        `Facebook sent a login code${options.preferEmail === false ? '' : ` to ${options.email}`}. Paste the digits.`,
      );
      await codeBox.fill(code.trim());
      await clickFirst(page, [
        'div[role="button"]:has-text("Continue")',
        'button:has-text("Continue")',
        'button[type="submit"]',
      ], { timeoutMs: 8000 }).catch(() => codeBox.press('Enter'));
      await page.waitForTimeout(8000);
      // Trusting the device keeps the profile signed in for later runs.
      await clickFirst(page, ['div[role="button"]:has-text("Trust")', 'button:has-text("Trust")'], { timeoutMs: 6000 })
        .catch(() => undefined);
      continue;
    }
    await page.waitForTimeout(4000);
  }
  throw new Error(`Still on ${page.url()} after the sign-in timeout. Screenshot: ${await session.shot('meta-signin-stuck')}`);
}

/**
 * True when this account can actually administer the app. Meta answers a
 * stranger by redirecting every `/apps/<id>/…` URL to the developer home
 * page, so a recipe that assumes it landed will edit nothing and report
 * success.
 */
export async function canAdminister(session: Session, app: string): Promise<boolean> {
  const { page } = session;
  await page.goto(`${DEVELOPERS}/apps/${app}/settings/basic/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(5000);
  return page.url().includes(`/apps/${app}`);
}

/** Add a redirect URI to the app's Facebook Login settings. */
export async function addRedirectUri(session: Session, app: string, uri: string): Promise<boolean> {
  const { page } = session;
  if (!(await canAdminister(session, app))) {
    throw new Error(
      `This Facebook account cannot administer app ${app} — Meta redirected to ${page.url()}. ` +
        'Sign in as an account that owns the app.',
    );
  }

  await page.goto(`${DEVELOPERS}/apps/${app}/fb-login/settings/`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(5000);

  const box = page.locator('input[placeholder*="http" i]:visible, textarea:visible, input[type="text"]:visible').first();
  if (!(await box.isVisible().catch(() => false))) {
    throw new Error(`No redirect field on ${page.url()}. Is Facebook Login added as a product?`);
  }

  const existing = ((await box.inputValue().catch(() => '')) as string) || '';
  if (existing.includes(uri)) return false;

  await box.fill(existing ? `${existing}\n${uri}` : uri);
  await clickFirst(page, [
    'div[role="button"]:has-text("Save changes")',
    'button:has-text("Save changes")',
    'button:has-text("Save")',
  ], { timeoutMs: 10_000 });
  await page.waitForTimeout(6000);
  await session.shot('meta-redirect-uri');
  return true;
}

/** What the app's pages say right now, for debugging a refusal. */
export async function status(session: Session, app: string): Promise<{ administers: boolean; page: string[] }> {
  const administers = await canAdminister(session, app);
  return { administers, page: (await bodyLines(session)).slice(0, 12) };
}
