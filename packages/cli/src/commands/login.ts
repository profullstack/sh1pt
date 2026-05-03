import { Command } from 'commander';
import kleur from 'kleur';
import { spawn } from 'node:child_process';
import {
  apiBaseUrl,
  clearCredentials,
  credentialsPath,
  readCredentials,
  writeCredentials,
} from '../credentials.js';

// Device-code login. Calls /api/v1/cli/pair anonymously to mint a
// pairing code, prints it + the verification URL, attempts to open
// the URL in the user's browser, then polls /api/v1/cli/claim until
// the user approves on the page (or until the code expires).
export const loginCmd = new Command('login')
  .description('Pair this CLI with your sh1pt.com account')
  .option('--no-browser', 'do not auto-open the verification URL', false)
  .action(async (opts: { browser: boolean }) => {
    const existing = await readCredentials();
    if (existing) {
      console.log(kleur.dim(`Already signed in as ${existing.user?.email ?? '(unknown)'}.`));
      console.log(kleur.dim(`Run "sh1pt logout" first if you want to switch accounts.`));
      return;
    }

    const base = apiBaseUrl();
    const pairRes = await fetch(`${base}/api/v1/cli/pair`, { method: 'POST' });
    if (!pairRes.ok) {
      console.error(kleur.red(`Failed to start pairing: ${pairRes.status} ${await pairRes.text()}`));
      process.exit(1);
    }
    const pair = (await pairRes.json()) as {
      device_code: string;
      user_code: string;
      verification_url: string;
      expires_in: number;
      interval: number;
    };

    const url = `${pair.verification_url}?code=${encodeURIComponent(pair.user_code)}`;

    console.log();
    console.log(kleur.bold('  Pair this CLI with your sh1pt.com account.'));
    console.log();
    console.log(`    1. Open: ${kleur.cyan(url)}`);
    console.log(`    2. Approve the code:  ${kleur.bold().green(pair.user_code)}`);
    console.log();
    console.log(kleur.dim(`    Code expires in ${Math.round(pair.expires_in / 60)} minutes. Polling…`));
    console.log();

    if (opts.browser !== false) tryOpenBrowser(url);

    const interval = Math.max(1, pair.interval ?? 3) * 1000;
    const deadline = Date.now() + pair.expires_in * 1000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, interval));
      const claim = await fetch(`${base}/api/v1/cli/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device_code: pair.device_code }),
      });
      if (claim.status === 202) continue;        // authorization_pending
      if (claim.status === 410) {
        console.error(kleur.red('Pairing code expired before approval. Re-run `sh1pt login`.'));
        process.exit(1);
      }
      if (!claim.ok) {
        console.error(kleur.red(`Pairing failed: ${claim.status} ${await claim.text()}`));
        process.exit(1);
      }
      const body = (await claim.json()) as {
        access_token: string;
        refresh_token: string;
        expires_at?: number;
        user?: { id?: string; email?: string };
      };
      await writeCredentials({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: body.expires_at,
        user: body.user,
      });
      console.log(kleur.green(`✓ Signed in as ${body.user?.email ?? '(account paired)'}`));
      console.log(kleur.dim(`  saved → ${credentialsPath()}`));
      return;
    }
    console.error(kleur.red('Pairing timed out. Re-run `sh1pt login`.'));
    process.exit(1);
  });

export const logoutCmd = new Command('logout')
  .description('Sign out — removes the local CLI session token (vault data on the server is untouched)')
  .action(async () => {
    await clearCredentials();
    console.log(kleur.dim('signed out — credentials cleared.'));
  });

function tryOpenBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32'  ? 'cmd' :
    'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    // Headless or no browser available — the URL is already printed,
    // user can paste it manually.
  }
}
