/**
 * The runnable half: `sh1pt browser <recipe> <action>` dispatches here.
 *
 * No `import.meta` and no top-level side effect lives in this file: the
 * standalone entry is `main.ts`. Vite's SSR transform chokes on
 * "Cannot split a chunk that has already been edited" when a module a test
 * imports carries `import.meta` past a certain size, and a test importing
 * `parse`/`profileFor` from here is exactly that case.
 *
 *   tsx src/run.ts google-cloud-oauth status         --project 330436882816
 *   tsx src/run.ts google-cloud-oauth add-test-users --project 330436882816 --email a@b.com
 *   tsx src/run.ts pypi-trusted-publisher add-pending \
 *       --package profullstack-x402-gateway --owner profullstack --repo x402-ports \
 *       --workflow release-python.yml
 *   tsx src/run.ts rubygems-trusted-publisher add-pending \
 *       --package x402-gateway --owner profullstack --repo x402-ports \
 *       --workflow release-ruby.yml
 *
 * Credentials come from the environment so nothing lands in a shell history:
 *
 *   GOOGLE_ACCOUNT_EMAIL / GOOGLE_ACCOUNT_PASSWORD
 *   PYPI_USERNAME / PYPI_PASSWORD / PYPI_TOTP_SECRET
 *   RUBYGEMS_USERNAME / RUBYGEMS_PASSWORD / RUBYGEMS_TOTP_SECRET
 *
 * The TOTP seeds are optional. Without one the run parks, writes a screenshot
 * and a question into its artifacts directory, and waits for the answer file,
 * rather than failing. With one it is unattended.
 */
import { readFileSync } from 'node:fs';
import { openSession, type Session } from './session.js';
import * as amo from './recipes/amo-appeal.js';
import * as cws from './recipes/chrome-web-store.js';
import * as google from './recipes/google-cloud-oauth.js';
import * as meta from './recipes/meta-app.js';
import * as pypi from './recipes/pypi-trusted-publisher.js';
import * as rubygems from './recipes/rubygems-trusted-publisher.js';
import { RECIPES } from './index.js';

export interface RunOptions {
  project?: string;
  emails?: string[];
  clientId?: string;
  redirectUri?: string;
  /** Package, project or gem name for the trusted-publisher recipes. */
  packageName?: string;
  /** Chrome Web Store item id, and the path to its store-listing.json. */
  item?: string;
  listing?: string;
  publisher?: string;
  /** AMO: the add-on id or slug, the decision id, and the appeal text. */
  addon?: string;
  decision?: string;
  reason?: string;
  reasonFile?: string;
  owner?: string;
  repo?: string;
  workflow?: string;
  environment?: string;
  headed?: boolean;
  profile?: string;
  channel?: 'chrome' | 'chromium' | 'msedge';
}

