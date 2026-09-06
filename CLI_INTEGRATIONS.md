# CLI-backed integrations

`mise` is the default local tool/env layer for sh1pt development. It owns language runtimes, package managers, and repeatable project tasks across Node, Python, Rust, Bun, Deno, and CLI-backed vendor integrations.

Keep the default `mise install` focused on runtimes needed by this repo and its boilerplates. Provider CLIs should be installed on demand by adapter setup flows or explicit mise profiles/tasks.

## Default tools

The root `mise.toml` installs:

| Tool | Why |
|---|---|
| `node@22` | Primary runtime for the sh1pt CLI and TypeScript packages |
| `pnpm@9.12.0` | Workspace package manager, matching `packageManager` |
| `bun@1.1` | Supported runtime and boilerplate target |
| `deno@2` | Supported runtime and Deno distribution targets |
| `python@3.12` | FastAPI boilerplate and Python adapters |
| `rust@stable` | Axum and Tauri boilerplates |
| `npm:@endevco/aube@latest` | Package-manager distribution channel |

## First integration wave

These have real CLIs and map directly to existing or planned adapter surfaces.

| Integration | CLI | Adapter surface | Repo status | Install hint |
|---|---|---|---|---|
| OpenAI Codex | `codex` | `agents/codex` | Exists | `mise x npm:@openai/codex -- codex --help` |
| Claude Code | `claude` | `agents/claude` | Exists | `mise x npm:@anthropic-ai/claude-code -- claude --help` |
| Qwen Code | `qwen` | `agents/qwen` | Exists | `mise x npm:@qwen-code/qwen-code -- qwen --help` |
| Railway | `railway` | `cloud/railway`, `targets/deploy-railway` | Exists | `mise x npm:@railway/cli -- railway --help` |
| DigitalOcean | `doctl` | `cloud/digitalocean` | Exists, CLI-backed setup/logging | `brew install doctl` or `snap install doctl` |
| exe.dev | `ssh` / HTTPS API | `cloud/exe-dev`, `targets/exe-dev` | Cloud adapter added, target exists | `ssh exe.dev help` |
| Vultr | `vultr-cli` | `cloud/vultr` | Exists, CLI-backed setup/logging | `brew install vultr-cli` |
| Supabase | `supabase` | `cloud/supabase` | Exists | `mise x npm:supabase -- supabase --help` |
| Expo / EAS | `expo`, `eas` | `targets/mobile-expo` | Exists | `mise x npm:expo -- expo --help`; `mise x npm:eas-cli -- eas --help` |
| Doppler | `doppler` | `secrets/doppler` | Exists | official package manager install |
| dotenvx | `dotenvx` | `secrets/dotenvx` | Exists | `mise x npm:@dotenvx/dotenvx -- dotenvx --help` |
| WordPress | `wp` | `targets/deploy-wordpress` | Exists | `brew install wp-cli`, or the phar from https://wp-cli.org/#installing |

## Strong next candidates

| Integration | CLI | Adapter surface | Why it belongs |
|---|---|---|---|
| Cloudflare | `wrangler` | `cloud/cloudflare`, `targets/deploy-workers` | Exists |
| Fly.io | `flyctl` | `targets/deploy-fly`, `cloud/fly` | Exists |
| Vercel | `vercel` | `targets/deploy-vercel` | Exists |
| Netlify | `netlify` | `targets/deploy-netlify` | Exists |
| Render | `render` | `targets/deploy-render` | Exists |
| Firebase | `firebase` | `cloud/firebase`, `targets/deploy-firebase` | Exists |
| Stripe | `stripe` | `payments/stripe` | Exists, CLI-backed setup |
| Sentry | `sentry-cli` | `observability/sentry` | Exists |
| GitHub | `gh` | `vcs/github` | Exists, CLI-backed setup |
| GitLab | `glab` | `vcs/gitlab` | Exists, CLI-backed setup |
| 1Password | `op` | `secrets/onepassword` | Exists |
| Snyk | `snyk` | `security/snyk` | Exists |
| Stagehand (Browserbase) | `npx @browserbasehq/stagehand` | `automation/stagehand` | Exists. AI browser automation — local Chromium or Browserbase cloud. |
| OpenAPI → SDK/MCP/docs | `sh1pt openapi <sdk\|mcp\|docs\|all>` | built into the CLI (`packages/openapi`) | Stainless-style spec-driven generator. No external CLI needed. |

