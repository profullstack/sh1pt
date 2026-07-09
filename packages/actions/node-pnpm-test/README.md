# Node pnpm Test

Installs the lightweight test workflow used by the sh1pt repository.

The workflow runs on pull requests and pushes to the configured branch, installs with pnpm, and runs the configured test command with `CI=true`. The test step defaults to `pnpm run --if-present test`, so a repository that has not defined a test script yet gets a green workflow instead of failing on the first step.

## Requirements

The repository's `package.json` must declare a `packageManager` field (e.g. `"packageManager": "pnpm@10.0.0"`). `pnpm/action-setup@v4` reads the pnpm version from there. The workflow does **not** pin a pnpm `version` itself — pinning one that disagrees with `packageManager` fails the run with `ERR_PNPM_BAD_PM_VERSION`.

## Output

`node-pnpm-test` writes `.github/workflows/test.yml` through a pull request.
