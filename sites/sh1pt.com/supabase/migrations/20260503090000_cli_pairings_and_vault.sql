-- sh1pt CLI pairing + encrypted-vault schema.
--
-- Three concerns:
--   1. cli_pairings  — short-lived device-code rows for `sh1pt login`.
--                      CLI POSTs /api/v1/cli/pair anonymously to mint one;
--                      the signed-in user approves it on /cli/login;
--                      CLI claims the access token via /api/v1/cli/claim.
--                      Routes use the service role; RLS denies all direct
--                      access so a stolen anon key can't read other people's
--                      pending codes.
--
--   2. vault_keys    — Argon2id KDF parameters per user. The key itself is
--                      derived client-side from a vault passphrase; the
--                      server only sees salt + ops/mem so the CLI can
--                      reproduce the key on a fresh machine. RLS: owner.
--
--   3. vault_entries — Encrypted secret blobs. Plaintext NEVER reaches the
--                      server: the CLI runs crypto_secretbox_easy(plaintext,
--                      nonce, derived_key) and uploads { nonce, ciphertext }.
--                      RLS: owner.
--
-- Pairing codes expire in 10 minutes. We don't auto-clean them; volume is
-- low (handful per user per device) and Postgres handles thousands fine.

-- ---------- cli_pairings -------------------------------------------------

create table cli_pairings (
  device_code  text primary key,                                  -- 256-bit base64url; CLI keeps this
  user_code    text not null unique,                              -- short human code; user types this
  user_id      uuid references auth.users(id) on delete cascade,  -- null until approved
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes'
);

create index cli_pairings_user_code_idx on cli_pairings(user_code);
create index cli_pairings_expires_at_idx on cli_pairings(expires_at);

alter table cli_pairings enable row level security;

-- Service-role-only — anon and authenticated users get no direct access.
-- The /api/v1/cli/* route handlers use the service role to manage rows.
create policy "cli_pairings: deny all"
  on cli_pairings for all using (false);

-- ---------- vault_keys ---------------------------------------------------

create table vault_keys (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  kdf_salt     bytea not null,           -- 16 random bytes (Argon2id salt)
  kdf_opslimit integer not null,         -- Argon2id ops; libsodium "interactive" = 2
  kdf_memlimit integer not null,         -- Argon2id mem in bytes; "interactive" = 64 MB
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table vault_keys enable row level security;

create policy "vault_keys: owner select"
  on vault_keys for select
  using (user_id = auth.uid());

create policy "vault_keys: owner insert"
  on vault_keys for insert
  with check (user_id = auth.uid());

create policy "vault_keys: owner update"
  on vault_keys for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- vault_entries ------------------------------------------------

create table vault_entries (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null check (length(key) between 1 and 200),
  nonce      bytea not null,                          -- 24 bytes (XSalsa20)
  ciphertext bytea not null check (octet_length(ciphertext) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table vault_entries enable row level security;

create policy "vault_entries: owner select"
  on vault_entries for select
  using (user_id = auth.uid());

create policy "vault_entries: owner insert"
  on vault_entries for insert
  with check (user_id = auth.uid());

create policy "vault_entries: owner update"
  on vault_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "vault_entries: owner delete"
  on vault_entries for delete
  using (user_id = auth.uid());

-- updated_at autotouch
create or replace function vault_touch_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger vault_keys_touch
  before update on vault_keys
  for each row execute function vault_touch_updated_at();

create trigger vault_entries_touch
  before update on vault_entries
  for each row execute function vault_touch_updated_at();
