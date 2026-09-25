# @profullstack/sh1pt-migrate

Move an application and its data between platforms, in either direction.

`packages/cloud/*` provisions machines. This moves what lives on them.

```bash
sh1pt migrate platforms                      # what can move where
sh1pt migrate platforms --from supabase      # ...and out of one place
sh1pt migrate inventory --from supabase -c m.json
sh1pt migrate plan  --from supabase --to ssh -c m.json
sh1pt migrate apply --from supabase --to ssh -c m.json --until freeze
sh1pt migrate apply --from supabase --to ssh -c m.json
```

## Why it is bidirectional without twice the code

Two layers, and the split is the whole design:

- **Platforms** answer *what have I got, and what are the credentials* — Railway,
  Supabase, Turso, Neon, PlanetScale, Fly, Render, Heroku, Vercel, a box over ssh.
  A platform never moves a byte.
- **Engines** move bytes — `postgres`, `sqlite`, `redis`, `object-storage`, `files`.
  An engine does not know which vendor is on either end.

So `supabase → ssh` and `ssh → supabase` are the same code path, and a new
platform costs one `inventory()` rather than one adapter per existing platform.
Direction is not a property of the system; it is which platform you named first.

`compatibleKinds('turso', 'neon')` returns `[]` — sqlite against postgres — and
says so in a millisecond rather than at a cutover.

## The plan is the product

`migrate plan` touches nothing, calls nothing, and is safe against production.
It reports what moves, what does not and why, an ordered list of steps, and the
risks. Read it, disagree with it, then apply it.

Phase order is enforced, not documented:

| phase | what happens |
|---|---|
| `check` | credentials and binaries, so a missing `pg_dump` costs a second not three hours |
| `bulk` | the long copy, while the source is still live and serving |
| `freeze` | stop the writers. **Downtime starts here** |
| `delta` | only what changed during `bulk` |
| `cutover` | point DNS at the target |
| `enable` | start the writers again, on the target only |
| `verify` | prove it worked while the old system still exists |

Scheduled jobs are stopped on the source before they are started on the target,
because a cron firing on both sides is how a migration sends every customer a
duplicate email. Dropping the source is not a phase — that is a decision a
person makes days later, and this tool does not offer it.

`--until freeze` runs the entire bulk copy and stops before anything goes down.
That is how you rehearse against production.

## The trap this exists for

An app that stores a whole URL instead of a key leaves rows pointing at the
account you just left:

```
https://ywcizjsgrcmhgyplldac.supabase.co/storage/v1/object/public/ads/x.png
```

Migrate everything, cut DNS over, check the site: every image loads — because
the **old** account is still serving them. The day it is closed, which is the
entire point of migrating and happens weeks later, all of them 404 at once and
nothing connects the outage to the migration.

crawlproof.com had 2,928 such rows across four tables. So the rewrite is a
first-class step: every text-ish column is scanned (broad on purpose — a column
called `notes` holding a pasted URL breaks exactly as badly as one called
`image_url`), rewritten inside one transaction, and then asserted to be zero.

```bash
--rewrite-host ywcizjsgrcmhgyplldac.supabase.co=https://cdn.example.com
```

The Supabase platform emits that exact flag for its own hostname, so it is a
line to copy rather than a thing to remember.

## Safety properties, stated plainly

- **Nothing deletes.** `rclone copy`, never `sync`. No `rsync --delete`. No
  `pg_restore --clean`. A non-empty Postgres target is refused rather than
  overwritten.
- **Credentials never reach a plan file.** Connections are a
  `describe()`/`reveal()` pair; a test asserts a rendered plan contains no
  password.
- **Credentials never reach `argv`.** libpq environment variables for Postgres,
  `RCLONE_CONFIG_*` for object storage, `TURSO_API_TOKEN` for Turso. `ps` is
  world-readable and a dump runs for hours.
- **No shell.** `spawn` without one, always — engine arguments come from config
  a person edits.
- **Resumable.** The staging ledger is append-only JSONL, so an interrupted run
  can only truncate its last line, and the next run skips what is done.

## Config

```json
{
  "from": {
    "projectRef": "abc123",
    "dbPassword": "...",
    "buckets": ["ads", "articles"]
  },
  "to": {
    "host": "dev2.example.com",
    "user": "anthony",
    "postgres": [{ "name": "postgres", "url": "postgres://app@127.0.0.1:5432/app" }]
  }
}
```

Secrets are read from the environment where a platform names one
(`SUPABASE_SERVICE_ROLE_KEY`, `RAILWAY_TOKEN`, `TURSO_API_TOKEN`,
`NEON_DATABASE_URL`, …), so they need not be in the file.

## What it needs installed

Per engine, checked before anything runs: `pg_dump`/`pg_restore`/`psql`,
`mysqldump`/`mysql`,
`sqlite3`, `redis-cli`, `rclone`, `rsync`.

## Known limits

- The Postgres delta covers **inserts into tables with a timestamp column**, not
  updates or deletes. The planner says so rather than implying otherwise.
- Redis has no delta at all. Stop the writers first.
- rsync cannot copy remote to remote; one side must be local.
- A Railway volume is only reachable from inside its service.