const need = <T>(value: T | undefined, what: string): T => {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${what}.`);
  return value;
};

/** The default profile for a recipe, so a sign-in is not shared between providers. */
export function profileFor(recipe: string): string {
  return RECIPES.find((entry) => entry.id === recipe)?.profile ?? recipe;
}

async function runGoogle(session: Session, action: string, options: RunOptions): Promise<unknown> {
  const email = process.env.GOOGLE_ACCOUNT_EMAIL;
  const password = process.env.GOOGLE_ACCOUNT_PASSWORD;
  if (!(await google.isSignedIn(session))) {
    if (!email || !password) {
      throw new Error(
        'This profile is not signed in to Google. Set GOOGLE_ACCOUNT_EMAIL and GOOGLE_ACCOUNT_PASSWORD, ' +
          'or sign in once with --headed on a machine with a display.',
      );
    }
    await google.signIn(session, { email, password });
  }

  const target = { project: need(options.project, '--project (project id or number)') };

  switch (action) {
    case 'status':
      return await google.readAudience(session, target);
    case 'add-test-users': {
      const emails = need(options.emails?.length ? options.emails : undefined, '--email (repeatable)');
      const added = await google.addTestUsers(session, target, emails);
      return { added, alreadyPresent: emails.filter((e) => !added.includes(e)) };
    }
    case 'publish':
      return { published: await google.publishApp(session, target) };
    case 'add-redirect-uri':
      return {
        added: await google.addRedirectUri(
          session,
          target,
          need(options.clientId, '--client'),
          need(options.redirectUri, '--uri'),
        ),
      };
    default:
      throw new Error(`Unknown action "${action}" for google-cloud-oauth.`);
  }
}

/**
 * `status` deliberately needs no browser and no credentials: AMO answers 401 to
 * an unauthenticated read of a Mozilla-disabled add-on but still returns the
 * disable flags in the body, so the cheapest correct check is a plain fetch. It
 * runs before any sign-in for that reason.
 */
async function runAmo(session: Session, action: string, options: RunOptions): Promise<unknown> {
  if (action === 'status') {
    return await amo.readAddonState(need(options.addon, '--addon (numeric id or slug)'));
  }

  if (action !== 'appeal') throw new Error(`Unknown action "${action}" for amo-appeal.`);

  const reason = options.reasonFile
    ? readFileSync(options.reasonFile, 'utf8')
    : need(options.reason, '--reason (or --reason-file, the appeal text)');

  if (!(await amo.isSignedIn(session))) {
    throw new Error(
      'This profile is not signed in to addons.mozilla.org. Sign in once with --headed, then re-run: ' +
        'an appeal is attributed to the account that files it, so it is not something to do with a shared token.',
    );
  }

  return await amo.submitAppeal(session, {
    decisionCinderId: need(options.decision, '--decision (the id from the reviewer email)'),
    reason,
    email: process.env.AMO_ACCOUNT_EMAIL,
  });
}

/**
 * The Web Store console is a Google property, so this shares the `google`
 * profile rather than opening a second sign-in for the same account.
 */
async function runChromeWebStore(session: Session, action: string, options: RunOptions): Promise<unknown> {
  if (!(await cws.isSignedIn(session))) {
    const email = process.env.GOOGLE_ACCOUNT_EMAIL;
    const password = process.env.GOOGLE_ACCOUNT_PASSWORD;
    if (!email || !password) {
      throw new Error(
        'This profile is not signed in to the Chrome Web Store console. Set GOOGLE_ACCOUNT_EMAIL and ' +
          'GOOGLE_ACCOUNT_PASSWORD, or sign in once with --headed on a machine with a display.',
      );
    }
    await google.signIn(session, { email, password });
  }

  const target = {
    itemId: cws.assertItemId(need(options.item, '--item (the 32-character extension id)')),
    publisherId: options.publisher,
  };

  switch (action) {
    case 'status':
      return {
        item: target.itemId,
        editUrl: cws.itemEditUrl(target),
        publicUrl: cws.publicListingUrl(target.itemId),
      };
    case 'unpublish':
      return await cws.unpublish(session, target);
    case 'fill-listing': {
      const path = need(options.listing, '--listing (path to store-listing.json)');
      const listing = cws.prepareListing(JSON.parse(readFileSync(path, 'utf8')));
      return await cws.fillListing(session, target, listing);
    }
    default:
      throw new Error(`Unknown action "${action}" for chrome-web-store.`);
  }
}

async function runPypi(session: Session, action: string, options: RunOptions): Promise<unknown> {
  if (!(await pypi.isSignedIn(session))) {
    const username = process.env.PYPI_USERNAME;
    const password = process.env.PYPI_PASSWORD;
    if (!username || !password) {
      throw new Error(
        'This profile is not signed in to PyPI. Set PYPI_USERNAME and PYPI_PASSWORD ' +
          '(and PYPI_TOTP_SECRET to run unattended), or sign in once with --headed.',
      );
    }
    await pypi.signIn(session, { username, password, totpSecret: process.env.PYPI_TOTP_SECRET });
  }

  switch (action) {
    case 'list':
      return { publishers: await pypi.listPublishers(session) };
    case 'add-pending': {
      const publisher = {
        projectName: need(options.packageName, '--package (the PyPI project name)'),
        owner: need(options.owner, '--owner'),
        repository: need(options.repo, '--repo'),
        workflowFilename: need(options.workflow, '--workflow (file name, e.g. release.yml)'),
        environment: options.environment,
      };
      const added = await pypi.addPending(session, publisher);
      return { added, alreadyPresent: !added, publisher };
    }
    default:
      throw new Error(`Unknown action "${action}" for pypi-trusted-publisher.`);
  }
}

async function runRubygems(session: Session, action: string, options: RunOptions): Promise<unknown> {
  if (!(await rubygems.isSignedIn(session))) {
    const who = process.env.RUBYGEMS_USERNAME;
    const password = process.env.RUBYGEMS_PASSWORD;
    if (!who || !password) {
      throw new Error(
        'This profile is not signed in to RubyGems. Set RUBYGEMS_USERNAME and RUBYGEMS_PASSWORD ' +
          '(and RUBYGEMS_TOTP_SECRET to run unattended), or sign in once with --headed.',
      );
    }
    await rubygems.signIn(session, { who, password, totpSecret: process.env.RUBYGEMS_TOTP_SECRET });
  }

  switch (action) {
    case 'list':
      return { pending: await rubygems.listPending(session) };
    case 'add-pending': {
      const publisher = {
        gemName: need(options.packageName, '--package (the gem name)'),
        owner: need(options.owner, '--owner'),
        repository: need(options.repo, '--repo'),
        workflowFilename: need(options.workflow, '--workflow (file name, e.g. release.yml)'),
        environment: options.environment,
      };
      const added = await rubygems.addPending(session, publisher);
      return { added, alreadyPresent: !added, publisher };
    }
    default:
      throw new Error(`Unknown action "${action}" for rubygems-trusted-publisher.`);
  }
}

export async function runRecipe(recipe: string, action: string, options: RunOptions = {}): Promise<unknown> {
  if (!RECIPES.some((entry) => entry.id === recipe)) {
    throw new Error(`Unknown recipe "${recipe}". Known: ${RECIPES.map((r) => r.id).join(', ')}`);
  }

  const session = await openSession({
    profile: options.profile ?? profileFor(recipe),
    headed: options.headed,
    channel: options.channel,
  });

  try {
    switch (recipe) {
      case 'amo-appeal':
        return await runAmo(session, action, options);
      case 'chrome-web-store':
        return await runChromeWebStore(session, action, options);
      case 'google-cloud-oauth':
        return await runGoogle(session, action, options);
      case 'pypi-trusted-publisher':
        return await runPypi(session, action, options);
      case 'rubygems-trusted-publisher':
        return await runRubygems(session, action, options);
      case 'meta-app':
        return await runMeta(session, action, options);
      default:
        throw new Error(`Unknown recipe "${recipe}".`);
    }
  } finally {
    await session.close();
  }
}

/**
 * Meta's half. The app id rides in on `--client`, since that is what Meta
 * calls it everywhere, and the account comes from FB_EMAIL / FB_PASSWORD.
 */
async function runMeta(session: Session, action: string, options: RunOptions): Promise<unknown> {
  const email = process.env.FB_EMAIL;
  const password = process.env.FB_PASSWORD;
  if (!(await meta.isSignedIn(session))) {
    if (!email || !password) throw new Error('This profile is not signed in. Set FB_EMAIL and FB_PASSWORD.');
    await meta.signIn(session, { email, password });
  }

  const app = need(options.clientId, '--client (the Meta app id)');
  switch (action) {
    case 'status':
      return await meta.status(session, app);
    case 'add-redirect-uri':
      return { added: await meta.addRedirectUri(session, app, need(options.redirectUri, '--uri')) };
    default:
      throw new Error(`Unknown action "${action}" for meta-app.`);
  }
}

/** Minimal flag parsing so this file runs standalone under tsx. */
export function parse(argv: string[]): { recipe: string; action: string; options: RunOptions } {
  const [recipe = '', action = ''] = argv;
  const options: RunOptions = { emails: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--project') (options.project = value), (i += 1);
    else if (flag === '--email') (options.emails!.push(value ?? ''), (i += 1));
    else if (flag === '--client') (options.clientId = value), (i += 1);
    else if (flag === '--uri') (options.redirectUri = value), (i += 1);
    else if (flag === '--package') (options.packageName = value), (i += 1);
    else if (flag === '--owner') (options.owner = value), (i += 1);
    else if (flag === '--repo') (options.repo = value), (i += 1);
    else if (flag === '--workflow') (options.workflow = value), (i += 1);
    else if (flag === '--environment') (options.environment = value), (i += 1);
    else if (flag === '--addon') (options.addon = value), (i += 1);
    else if (flag === '--decision') (options.decision = value), (i += 1);
    else if (flag === '--reason') (options.reason = value), (i += 1);
    else if (flag === '--reason-file') (options.reasonFile = value), (i += 1);
    else if (flag === '--item') (options.item = value), (i += 1);
    else if (flag === '--listing') (options.listing = value), (i += 1);
    else if (flag === '--publisher') (options.publisher = value), (i += 1);
    else if (flag === '--profile') (options.profile = value), (i += 1);
    else if (flag === '--channel') (options.channel = value as RunOptions['channel']), (i += 1);
    else if (flag === '--headed') options.headed = true;
  }
  return { recipe, action, options };
}
