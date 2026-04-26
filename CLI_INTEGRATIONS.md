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
| Vultr | `vultr-cli` | `cloud/vultr` | Exists, CLI-backed setup/logging | `brew install vultr-cli` |
| Supabase | `supabase` | `cloud/supabase` | Exists | `mise x npm:supabase -- supabase --help` |
| Expo / EAS | `expo`, `eas` | `targets/mobile-expo` | Exists | `mise x npm:expo -- expo --help`; `mise x npm:eas-cli -- eas --help` |
| Doppler | `doppler` | `secrets/doppler` | Exists | official package manager install |
| dotenvx | `dotenvx` | `secrets/dotenvx` | Exists | `mise x npm:@dotenvx/dotenvx -- dotenvx --help` |

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

## Adapter rule

When a vendor has a mature CLI, prefer a thin adapter over the CLI first:

1. `check()` verifies the CLI is installed and authenticated.
2. `setup()` gives a mise-friendly install hint and auth flow.
3. `dryRun` never requires secrets or network access.
4. The adapter logs the exact vendor command it would run.
5. Use API calls only when the CLI lacks a required operation or machine-readable output.
