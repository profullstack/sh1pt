import { Command } from 'commander';
import kleur from 'kleur';
import prompts from 'prompts';
import {
  deleteSecretFromCloud,
  getSecretFromCloud,
  isSignedIn,
  listSecretsFromCloud,
  setSecretInCloud,
} from '../cloud-vault.js';

export const secretsCmd = new Command('secret')
  .description('Manage cloud-vaulted credentials (encrypted client-side; server only sees ciphertext)');

secretsCmd
  .command('set <key> [value]')
  .description('Set a secret (value prompted if omitted; never echoed)')
  .action(async (key: string, value?: string) => {
    if (!(await requireSignedIn())) return;
    let v = value;
    if (!v) {
      const res = await prompts({
        type: 'password',
        name: 'v',
        message: `Value for ${key}:`,
      });
      v = res.v as string | undefined;
    }
    if (!v) {
      console.log(kleur.dim('aborted — no value entered.'));
      return;
    }
    try {
      await setSecretInCloud(key, v);
      console.log(kleur.green(`✓ ${key} encrypted + stored in your sh1pt.com vault.`));
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

secretsCmd
  .command('get <key>')
  .description('Print a secret (decrypts locally; passphrase required)')
  .action(async (key: string) => {
    if (!(await requireSignedIn())) return;
    try {
      const v = await getSecretFromCloud(key);
      if (v === undefined) {
        console.error(kleur.yellow(`no entry for ${key}`));
        process.exit(1);
      }
      // Print to stdout for piping; the prompt+derivation logs go to
      // stderr-equivalent (console.log, but everything before this
      // point is metadata, so a pipe-aware caller would `tail -1`).
      process.stdout.write(`${v}\n`);
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

secretsCmd
  .command('list')
  .description('List secret keys (never values)')
  .action(async () => {
    if (!(await requireSignedIn())) return;
    const entries = await listSecretsFromCloud();
    if (entries.length === 0) {
      console.log(kleur.dim('vault is empty.'));
      return;
    }
    for (const e of entries) {
      console.log(`  ${kleur.cyan(e.key)}  ${kleur.dim(e.updated_at)}`);
    }
  });

secretsCmd
  .command('rm <key>')
  .description('Delete a secret')
  .action(async (key: string) => {
    if (!(await requireSignedIn())) return;
    try {
      await deleteSecretFromCloud(key);
      console.log(kleur.dim(`removed ${key}`));
    } catch (err) {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

async function requireSignedIn(): Promise<boolean> {
  if (await isSignedIn()) return true;
  console.error(kleur.yellow('Not signed in. Run `sh1pt login` first.'));
  return false;
}
