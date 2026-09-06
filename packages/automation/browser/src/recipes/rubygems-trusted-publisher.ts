/**
 * RubyGems: register a trusted publisher, so a GitHub workflow can push a
 * gem without a long-lived API key.
 *
 * Why a browser. RubyGems has an API for gems and for owners, but trusted
 * publishers live under the profile and have no endpoint. `gem` itself has no
 * command for them either.
 *
 * As on PyPI, the useful form is the *pending* publisher: it names a gem that
 * does not exist yet, and on the first successful push it becomes a normal
 * publisher and makes you the gem's owner. So a new gem is published with no
 * key at any point.
 *
 * The form is Rails `form_with(model: pending_trusted_publisher)` wrapping a
 * nested publisher, which means the real input names are long and prefixed
 * (`oidc_pending_trusted_publisher[...][repository_owner]`). Fields are
 * therefore matched on the suffix, which survives the wrapper being renamed
 * and does not depend on how the nesting is spelled today.
 */
import { clickFirst, type Session } from '../session.js';
import { twoFactorCode } from '../totp.js';

const SIGN_IN_URL = 'https://rubygems.org/sign_in';
const PENDING_URL = 'https://rubygems.org/profile/oidc/pending_trusted_publishers';
const NEW_PENDING_URL = `${PENDING_URL}/new`;

export interface GitHubPublisher {
  /** The gem name. For a pending publisher it need not exist yet. */
  gemName: string;
  owner: string;
  repository: string;
  /** Just the file name, e.g. `release.yml`. */
  workflowFilename: string;
  /** Leave empty unless the workflow declares a GitHub environment. */
  environment?: string;
}

export interface SignInOptions {
  /** Handle or email; the field accepts either. */
  who: string;
  password: string;
  /** base32 TOTP seed. Without it the run parks and asks for a code. */
  totpSecret?: string;
}

/**
 * Rails nests these names, so match the ending rather than the whole thing:
 * `…[trusted_publisher_attributes][repository_owner]` and a bare
 * `repository_owner` both hit.
 */
const field = (suffix: string) => [
  `input[name$="[${suffix}]"]`,
  `input[name="${suffix}"]`,
  `select[name$="[${suffix}]"]`,
  `[name$="[${suffix}]"]`,
];

export async function isSignedIn(session: Session): Promise<boolean> {
  await session.page.goto(PENDING_URL, { waitUntil: 'domcontentloaded' });
  return !session.page.url().includes('/sign_in');
}

/**
 * Sign in and clear the MFA prompt. RubyGems requires MFA on any account that
 * can publish, so this path is not optional in practice.
 */
export async function signIn(session: Session, options: SignInOptions): Promise<void> {
  const { page } = session;
  await page.goto(SIGN_IN_URL, { waitUntil: 'domcontentloaded' });

  await page.fill('input[name="session[who]"]', options.who);
  await page.fill('input[name="session[password]"]', options.password);
  await clickFirst(page, [
    'input[type="submit"]',
    'button[type="submit"]',
    'input[name="commit"]',
    'button:has-text("Sign in")',
  ]);
  await page.waitForLoadState('domcontentloaded');

  const otpField = 'input[name="otp"]';
  const wantsOtp = await page
    .locator(otpField)
    .first()
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (wantsOtp) {
    const code = await twoFactorCode(options.totpSecret, () =>
      session.ask('rubygems-otp', 'RubyGems is asking for a 6-digit MFA code.'),
    );
    await page.fill(otpField, code);
    await clickFirst(page, ['input[type="submit"]', 'button[type="submit"]', 'button:has-text("Authenticate")']);
    await page.waitForLoadState('domcontentloaded');
  }

  if (page.url().includes('/sign_in')) {
    const shot = await session.shot('rubygems-signin-failed');
    throw new Error(`RubyGems did not accept that sign-in. Screenshot: ${shot}`);
  }
}

/** The pending publishers on the account, as plain text rows. */
export async function listPending(session: Session): Promise<string[]> {
  await session.page.goto(PENDING_URL, { waitUntil: 'domcontentloaded' });
  const rows: string[] = await session.page
    .locator('main table tr, main li, main .card')
    .allTextContents()
    .catch(() => [] as string[]);
  return rows.map((row) => row.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Whether a pending publisher for this gem and workflow is already there. */
export function alreadyRegistered(rows: string[], publisher: GitHubPublisher): boolean {
  const needle = [publisher.owner, publisher.repository, publisher.workflowFilename].map((s) => s.toLowerCase());
  return rows.some((row) => {
    const text = row.toLowerCase();
    return text.includes(publisher.gemName.toLowerCase()) && needle.every((part) => text.includes(part));
  });
}

/**
 * Add a pending GitHub publisher. Returns false when an equivalent one was
 * already registered.
 */
export async function addPending(session: Session, publisher: GitHubPublisher): Promise<boolean> {
  if (alreadyRegistered(await listPending(session), publisher)) return false;

  const { page } = session;
  await page.goto(NEW_PENDING_URL, { waitUntil: 'domcontentloaded' });

  const fill = async (suffix: string, value: string) => {
    for (const selector of field(suffix)) {
      const locator = page.locator(selector).first();
      // eslint-disable-next-line no-await-in-loop -- candidates are tried in order on purpose
      if (await locator.count().then((n: number) => n > 0).catch(() => false)) {
        await locator.fill(value);
        return;
      }
    }
    throw new Error(`Could not find the "${suffix}" field on the RubyGems pending publisher form.`);
  };

  await fill('rubygem_name', publisher.gemName);

  // The publisher type is a select. GitHub Actions is the only kind RubyGems
  // supports today, so a missing select is fine rather than fatal.
  await page
    .locator('select[name$="[trusted_publisher_type]"]')
    .first()
    .selectOption({ label: 'GitHub Actions' })
    .catch(() => undefined);

  await fill('repository_owner', publisher.owner);
  await fill('repository_name', publisher.repository);
  await fill('workflow_filename', publisher.workflowFilename);
  // Written even when empty: RubyGems matches the environment exactly, so a
  // leftover value would quietly reject every push.
  await fill('environment', publisher.environment ?? '');

  await clickFirst(page, [
    'input[type="submit"]',
    'button[type="submit"]',
    'input[name="commit"]',
    'button:has-text("Create")',
  ]);
  await page.waitForLoadState('domcontentloaded');

  if (!alreadyRegistered(await listPending(session), publisher)) {
    const shot = await session.shot('rubygems-add-pending-failed');
    throw new Error(
      `RubyGems accepted the form but the publisher is not listed. The page usually says why. Screenshot: ${shot}`,
    );
  }
  return true;
}
