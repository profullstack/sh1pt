/**
 * Standalone entry: `tsx src/main.ts <recipe> <action> [flags]`.
 *
 * Kept apart from `run.ts` because this is the only file that needs
 * `import.meta`, and a module carrying it breaks Vite's SSR transform for
 * any test that imports it.
 */
import { parse, runRecipe } from './run.js';

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
