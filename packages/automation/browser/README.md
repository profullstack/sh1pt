# @profullstack/sh1pt-automation-browser

Reusable Playwright recipes for the provider chores that have no CLI and no
API.

sh1pt prefers, in order: an official CLI, an official API, an unofficial API,
an MCP server, and only then a browser. This package is that last rung. It
exists because some settings genuinely have no other door — Google's OAuth
consent screen being the standard example. `gcloud` covers the rest of Google
Cloud, but test users, publishing status and a client's redirect URIs are
console pages, and an app left in Testing with no test users answers every
sign-in with `Error 403: access_denied`.

```bash
sh1pt browser list
sh1pt browser google-cloud-oauth status --project 1234567890
sh1pt browser google-cloud-oauth add-test-users --project 1234567890 --email you@example.com
sh1pt browser google-cloud-oauth publish --project 1234567890
```

`playwright` is an optional peer dependency; install it where you run the
recipes.

## Trusted publishers

PyPI and RubyGems let a GitHub workflow publish with no long-lived token, and
neither exposes that setting to an API. PyPI's upload API publishes packages
rather than account settings; RubyGems keeps publishers under the profile and
`gem` has no command for them. Both are therefore browser work.

The form worth automating is the **pending** publisher. It names a package
that does not exist yet and brings it into being on the first publish, so a
brand-new project ships without a token ever being minted. Registering four
of them by hand across two registries is exactly the chore this package is
for.

```bash
sh1pt browser pypi-trusted-publisher add-pending \
  --package profullstack-x402-gateway --owner profullstack \
  --repo x402-ports --workflow release-python.yml

sh1pt browser rubygems-trusted-publisher add-pending \
  --package x402-gateway --owner profullstack \
  --repo x402-ports --workflow release-ruby.yml

sh1pt browser pypi-trusted-publisher list
```

Both actions are idempotent: `add-pending` reads the existing list first and
returns `{ "added": false, "alreadyPresent": true }` rather than creating a
duplicate, so a fleet script can call it unconditionally.

**Leave `--environment` off** unless the workflow declares a GitHub
environment. Both registries match it exactly, so a value set against a
workflow that has none rejects every publish. The recipes always write the
field, empty included, so a stale value cannot survive an edit.

Credentials come from the environment, never from flags, so nothing lands in
shell history:

| Variable | Used for |
| --- | --- |
| `PYPI_USERNAME`, `PYPI_PASSWORD` | PyPI sign-in |
| `PYPI_TOTP_SECRET` | optional; the base32 seed, for an unattended run |
| `RUBYGEMS_USERNAME`, `RUBYGEMS_PASSWORD` | RubyGems sign-in |
| `RUBYGEMS_TOTP_SECRET` | optional; same |

Both registries require two-factor on any account that can publish. With a
seed the run is unattended. Without one it parks on `session.ask()` and waits
for you to write the code into the answer file it names, which is worth having
because a seed is not always available. A security key instead of an
authenticator cannot be driven headlessly at all, and the PyPI recipe says so
rather than hanging.

## The profile is the point

The clicking is easy. The sign-in is not: providers challenge a fresh browser
with 2FA, device confirmation and "this browser may not be secure". So a
session is a **persistent Chrome profile** under
`~/.config/sh1pt/browser/profiles/<name>`. Sign in once, answer whatever is
asked, and every later run of every recipe reuses it unattended.

When something can only be answered by a person, a recipe calls
`session.ask()`. That writes a screenshot and a question into the run's
artifacts directory and waits for an answer file, so an unattended box parks
instead of failing.

## Three things that decide whether a sign-in works

All in `session.ts`, all learned the hard way against Google:

1. **A real Chrome in *new* headless mode.** Playwright's `headless: true`
   asks for the old headless binary, which sign-in pages recognise and refuse.
   The session finds a system Chrome and passes `--headless=new` itself.
2. **A desktop user agent.** New headless still reports `HeadlessChrome`, and
   Google answers that with a stripped-down flow that will not take a password
   at all. `desktopUserAgent()` spells the binary's real version the way a
   desktop Chrome would.
3. **A virtual authenticator.** With no authenticator present, a passkey
   prompt never settles: the page sits on "Verifying it's you…" and even its
   own "Try another way" button does nothing, because the flow is still
   waiting. Registering Chrome's DevTools virtual authenticator makes the
   request fail the way an empty security key would, and the site offers its
   password fallback.

## Writing a recipe

A recipe is a plain function over a `Session`, so it composes and tests like
any other code.

```ts
import { openSession, clickFirst } from '@profullstack/sh1pt-automation-browser';

const session = await openSession({ profile: 'acme' });
await session.page.goto('https://console.example.com/settings');
await clickFirst(session.page, ['button:has-text("Save")', 'button:has-text("SAVE")']);
await session.close();
```

`clickFirst` takes every wording you have seen for the same button and tries
them in order, then falls back from a normal click to a forced one to the
element's own handler. Consoles rename and re-nest their buttons constantly;
pinning one selector rots.

Add the recipe to `RECIPES` in `index.ts` so `sh1pt browser list` shows it,
and say there why a browser is needed rather than an API.
