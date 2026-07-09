# Node pnpm CI

Installs a GitHub Actions workflow for Node and TypeScript projects that use pnpm.

The workflow installs dependencies, runs typecheck, and runs tests with explicit read-only repository permissions.

The `typecheck` and `test` steps default to `pnpm run --if-present <script>`, so a repository that has not defined those scripts yet gets a green workflow instead of failing on the first step. Once the scripts exist they run normally.

## Requirements

The repository's `package.json` must declare a `packageManager` field (e.g. `"packageManager": "pnpm@10.0.0"`). `pnpm/action-setup@v4` reads the pnpm version from there. The workflow does **not** pin a pnpm `version` itself — pinning one that disagrees with `packageManager` fails the run with `ERR_PNPM_BAD_PM_VERSION`.

## Output

`node-pnpm-ci` writes `.github/workflows/ci.yml` through a pull request.