## When there is no CLI and no API: browser recipes

Some settings have no door but the console. Google's OAuth consent screen is
the standard example: `gcloud` covers the rest of Google Cloud, but test
users, publishing status and a client's redirect URIs exist only as pages. An
app left in Testing with no test users answers every sign-in with
`Error 403: access_denied`, and nothing on the command line can change that.

`packages/automation/browser` holds those as typed, reusable recipes, driven
with Playwright against a **persistent profile**: sign in once, and every
later run is unattended. `sh1pt browser list` prints what is on the shelf.

```bash
sh1pt browser list
sh1pt browser google-cloud-oauth status --project 1234567890
sh1pt browser google-cloud-oauth add-test-users --project 1234567890 --email you@example.com
sh1pt browser google-cloud-oauth publish --project 1234567890
sh1pt browser google-cloud-oauth add-redirect-uri --project 1234567890 --client abc --uri https://example.com/api/v1/google/oauth/callback

sh1pt browser pypi-trusted-publisher add-pending --package my-lib --owner me --repo my-repo --workflow release.yml
sh1pt browser rubygems-trusted-publisher add-pending --package my-gem --owner me --repo my-repo --workflow release.yml

sh1pt browser meta-app status --client 1234567890
sh1pt browser meta-app add-redirect-uri --client 1234567890 --uri https://example.com/api/v1/facebook/oauth/callback
```

Meta answers an account that does not own the app by redirecting every
`/apps/<id>/…` URL to the developer home page, so `meta-app` checks it can
administer the app before touching anything and fails loudly rather than
reporting a success it did not achieve. Its second factor defaults to
WhatsApp; the recipe switches to the emailed code, which an agent with
mailbox access can fetch, so no phone is in the loop.

| Surface | Why a browser | Recipe |
|---|---|---|
| Google Cloud OAuth consent screen | No API for test users, publishing status or client redirect URIs | `google-cloud-oauth` |
| PyPI trusted publishers | The upload API publishes packages, not account settings; a pending publisher is the only way to ship a new project with no token | `pypi-trusted-publisher` |
| RubyGems trusted publishers | Publishers live under the profile, with no API and no `gem` command | `rubygems-trusted-publisher` |
| Meta app settings | The app-settings API answers `(#10)` until "Allow API Access to App Settings" is ticked, and that tick is console-only | `meta-app` |

Both registries require two-factor on any account that can publish, so the
recipes generate the code from a base32 seed (`PYPI_TOTP_SECRET`,
`RUBYGEMS_TOTP_SECRET`) when one is set, and otherwise park and ask for it.
`add-pending` is idempotent: it reads the existing list first and reports
`alreadyPresent` rather than creating a duplicate.

Three things make the difference between a recipe that works and one that
gets blocked, and they are all in `session.ts`:

1. **A real Chrome, in *new* headless mode.** Playwright's `headless: true`
   asks for the old headless binary, which sign-in pages recognise and refuse.
2. **A desktop user agent.** New headless still says `HeadlessChrome`, and
   Google downgrades that to a stripped flow that will not accept a password.
3. **A virtual authenticator.** With no authenticator, a passkey prompt never
   settles, the page sits on "Verifying it's you…", and even its own
   "Try another way" button does nothing. Chrome's DevTools virtual
   authenticator makes the request fail the way an empty security key would,
   so the site offers the password fallback.

## Adapter rule

When a vendor has a mature CLI, prefer a thin adapter over the CLI first:

1. `check()` verifies the CLI is installed and authenticated.
2. `setup()` gives a mise-friendly install hint and auth flow.
3. `dryRun` never requires secrets or network access.
4. The adapter logs the exact vendor command it would run.
5. Use API calls only when the CLI lacks a required operation or machine-readable output.
