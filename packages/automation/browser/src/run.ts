/**
 * The runnable half: `sh1pt browser <recipe> <action>` dispatches here, and
 * it also runs directly with tsx during development.
 *
 *   tsx src/run.ts google-cloud-oauth status        --project 330436882816
 *   tsx src/run.ts google-cloud-oauth add-test-users --project 330436882816 --email a@b.com
 *   tsx src/run.ts google-cloud-oauth publish        --project 330436882816
 *   tsx src/run.ts google-cloud-oauth add-redirect-uri --project N --client ID --uri https://…
 *
 * Credentials come from the environment so nothing lands in a shell history:
 * GOOGLE_ACCOUNT_EMAIL and GOOGLE_ACCOUNT_PASSWORD, or an already signed-in
 * profile, in which case neither is read.
 */
import { openSession } from './session.js';
import * as google from './recipes/google-cloud-oauth.js';
import { RECIPES } from './index.js';

export interface RunOptions {
  project?: string;
  emails?: string[];
  clientId?: string;
  redirectUri?: string;
  headed?: boolean;
  profile?: string;
  channel?: 'chrome' | 'chromium' | 'msedge';
}

const need = <T>(value: T | undefined, what: string): T => {
  if (value === undefined || value === null || value === '') throw new Error(`Missing ${what}.`);
  return value;
};

export async function runRecipe(recipe: string, action: string, options: RunOptions = {}): Promise<unknown> {
  if (recipe !== 'google-cloud-oauth') {
    throw new Error(`Unknown recipe "${recipe}". Known: ${RECIPES.map((r) => r.id).join(', ')}`);
  }

  const session = await openSession({
    profile: options.profile ?? 'google',
    headed: options.headed,
    channel: options.channel,
  });

  try {
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
        throw new Error(`Unknown action "${action}" for ${recipe}.`);
    }
  } finally {
    await session.close();
  }
}

/** Minimal flag parsing so this file runs standalone under tsx. */
function parse(argv: string[]): { recipe: string; action: string; options: RunOptions } {
  const [recipe = '', action = ''] = argv;
  const options: RunOptions = { emails: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--project') (options.project = value), (i += 1);
    else if (flag === '--email') (options.emails!.push(value ?? ''), (i += 1));
    else if (flag === '--client') (options.clientId = value), (i += 1);
    else if (flag === '--uri') (options.redirectUri = value), (i += 1);
    else if (flag === '--profile') (options.profile = value), (i += 1);
    else if (flag === '--channel') (options.channel = value as RunOptions['channel']), (i += 1);
    else if (flag === '--headed') options.headed = true;
  }
  return { recipe, action, options };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { recipe, action, options } = parse(process.argv.slice(2));
  runRecipe(recipe, action, options)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error: Error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
