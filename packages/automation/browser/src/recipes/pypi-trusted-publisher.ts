/**
 * PyPI: register a trusted publisher, so a GitHub workflow can publish
 * without a long-lived API token.
 *
 * Why a browser. PyPI's upload API publishes *packages*; it has no endpoint
 * for account settings, and a trusted publisher is an account setting. There
 * is no CLI either. The page is the only door.
 *
 * The valuable half is the "pending" publisher, which is what this recipe
 * creates. A pending publisher names a project that does not exist yet and
 * brings it into being on the first publish, so a brand-new package needs no
 * token at any point. That is the whole reason PyPI is worth automating: the
 * alternative is minting a token, pasting it into CI, and living with it.
 *
 * Selectors come from warehouse's own template rather than from guessing.
 * The pending GitHub form is `#pending-github-publisher-form` and its inputs
 * are named `project_name`, `owner`, `repository`, `workflow_filename` and
 * `environment`. Each is still looked up through a list of candidates,
 * because a form that has been renamed once will be renamed again.
 */
import { clickFirst, type Session } from '../session.js';
import { twoFactorCode } from '../totp.js';

const LOGIN_URL = 'https://pypi.org/account/login/';
const PUBLISHING_URL = 'https://pypi.org/manage/account/publishing/';

/** One GitHub publisher, as PyPI understands it. */
export interface GitHubPublisher {
  /** The PyPI project name. For a pending publisher it need not exist yet. */
  projectName: string;
  /** GitHub user or organisation that owns the repository. */
  owner: string;
  repository: string;
  /** Just the file name, e.g. `release.yml`, not a path. */
  workflowFilename: string;
  /**
   * GitHub Actions environment. Leave empty unless the workflow declares
   * one: PyPI matches this exactly, so a value here against a workflow with
   * no environment rejects every publish.
   */
  environment?: string;
}

export interface SignInOptions {
  username: string;
  password: string;
  /** base32 TOTP seed. Without it the run parks and asks for a code. */
  totpSecret?: string;
}

const field = (name: string) => [
  `#pending-github-publisher-form input[name="${name}"]`,
  `#pending-github-publisher-form [name="${name}"]`,
  `form:has(#pending-github-publisher-form) input[name="${name}"]`,
  `input[name="${name}"]`,
];

/** Whether this profile is already signed in. */
export async function isSignedIn(session: Session): Promise<boolean> {
  await session.page.goto(PUBLISHING_URL, { waitUntil: 'domcontentloaded' });
  return !session.page.url().includes('/account/login');
}

/**
 * Sign in, answering the two-factor challenge PyPI requires of any account
 * that can publish. TOTP is the only second factor handled here: a WebAuthn
 * key cannot be driven from a headless browser at all, and saying so is more
 * useful than a timeout.
 */
export async function signIn(session: Session, options: SignInOptions): Promise<void> {
  const { page } = session;
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  await page.fill('input[name="username"]', options.username);
  await page.fill('input[name="password"]', options.password);
  await clickFirst(page, ['input[type="submit"]', 'button[type="submit"]', 'button:has-text("Log in")']);
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/account/two-factor')) {
    const totpField = 'input[name="totp_value"]';
    const hasTotp = await page
      .locator(totpField)
      .first()
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasTotp) {
      const shot = await session.shot('pypi-two-factor');
      throw new Error(
        `PyPI asked for a second factor this recipe cannot supply, most likely a security key. ` +
          `Sign in once with --headed, or add a TOTP authenticator to the account. Screenshot: ${shot}`,
      );
    }
    const code = await twoFactorCode(options.totpSecret, () =>
      session.ask('pypi-totp', 'PyPI is asking for a 6-digit authenticator code.'),
    );
    await page.fill(totpField, code);
    await clickFirst(page, ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Verify")']);
    await page.waitForLoadState('domcontentloaded');
  }

  if (page.url().includes('/account/login')) {
    const shot = await session.shot('pypi-signin-failed');
    throw new Error(`PyPI did not accept that sign-in. Screenshot: ${shot}`);
  }
}

/**
 * The publishers already on the account, pending and active, as plain text
 * rows. Used to keep `addPending` idempotent; also worth printing on its own.
 */
export async function listPublishers(session: Session): Promise<string[]> {
  await session.page.goto(PUBLISHING_URL, { waitUntil: 'domcontentloaded' });
  const rows: string[] = await session.page
    .locator('main table tr, main .publisher, main li')
    .allTextContents()
    .catch(() => [] as string[]);
  return rows.map((row) => row.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Whether a publisher for this project and workflow is already registered. */
export function alreadyRegistered(rows: string[], publisher: GitHubPublisher): boolean {
  const needle = [publisher.owner, publisher.repository, publisher.workflowFilename].map((s) => s.toLowerCase());
  return rows.some((row) => {
    const text = row.toLowerCase();
    return text.includes(publisher.projectName.toLowerCase()) && needle.every((part) => text.includes(part));
  });
}

/**
 * Add a pending GitHub publisher. Returns false when an equivalent one was
 * already there, so running this twice is safe and a fleet script can call it
 * unconditionally.
 */
export async function addPending(session: Session, publisher: GitHubPublisher): Promise<boolean> {
  if (alreadyRegistered(await listPublishers(session), publisher)) return false;

  const { page } = session;
  await page.goto(PUBLISHING_URL, { waitUntil: 'domcontentloaded' });

  // The four providers are tabs over one page; GitHub is the default but not
  // reliably so, and clicking a tab that is already active is harmless.
  await clickFirst(page, [
    'button:has-text("GitHub")',
    '[role="tab"]:has-text("GitHub")',
    'a:has-text("GitHub")',
  ]).catch(() => undefined);

  const fill = async (name: string, value: string) => {
    for (const selector of field(name)) {
      const locator = page.locator(selector).first();
      // eslint-disable-next-line no-await-in-loop -- candidates are tried in order on purpose
      if (await locator.count().then((n: number) => n > 0).catch(() => false)) {
        await locator.fill(value);
        return;
      }
    }
    throw new Error(`Could not find the "${name}" field on PyPI's publishing page.`);
  };

  await fill('project_name', publisher.projectName);
  await fill('owner', publisher.owner);
  await fill('repository', publisher.repository);
  await fill('workflow_filename', publisher.workflowFilename);
  // Always written, including empty: PyPI matches the environment exactly, so
  // a stale value left in the field would silently break every publish.
  await fill('environment', publisher.environment ?? '');

  await clickFirst(page, [
    '#pending-github-publisher-form button[type="submit"]',
    '#pending-github-publisher-form input[type="submit"]',
    'form:has(#pending-github-publisher-form) button[type="submit"]',
    'button:has-text("Add")',
  ]);
  await page.waitForLoadState('domcontentloaded');

  if (!alreadyRegistered(await listPublishers(session), publisher)) {
    const shot = await session.shot('pypi-add-pending-failed');
    throw new Error(
      `PyPI accepted the form but the publisher is not listed. It usually says why on the page. Screenshot: ${shot}`,
    );
  }
  return true;
}
