/**
 * Google Cloud: the OAuth consent screen chores that have no API.
 *
 * `gcloud` covers most of Google Cloud, but not this. Test users, publishing
 * status and the client's redirect URIs live only in the Auth Platform pages
 * of the console, and an app stuck in Testing with no test users answers
 * every sign-in with `Error 403: access_denied` — "has not completed the
 * Google verification process". That is what these recipes fix.
 *
 * Two ways out of that 403, and they are not equivalent:
 *
 *   addTestUsers  keeps the app in Testing. Fastest, but Google expires the
 *                 refresh token after **seven days**, so anything scheduled
 *                 breaks a week later.
 *   publishApp    moves it to In production. Sensitive scopes then show an
 *                 "unverified app" warning the user clicks through once, and
 *                 the refresh token stops expiring. For a personal app this
 *                 is usually what you actually want.
 *
 * The project may be named by id or number; the console accepts either in
 * `?project=`, and the number is the prefix of every client id it issues.
 */
import { anyVisible, clickFirst, type Session } from '../session.js';

export interface GoogleAuthTarget {
  /** Project id or project number. The number is the digits before the dash in a client id. */
  project: string;
}

export interface GoogleSignInOptions {
  email: string;
  password: string;
  /** Seconds to wait for a human to answer a 2FA challenge. */
  challengeTimeoutMs?: number;
}

const CONSOLE = 'https://console.cloud.google.com';

const audienceUrl = (project: string) => `${CONSOLE}/auth/audience?project=${encodeURIComponent(project)}`;
const clientsUrl = (project: string) => `${CONSOLE}/auth/clients?project=${encodeURIComponent(project)}`;

/**
 * True when the profile already carries a signed-in Google session.
 *
 * Test for the positive, never for the absence of a sign-in URL: a signed-out
 * browser asking for myaccount.google.com is bounced to
 * `www.google.com/account/about`, a marketing page that looks nothing like a
 * login. Checking "not on accounts.google.com" reports that as signed in, the
 * sign-in step is skipped, and the recipe fails much later on a page that
 * silently redirected to a login form.
 */
export async function isSignedIn(session: Session): Promise<boolean> {
  const { page } = session;
  await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return /^https:\/\/myaccount\.google\.com\//.test(page.url());
}

/**
 * Sign in, if the profile is not signed in already. Anything Google asks that
 * a script cannot answer (a code, a tap on a phone, a captcha) is handed to
 * the caller through `session.ask`, so the run parks rather than failing.
 */
