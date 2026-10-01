# deploy-ssh

Railway-style deploys to a server you own: git push in, a running app with a
domain, TLS, a database and secrets out. No Docker, no Kubernetes, no PaaS.
Code goes to the box over ssh, runs under systemd, and sits behind nginx.

- **Source:** any git host the box can read (GitHub, GitLab, Codeberg, Gitea,
  your own `git.example.com`), or an rsync of your working tree.
- **Releases:** `~/apps/<app>/releases/<id>`, with `current` as a symlink.
  A deploy builds the new release while the old one keeps serving, then flips
  `current` atomically. If the health check fails, it flips back.
- **Runtime:** a systemd unit running your start command, with bun installed
  automatically. Node works too, and `static` lets nginx serve files directly.
- **nginx + TLS:** a site per app, with a Let's Encrypt certificate via certbot.
  Re-running is a no-op, and it never edits a site or unit it did not write.
- **Data:** `postgres: true` creates a local role and database and sets
  `DATABASE_URL`; `redis: true` sets `REDIS_URL`.
- **Secrets:** the vault keys you list are written to `shared/app.env` (0600).
  They travel over ssh stdin, never in argv.

## The contract: `bin/install.sh`

The box-side work lives in your repo as an idempotent
[`bin/install.sh`](./bin/install.sh) (an [OpenInstall](https://logicsrc.com/openinstall)
script). This target runs it in each release with the phases `setup`, `build`
and `activate`. A repo without one gets this generic copy. You can also run it
by hand on any box:

```bash
git clone https://codeberg.org/me/myapp && cd myapp && ./bin/install.sh
```

Settings come from `bin/install.conf` (committed, no secrets), and the
environment overrides them. The script header lists every key.

```bash
# bin/install.conf
PORT=3100
START_CMD=bun run start
DOMAINS=myapp.com www.myapp.com
POSTGRES=1
```

## Manifest

```ts
targets: {
  prod: {
    use: 'deploy-ssh',
    config: {
      host: 'dev3.profullstack.com',
      user: 'anthony',
      app: 'myapp',
      // repo: defaults to your `origin`; ref: defaults to HEAD, which must be pushed
      env: ['STRIPE_SECRET_KEY', 'RESEND_API_KEY'],   // from the vault
      // Any bin/install.conf key can be set here instead:
      port: 3100,
      domains: ['myapp.com', 'www.myapp.com'],
      postgres: true,
    },
  },
},
```

```bash
sh1pt ship --target prod      # deploy HEAD
```

Other config: `sshPort`, `sshKeyPath`, `source: 'rsync'`, `dir` (default
`apps/<app>` under the user's home), `keepReleases` (default 5), `vars` (plain,
non-secret env), `runtime`, `install`, `build`, `start`, `healthPath`,
`healthTimeout`, `tls`, `tlsEmail`, `staticDir`, `spa`, `redis`, `maxBody`.

`status()` reports the current release, whether the unit is active and the
health check result. `rollback()` returns to the release before the current one,
with no rebuild.

## What the box needs

- An ssh key that works non-interactively (`BatchMode=yes`).
- Passwordless sudo for the deploy user (systemd, nginx, certbot, apt).
- For a private repo, a read-only deploy key on the box for your git host.
- DNS for your domains already pointing at the box, so certbot can issue a
  certificate. Until then the site serves plain http, and the next deploy
  retries.

## Development

```bash
pnpm vitest run packages/targets/deploy-ssh
```

The end-to-end test runs the real `deploy-remote.sh` and `install.sh` locally,
against a throwaway git repo. It covers the first deploy, a second deploy, a
broken release that is restored, rollback and pruning.
