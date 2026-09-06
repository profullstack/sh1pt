import { Command } from 'commander';
import kleur from 'kleur';

/**
 * `sh1pt browser` — the recipes for provider settings that have no API.
 *
 * The package is loaded lazily so the CLI starts fast and so a machine
 * without playwright still runs every other command.
 */
export const browserCmd = new Command('browser')
  .description('Automate provider consoles that have no CLI or API (OAuth consent screens, redirect URIs).')
  .argument('[recipe]', 'recipe id, or "list"')
  .argument('[action]', 'action within the recipe')
  .option('--project <id>', 'project id or number')
  .option('--email <address...>', 'email address (repeatable)')
  .option('--client <id>', 'OAuth client id')
  .option('--uri <url>', 'redirect URI')
  .option('--package <name>', 'package, project or gem name (trusted publishers)')
  .option('--owner <name>', 'GitHub user or organisation that owns the repository')
  .option('--repo <name>', 'GitHub repository name')
  .option('--workflow <file>', 'workflow file name, e.g. release.yml')
  .option('--environment <name>', 'GitHub Actions environment; omit unless the workflow declares one')
  .option('--profile <name>', 'browser profile to sign in as')
  .option('--headed', 'show the browser window (needs a display)')
  .option('--json', 'machine-readable output')
  .action(async (recipe: string | undefined, action: string | undefined, opts: Record<string, unknown>) => {
    const { RECIPES } = await import('@profullstack/sh1pt-automation-browser');

    if (!recipe || recipe === 'list') {
      console.log(kleur.bold('Browser recipes'));
      console.log(kleur.dim('Last resort, on purpose: an official CLI or API comes first.'));
      console.log();
      for (const entry of RECIPES) {
        console.log(`${kleur.cyan(entry.id)}  ${entry.label}`);
        console.log(`  ${kleur.dim(entry.because)}`);
        console.log(`  actions: ${entry.actions.join(', ')}`);
        console.log(`  profile: ${entry.profile}`);
      }
      console.log();
      console.log('Examples:');
      console.log('  sh1pt browser google-cloud-oauth add-test-users --project 1234567 --email you@example.com');
      console.log(
        '  sh1pt browser pypi-trusted-publisher add-pending --package my-lib --owner me --repo my-repo --workflow release.yml',
      );
      console.log(
        '  sh1pt browser rubygems-trusted-publisher add-pending --package my-gem --owner me --repo my-repo --workflow release.yml',
      );
      return;
    }

    if (!action) throw new Error(`Which action? Try: sh1pt browser ${recipe} <action>`);

    const { runRecipe } = await import('@profullstack/sh1pt-automation-browser/run');
    const result = await runRecipe(recipe, action, {
      project: opts.project as string | undefined,
      emails: opts.email as string[] | undefined,
      clientId: opts.client as string | undefined,
      redirectUri: opts.uri as string | undefined,
      packageName: opts.package as string | undefined,
      owner: opts.owner as string | undefined,
      repo: opts.repo as string | undefined,
      workflow: opts.workflow as string | undefined,
      environment: opts.environment as string | undefined,
      profile: opts.profile as string | undefined,
      headed: Boolean(opts.headed),
    });

    console.log(JSON.stringify(result, null, 2));
  });