export async function signIn(session: Session, options: GoogleSignInOptions): Promise<void> {
  const { page } = session;
  if (await isSignedIn(session)) return;

  await page.goto('https://accounts.google.com/signin/v2/identifier?hl=en', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  // The email box is `input[name="identifier"]`, typed `text`, not `email`.
  const email = page.locator('#identifierId, input[name="identifier"], input[type="email"]').first();
  await email.waitFor({ state: 'visible', timeout: 30_000 });
  await email.fill(options.email);
  await clickFirst(page, ['#identifierNext button', '#identifierNext', 'button:has-text("Next")']);

  // What comes after the email is not a fixed sequence. Google may offer a
  // passkey first, ask for the password, ask for a code, or offer to skip
  // something. So: loop, look at what is on screen, answer that, repeat.
  const deadline = Date.now() + (options.challengeTimeoutMs ?? 30 * 60_000);
  let passwordAttempts = 0;

  while (Date.now() < deadline) {
    await page.waitForLoadState('networkidle').catch(() => undefined);
    if (process.env.SH1PT_BROWSER_DEBUG) {
      const seen = ((await page.locator('body').innerText().catch(() => '')) as string)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(' | ');
      process.stderr.write(`[signin] ${page.url().slice(0, 100)}\n[signin]   ${seen}\n`);
    }
    if (!/accounts\.google\.com/.test(page.url())) return;

    const body = (await page.locator('body').innerText().catch(() => '')) as string;
    // Say "that password is wrong" rather than spinning. Google's current
    // flow rarely prints "Wrong password": it drops you back on the method
    // chooser, which looks exactly like ordinary progress and will loop
    // forever if you let it.
    const rejected =
      /Wrong password|password you entered/i.test(body) ||
      (passwordAttempts > 0 && /\/challenge\/selection/.test(page.url()));
    if (rejected) {
      throw new Error(
        `Google rejected the password for ${options.email} (it returned to the sign-in method chooser). ` +
          `Update the stored credential and run again. Screenshot: ${await session.shot('google-wrong-password')}`,
      );
    }

    // The identifier page ships a hidden `input[name="hiddenPassword"]`, so
    // never take "the first password input" — only a visible one counts.
    const password = page.locator('input[name="Passwd"]:visible, input[type="password"]:visible').first();
    if (await password.isVisible().catch(() => false)) {
      if (passwordAttempts >= 2) {
        throw new Error(
          `Google keeps asking for the password for ${options.email}; it is probably out of date. ` +
            `Screenshot: ${await session.shot('google-password-loop')}`,
        );
      }
      passwordAttempts += 1;
      await password.fill(options.password);
      // Submit with the keyboard. The Next button is a generated element that
      // moves between releases, and pressing Enter in the field is what the
      // form listens for anyway.
      await password.press('Enter');
      await page.waitForTimeout(3_000);
      continue;
    }

    // A passkey cannot be produced by a script. "Try another way" opens the
    // list of methods, where the password is one of the options.
    if (passwordAttempts < 2) {
      const other = await clickFirst(page, [
        'button:has-text("Enter your password")',
        'li:has-text("Enter your password")',
        'div[role="link"]:has-text("Enter your password")',
        'button:has-text("Try another way")',
        'text=Try another way',
      ], { timeoutMs: 4_000 }).catch(() => undefined);
      if (other) continue;
    }

    const codeBox = page.locator('input[type="tel"]:visible, input[name="totpPin"]:visible, input[aria-label*="code" i]:visible').first();
    if (await codeBox.isVisible().catch(() => false)) {
      const code = await session.ask('google-2fa', 'Google is asking for a verification code. Paste it.');
      await codeBox.fill(code);
      await clickFirst(page, ['button:has-text("Next")', 'button:has-text("Verify")', '#totpNext button']);
      continue;
    }

    // Offers that are safe to decline and would otherwise block the flow.
    const dismissed = await clickFirst(page, [
      'button:has-text("Not now")',
      'button:has-text("Skip")',
      'button:has-text("Cancel")',
    ], { timeoutMs: 3_000 }).catch(() => undefined);
    if (dismissed) continue;

    // A phone prompt or an unrecognised wall: show it and wait to be told to carry on.
    if (await anyVisible(page, ['text=Verify it', 'text=2-Step Verification', 'text=Check your'], 3_000)) {
      await session.ask('google-challenge', 'Approve the Google sign-in prompt on your phone, then write "ok" here.');
      continue;
    }

    await page.waitForTimeout(2_000);
  }
  throw new Error(`Still on ${page.url()} after the sign-in timeout. Screenshot: ${await session.shot('google-signin-stuck')}`);
}

export interface AudienceStatus {
  publishing: 'testing' | 'production' | 'unknown';
  testUsers: string[];
}

/** What the Audience page currently says: publishing status and the test-user list. */
export async function readAudience(session: Session, target: GoogleAuthTarget): Promise<AudienceStatus> {
  const { page } = session;
  await page.goto(audienceUrl(target.project), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const body = (await page.locator('body').innerText().catch(() => '')) as string;
  const publishing: AudienceStatus['publishing'] = /In production/i.test(body)
    ? 'production'
    : /Testing/i.test(body)
      ? 'testing'
      : 'unknown';

  // Test users render as plain rows of email text; scrape by shape, since the
  // table markup is generated and renamed often.
  const testUsers = [...new Set((body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []))];
  return { publishing, testUsers };
}

/**
 * Add test users to an app that is still in Testing. Returns the addresses
 * that were actually submitted (already-present ones are skipped).
 */
export async function addTestUsers(session: Session, target: GoogleAuthTarget, emails: string[]): Promise<string[]> {
  const { page } = session;
  const before = await readAudience(session, target);
  const missing = emails.filter((email) => !before.testUsers.includes(email));
  if (!missing.length) return [];

  await clickFirst(page, [
    'button:has-text("Add users")',
    'button:has-text("ADD USERS")',
    'button[aria-label*="Add users" i]',
    'a:has-text("Add users")',
  ]);

  const box = page.locator('textarea, input[type="text"]').last();
  await box.waitFor({ state: 'visible' });
  await box.fill(missing.join('\n'));

  await clickFirst(page, [
    'button:has-text("Save")',
    'button:has-text("SAVE")',
    'button:has-text("Add")',
  ]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await session.shot('google-test-users');
  return missing;
}

/**
 * Move the app from Testing to In production. Sensitive scopes stay
 * unverified (users click through a warning once) but refresh tokens stop
 * expiring after seven days.
 */
export async function publishApp(session: Session, target: GoogleAuthTarget): Promise<boolean> {
  const { page } = session;
  const before = await readAudience(session, target);
  if (before.publishing === 'production') return false;

  await clickFirst(page, [
    'button:has-text("Publish app")',
    'button:has-text("PUBLISH APP")',
    'button[aria-label*="Publish" i]',
  ]);
  await clickFirst(page, [
    'button:has-text("Confirm")',
    'button:has-text("CONFIRM")',
    'button:has-text("Publish")',
  ]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await session.shot('google-publish');
  return true;
}

/**
 * Add a redirect URI to an existing OAuth client. `clientId` may be the full
 * `…apps.googleusercontent.com` value or just the part before the dot.
 */
export async function addRedirectUri(
  session: Session,
  target: GoogleAuthTarget,
  clientId: string,
  redirectUri: string,
): Promise<boolean> {
  const { page } = session;
  await page.goto(clientsUrl(target.project), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const short = clientId.split('.')[0] ?? clientId;
  await clickFirst(page, [`a:has-text("${short}")`, `td:has-text("${short}")`, `text=${short}`]);
  await page.waitForLoadState('networkidle').catch(() => undefined);

  const body = (await page.locator('body').innerText().catch(() => '')) as string;
  if (body.includes(redirectUri)) return false;

  await clickFirst(page, [
    'button:has-text("Add URI")',
    'button:has-text("ADD URI")',
    'button:has-text("Add redirect URI")',
  ]);
  const box = page.locator('input[type="text"]:visible, input[type="url"]:visible').last();
  await box.fill(redirectUri);
  await clickFirst(page, ['button:has-text("Save")', 'button:has-text("SAVE")']);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await session.shot('google-redirect-uri');
  return true;
}
