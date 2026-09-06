/**
 * A browser that stays logged in between runs.
 *
 * Console chores (OAuth consent screens, app review settings, redirect URIs)
 * have no API, so the only way to script them is to drive the console. The
 * expensive part is not the clicking, it is the sign-in: providers challenge
 * a fresh browser with 2FA, device confirmation and "this browser may not be
 * secure". So the session is a **persistent profile** on disk. Sign in once,
 * answering whatever is asked, and every later run of every recipe reuses it
 * unattended.
 *
 * Playwright is an optional peer dependency: importing this module costs
 * nothing until you actually open a session.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where profiles and run artifacts live, unless overridden. */
export const DEFAULT_ROOT = join(homedir(), '.config', 'sh1pt', 'browser');

export interface SessionOptions {
  /** Profile name. The sign-in survives between runs under this name. */
  profile: string;
  /** Show a window. Needs a display; on a headless box leave it off. */
  headed?: boolean;
  /** Root directory for profiles and artifacts. */
  root?: string;
  /** Milliseconds between actions, for watching a run or calming a flaky console. */
  slowMo?: number;
  /** Use a named browser channel rather than Playwright's build. */
  channel?: 'chrome' | 'chromium' | 'msedge';
  /**
   * Browser binary to drive. Defaults to a system Chrome when one is found:
   * sign-in flows treat Playwright's headless shell with much more suspicion
   * than a real Chrome, and on a box whose distro is newer than the installed
   * Playwright, the bundled download may not exist at all.
   */
  executablePath?: string;
  /** Default timeout for every action, in ms. Consoles are slow; 45s is not paranoid. */
  timeoutMs?: number;
  locale?: string;
  timezoneId?: string;
  /** Override the user agent. Defaults to a desktop Chrome string in headless runs. */
  userAgent?: string;
  /**
   * Make WebAuthn decline instead of hanging. On by default: a headless
   * browser has no authenticator, so a passkey prompt never resolves and the
   * page freezes mid-sign-in. Turn it off only when testing passkeys.
   */
  stubWebAuthn?: boolean;
}

export interface Session {
  /** Playwright BrowserContext. Typed loosely so playwright stays optional. */
  context: any;
  /** The first page, ready to navigate. */
  page: any;
  /** Directory this run writes screenshots and prompts into. */
  artifacts: string;
  /** Save a PNG under the artifacts directory and return its path. */
  shot(name: string): Promise<string>;
  /**
   * Ask a human for a value the browser cannot supply (a 2FA code, a captcha
   * answer). Writes `<name>.txt` describing what is needed plus a screenshot,
   * then waits for `<name>.answer.txt` to appear. This is the same
   * file-handoff the myna logins use, and it is what makes an unattended box
   * workable: the run parks instead of failing.
   */
  ask(name: string, question: string, opts?: { timeoutMs?: number }): Promise<string>;
  close(): Promise<void>;
}

async function loadPlaywright(): Promise<any> {
  try {
    return await import('playwright');
  } catch {
    throw new Error(
      'sh1pt browser: playwright is not installed. Run `pnpm add -D playwright && pnpm exec playwright install chromium`.',
    );
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chromium flags that stop the obvious "you are a robot" tells. This is not
 * an arms race we win, and it is not meant to be: it is enough that a real
 * signed-in profile driving its owner's own console is not tripped up by
 * automation heuristics.
 */
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,OptimizationHints',
];

/** Where a real Chrome usually is, most preferred first. */
const CHROME_PATHS = [
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** The system Chrome to prefer over Playwright's own download, if there is one. */
export function findSystemChrome(): string | undefined {
  return CHROME_PATHS.find((path) => existsSync(path));
}

/**
 * A user agent that does not announce a robot.
 *
 * New headless Chrome still ships `HeadlessChrome/1.2.3` in its UA, and
 * "Chrome for Testing" builds say so too. Sign-in pages read that and hand
 * back a stripped-down flow that refuses to take a password at all. Take the
 * binary's real version and spell it the way a desktop Chrome would.
 */
export function desktopUserAgent(executablePath?: string): string {
  let version = '141.0.0.0';
  if (executablePath) {
    try {
      const raw = execFileSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
      const found = /(\d+\.\d+\.\d+\.\d+)/.exec(raw)?.[1];
      if (found) version = found;
    } catch {
      /* fall back to the default */
    }
  }
  return (
    `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${version} Safari/537.36`
  );
}

export async function openSession(options: SessionOptions): Promise<Session> {
  const root = options.root ?? DEFAULT_ROOT;
  const profileDir = join(root, 'profiles', options.profile);
  const artifacts = join(root, 'runs', `${options.profile}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(artifacts, { recursive: true });

  const { chromium } = await loadPlaywright();
  const executablePath = options.executablePath ?? (options.channel ? undefined : findSystemChrome());

  // Chrome's *new* headless mode is the same browser as headed, only without
  // a window; the old one is a separate binary that sign-in pages recognise
  // and refuse ("This browser or app may not be secure"). Playwright still
  // asks for the old mode when you pass `headless: true`, so ask for headed
  // and add the flag ourselves. No display is needed either way.
  const newHeadless = !options.headed;
  const args = [...STEALTH_ARGS, ...(newHeadless ? ['--headless=new'] : [])];

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: options.channel,
    executablePath,
    slowMo: options.slowMo,
    args,
    userAgent: options.userAgent ?? (newHeadless ? desktopUserAgent(executablePath) : undefined),
    locale: options.locale ?? 'en-US',
    timezoneId: options.timezoneId,
    viewport: { width: 1440, height: 900 },
  });
  context.setDefaultTimeout(options.timeoutMs ?? 45_000);

  // `navigator.webdriver` is the one signal that is both universally checked
  // and trivially removed. Do it before any page script runs.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Passkeys are the quiet killer of headless sign-ins. There is no
  // authenticator, so `navigator.credentials.get()` never settles: the page
  // sits on "Verifying it's you…" forever, and because its state machine is
  // still waiting, even the "Try another way" button does nothing when
  // clicked. Rejecting the way a real declined prompt does makes the site
  // fall through to its password fallback immediately.
  // Written against `globalThis` rather than `navigator`/`window` because
  // this package compiles without the DOM lib: the body is serialised and
  // runs in the page, not here.
  if (options.stubWebAuthn !== false) {
    await context.addInitScript(() => {
      const scope = globalThis as unknown as {
        navigator?: { credentials?: Record<string, unknown> };
        PublicKeyCredential?: Record<string, unknown>;
        DOMException?: new (message: string, name: string) => Error;
      };
      const credentials = scope.navigator?.credentials;
      if (!credentials) return;
      const decline = () =>
        Promise.reject(
          scope.DOMException
            ? new scope.DOMException('The operation was aborted.', 'NotAllowedError')
            : new Error('NotAllowedError'),
        );
      credentials.get = decline;
      credentials.create = decline;
      if (scope.PublicKeyCredential) {
        scope.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false);
      }
    });
  }

  const page = context.pages()[0] ?? (await context.newPage());

  // Chrome's own virtual authenticator, registered over DevTools. It holds no
  // credentials, so a passkey request fails at the browser layer the way an
  // empty security key would, rather than in page JavaScript a site can see
  // has been patched. Best effort: older builds may not have the domain.
  if (options.stubWebAuthn !== false) {
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: false, hasUserVerification: false, isUserVerified: false },
      });
    } catch {
      /* the init-script stub above still applies */
    }
  }

  const shot = async (name: string): Promise<string> => {
    const path = join(artifacts, `${name}.png`);
    await page.screenshot({ path, fullPage: true }).catch(() => undefined);
    return path;
  };

  const ask = async (name: string, question: string, opts: { timeoutMs?: number } = {}): Promise<string> => {
    const image = await shot(name);
    const askFile = join(artifacts, `${name}.txt`);
    const answerFile = join(artifacts, `${name}.answer.txt`);
    writeFileSync(askFile, `${question}\n\nScreenshot: ${image}\nAnswer by writing the value into: ${answerFile}\n`);
    process.stderr.write(`[browser] needs input: ${question}\n[browser] screenshot ${image}\n[browser] answer file ${answerFile}\n`);

    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    while (Date.now() < deadline) {
      if (existsSync(answerFile)) {
        const value = readFileSync(answerFile, 'utf8').trim();
        if (value) {
          unlinkSync(answerFile);
          return value;
        }
      }
      await sleep(2000);
    }
    throw new Error(`No answer for "${name}" arrived in time. Screenshot: ${image}`);
  };

  return {
    context,
    page,
    artifacts,
    shot,
    ask,
    close: () => context.close(),
  };
}

/**
 * Click the first thing that matches any of these, in order. Consoles rename
 * and re-nest their buttons constantly, so a recipe lists every wording it
 * has seen rather than pinning one selector and rotting.
 */
export async function clickFirst(page: any, candidates: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
  const timeout = opts.timeoutMs ?? 8_000;
  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
    } catch {
      continue; // not this wording
    }
    // Visible is not the same as clickable. Consoles overlay spinners and
    // animate panels in, so fall back to a forced click and finally to the
    // element's own handler rather than giving up on a button that is there.
    try {
      await locator.click({ timeout });
      return selector;
    } catch {
      /* covered or moving */
    }
    try {
      await locator.click({ timeout, force: true });
      return selector;
    } catch {
      /* still no */
    }
    try {
      await locator.evaluate((element: { click?: () => void }) => element.click?.());
      return selector;
    } catch {
      /* try the next wording */
    }
  }
  throw new Error(`None of these were clickable: ${candidates.join(' | ')}`);
}

/** True when any of the selectors is visible right now. */
export async function anyVisible(page: any, candidates: string[], timeoutMs = 5_000): Promise<boolean> {
  for (const selector of candidates) {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs });
      return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}
