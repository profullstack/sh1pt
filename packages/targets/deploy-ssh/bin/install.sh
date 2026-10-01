#!/usr/bin/env bash
# install.sh: put this app into service on the box it runs on. Idempotent.
#
# Copy it to <repo>/bin/install.sh. Run it on the server from a checkout:
#
#   ./bin/install.sh            # setup + build + activate
#   ./bin/install.sh setup      # runtime (bun/node), postgres, redis
#   ./bin/install.sh build      # dependencies + build, in the checkout
#   ./bin/install.sh activate   # systemd unit, nginx + TLS, restart, health check
#   ./bin/install.sh status
#
# Every step checks before it acts, so running it twice changes nothing the
# second time. It never touches a systemd unit or nginx site it did not write
# (each carries a "managed by bin/install.sh" marker).
#
# Settings come from bin/install.conf (KEY=value lines, committed, no secrets)
# and from the environment, which wins. Secrets go in $STATE_DIR/app.env, which
# `sh1pt ship --target deploy-ssh` writes from the vault.
#
#   APP            name, used for the unit and the nginx site (default: repo dir name)
#   RUNTIME        auto | bun | node | static          (default: auto, from lockfiles)
#   INSTALL_CMD    auto | none | <command>             (default: auto, from lockfiles)
#   BUILD_CMD      none | <command>  (default: "<pm> run build" if package.json has one)
#   START_CMD      <command>         (default: "<pm> run start" if package.json has one)
#   PORT           the app listens here, on loopback   (default: 3000)
#   HEALTH_PATH    GET this until it answers 2xx/3xx   (default: /)
#   HEALTH_TIMEOUT seconds                             (default: 120)
#   DOMAINS        "example.com www.example.com": nginx site for them, none if empty
#   TLS            1 | 0: Let's Encrypt via certbot    (default: 1)
#   TLS_EMAIL      ACME account email                  (default: none)
#   STATIC_DIR     RUNTIME=static: directory nginx serves (default: dist)
#   SPA            1: unknown paths fall back to /index.html (default: 0)
#   POSTGRES       0 | 1 | <dbname>: local database, DATABASE_URL in db.env (default: 0)
#   REDIS          0 | 1: local redis, REDIS_URL in db.env                 (default: 0)
#   MAX_BODY       nginx client_max_body_size          (default: 100m)
#   SRC_DIR        the checkout to build               (default: this script's repo)
#   APP_DIR        where the service runs from         (default: SRC_DIR)
#   STATE_DIR      app.env, db.env, run.sh             (default: ~/.local/share/<APP>)
#   UNIT           systemd unit name, without .service (default: APP)
#   SYSTEMD        auto | system | user: a system unit (needs sudo) or a
#                  `systemctl --user` unit with linger   (default: auto)
#
# Canonical copy: sh1pt packages/targets/deploy-ssh/bin/install.sh. cli-tools
# vendors it; change it there first.

set -euo pipefail

MARKER="# managed by bin/install.sh"

log() { printf '[install] %s\n' "$*"; }
warn() { printf '[install] WARN: %s\n' "$*" >&2; }
die() { printf '[install] ERROR: %s\n' "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# KEY=value lines, ignoring comments; the environment wins over the file.
load_conf() {
  local file="$1" line key value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    case "$key" in *[!A-Za-z0-9_]*|'') continue ;; esac
    case "$value" in \"*\") value="${value#\"}"; value="${value%\"}" ;; \'*\') value="${value#\'}"; value="${value%\'}" ;; esac
    if [ -z "${!key+x}" ]; then
      printf -v "$key" '%s' "$value"
      export "${key?}"
    fi
  done < "$file"
}

if [ -z "${SRC_DIR:-}" ]; then
  if [ "$(basename "$SCRIPT_DIR")" = bin ]; then SRC_DIR="$(dirname "$SCRIPT_DIR")"; else SRC_DIR="$(pwd)"; fi
fi
SRC_DIR="$(cd "$SRC_DIR" && pwd)"
load_conf "$SRC_DIR/bin/install.conf"

sanitize() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | sed 's/^-*//; s/-*$//'; }

APP="$(sanitize "${APP:-$(basename "$SRC_DIR")}")"
[ -n "$APP" ] || die "APP is empty"
UNIT="${UNIT:-$APP}"
SYSTEMD="${SYSTEMD:-auto}"
APP_DIR="${APP_DIR:-$SRC_DIR}"
STATE_DIR="${STATE_DIR:-$HOME/.local/share/$APP}"
PORT="${PORT:-3000}"
HEALTH_PATH="${HEALTH_PATH:-/}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
DOMAINS="$(printf '%s' "${DOMAINS:-}" | tr ',' ' ' | xargs)"
TLS="${TLS:-1}"
TLS_EMAIL="${TLS_EMAIL:-}"
STATIC_DIR="${STATIC_DIR:-dist}"
SPA="${SPA:-0}"
POSTGRES="${POSTGRES:-0}"
REDIS="${REDIS:-0}"
MAX_BODY="${MAX_BODY:-100m}"
SERVICE_USER="$(id -un)"

case "$PORT" in ''|*[!0-9]*) die "PORT must be a number, got '$PORT'" ;; esac
case "$HEALTH_TIMEOUT" in ''|*[!0-9]*) die "HEALTH_TIMEOUT must be a number" ;; esac
case "$HEALTH_PATH" in /*) ;; *) die "HEALTH_PATH must start with /" ;; esac
for d in $DOMAINS; do
  printf '%s' "$d" | grep -Eq '^[A-Za-z0-9*]([A-Za-z0-9.-]*[A-Za-z0-9])?$' || die "bad domain '$d'"
done

export PATH="$HOME/.bun/bin:$PATH"

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo -n"; fi
need_root() {
  $SUDO true 2>/dev/null || die "$1 needs root: run as root or give $(id -un) passwordless sudo"
}

apt_install() {
  command -v apt-get >/dev/null || die "install $* by hand (no apt-get on this box)"
  need_root "installing $*"
  log "apt-get install $*"
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null \
    || { $SUDO apt-get update -qq >/dev/null && $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null; }
}

# Write stdin to $1 (mode $2) only when the content differs. Sets CHANGED=1.
# AS prefixes every touch of the file: $SUDO for /etc, empty for ~/.config.
CHANGED=0
AS="$SUDO"
put_root_file() {
  local dest="$1" mode="$2" tmp
  tmp="$(mktemp)"
  cat > "$tmp"
  if $AS test -f "$dest" && $AS cmp -s "$tmp" "$dest"; then rm -f "$tmp"; return 0; fi
  $AS install -m "$mode" "$tmp" "$dest"
  rm -f "$tmp"
  CHANGED=1
}

# Refuse to overwrite a file we did not write.
assert_ours() {
  if $AS test -f "$1" && ! $AS grep -qF "$MARKER" "$1"; then
    die "$1 exists and was not written by bin/install.sh; move it aside or set UNIT/APP to another name"
  fi
}

has_script() { [ -f "$SRC_DIR/package.json" ] && grep -Eq "\"$1\"[[:space:]]*:" "$SRC_DIR/package.json"; }

detect() {
  if [ "${RUNTIME:-auto}" = auto ]; then
    if [ -f "$SRC_DIR/bun.lock" ] || [ -f "$SRC_DIR/bun.lockb" ]; then RUNTIME=bun
    elif [ -f "$SRC_DIR/pnpm-lock.yaml" ] || [ -f "$SRC_DIR/package-lock.json" ] || [ -f "$SRC_DIR/yarn.lock" ]; then RUNTIME=node
    elif [ -f "$SRC_DIR/package.json" ]; then RUNTIME=bun
    else RUNTIME=static
    fi
  fi
  case "$RUNTIME" in bun|node|static) ;; *) die "RUNTIME must be auto, bun, node or static" ;; esac

  PM=""
  if [ "$RUNTIME" = bun ]; then PM=bun
  elif [ -f "$SRC_DIR/pnpm-lock.yaml" ]; then PM="corepack pnpm"
  elif [ -f "$SRC_DIR/yarn.lock" ]; then PM="corepack yarn"
  elif [ -f "$SRC_DIR/package.json" ]; then PM=npm
  fi

  if [ "${INSTALL_CMD:-auto}" = auto ]; then
    if [ -f "$SRC_DIR/bun.lock" ] || [ -f "$SRC_DIR/bun.lockb" ]; then INSTALL_CMD="bun install --frozen-lockfile"
    elif [ -f "$SRC_DIR/pnpm-lock.yaml" ]; then INSTALL_CMD="corepack pnpm install --frozen-lockfile"
    elif [ -f "$SRC_DIR/package-lock.json" ]; then INSTALL_CMD="npm ci"
    elif [ -f "$SRC_DIR/yarn.lock" ]; then INSTALL_CMD="corepack yarn install --frozen-lockfile"
    elif [ -f "$SRC_DIR/package.json" ]; then INSTALL_CMD="$PM install"
    else INSTALL_CMD=none
    fi
  fi
  if [ -z "${BUILD_CMD:-}" ]; then
    if has_script build; then BUILD_CMD="$PM run build"; else BUILD_CMD=none; fi
  fi
  if [ -z "${START_CMD:-}" ] && [ "$RUNTIME" != static ]; then
    if has_script start; then START_CMD="$PM run start"; else die "no START_CMD and package.json has no start script"; fi
  fi
}

# Sets SCTL, JCTL, UNIT_FILE and AS for a system or a per-user unit.
systemd_mode() {
  local mode="$SYSTEMD"
  if [ "$mode" = auto ]; then
    if $SUDO true 2>/dev/null; then mode=system; else mode=user; fi
  fi
  case "$mode" in
    system)
      SCTL="$SUDO systemctl"; JCTL="$SUDO journalctl -u"; AS="$SUDO"
      UNIT_FILE="/etc/systemd/system/$UNIT.service"; WANTED_BY=multi-user.target ;;
    user)
      export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
      SCTL="systemctl --user"; JCTL="journalctl --user -u"; AS=""
      UNIT_FILE="$HOME/.config/systemd/user/$UNIT.service"; WANTED_BY=default.target ;;
    *) die "SYSTEMD must be auto, system or user" ;;
  esac
  SYSTEMD_MODE="$mode"
}

load_env() {
  set -a
  # shellcheck disable=SC1091
  [ -f "$STATE_DIR/db.env" ] && . "$STATE_DIR/db.env"
  # shellcheck disable=SC1091
  [ -f "$STATE_DIR/app.env" ] && . "$STATE_DIR/app.env"
  set +a
}

env_has() { [ -f "$STATE_DIR/db.env" ] && grep -q "^$1=" "$STATE_DIR/db.env"; }

setup_postgres() {
  [ "$POSTGRES" = 0 ] && return 0
  local db="$POSTGRES" port pw
  [ "$db" = 1 ] && db="$(printf '%s' "$APP" | tr '-' '_')"
  printf '%s' "$db" | grep -Eq '^[a-z_][a-z0-9_]{0,62}$' || die "POSTGRES database name '$db' is not a plain identifier"
  need_root "postgres"
  if ! command -v psql >/dev/null || ! $SUDO test -d /etc/postgresql; then
    if command -v ss >/dev/null && [ -n "$(ss -ltnH 'sport = :5432' 2>/dev/null)" ]; then
      die "something already listens on 5432 (a docker postgres?); point DATABASE_URL at it in app.env and set POSTGRES=0"
    fi
    apt_install postgresql
  fi
  if env_has DATABASE_URL; then log "postgres: $db already provisioned"; return 0; fi
  port="$(sudo -n -u postgres psql -tAc 'SHOW port' | tr -d '[:space:]')"
  pw="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -q -v role="$db" -v pw="$pw" <<'SQL'
SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
  THEN format('ALTER ROLE %I LOGIN PASSWORD %L', :'role', :'pw')
  ELSE format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'pw') END \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'role', :'role')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'role') \gexec
SQL
  ( umask 077; printf "DATABASE_URL='postgres://%s:%s@127.0.0.1:%s/%s'\n" "$db" "$pw" "$port" "$db" >> "$STATE_DIR/db.env" )
  log "postgres: created $db, DATABASE_URL in $STATE_DIR/db.env"
}

setup_redis() {
  [ "$REDIS" = 0 ] && return 0
  command -v redis-server >/dev/null || apt_install redis-server
  env_has REDIS_URL && return 0
  ( umask 077; printf "REDIS_URL='redis://127.0.0.1:6379'\n" >> "$STATE_DIR/db.env" )
  log "redis: REDIS_URL in $STATE_DIR/db.env"
}

phase_setup() {
  detect
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  [ -f "$STATE_DIR/app.env" ] || ( umask 077; : > "$STATE_DIR/app.env" )
  case "$RUNTIME" in
    bun)
      if ! command -v bun >/dev/null; then
        command -v curl >/dev/null || apt_install curl
        command -v unzip >/dev/null || apt_install unzip
        log "installing bun for $(id -un)"
        curl -fsSL https://bun.sh/install | bash >/dev/null
      fi ;;
    node)
      command -v node >/dev/null || die "node is not installed (RUNTIME=node); install Node 22+ first" ;;
  esac
  setup_postgres
  setup_redis
  log "setup ok: runtime=$RUNTIME state=$STATE_DIR"
}

phase_build() {
  detect
  load_env
  cd "$SRC_DIR"
  if [ "$INSTALL_CMD" != none ]; then log "install: $INSTALL_CMD"; bash -c "$INSTALL_CMD"; fi
  if [ "$BUILD_CMD" != none ]; then log "build: $BUILD_CMD"; NODE_ENV=production bash -c "$BUILD_CMD"; fi
  log "build ok"
}

write_unit() {
  local unit="$UNIT_FILE" user_line="User=$SERVICE_USER"
  if [ "$SYSTEMD_MODE" = user ]; then user_line="# per-user unit"; mkdir -p "$(dirname "$unit")"; fi
  assert_ours "$unit"
  # The service gets the same bun/node the build used, wherever it lives (mise, nvm, ~/.bun).
  local unit_path="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin" rt
  rt="$(command -v "$RUNTIME" 2>/dev/null || true)"
  if [ -n "$rt" ]; then unit_path="$(dirname "$rt"):$unit_path"; fi
  ( umask 077; printf '#!/usr/bin/env bash\n%s\ncd %q\nexec %s\n' "$MARKER" "$APP_DIR" "$START_CMD" > "$STATE_DIR/run.sh.tmp" )
  chmod 700 "$STATE_DIR/run.sh.tmp"
  if cmp -s "$STATE_DIR/run.sh.tmp" "$STATE_DIR/run.sh" 2>/dev/null; then rm -f "$STATE_DIR/run.sh.tmp"; else mv "$STATE_DIR/run.sh.tmp" "$STATE_DIR/run.sh"; CHANGED=1; fi
  put_root_file "$unit" 0644 <<EOF
$MARKER
[Unit]
Description=$APP ($RUNTIME)
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target

[Service]
Type=simple
$user_line
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=NODE_ENV=production
Environment=PATH=$unit_path
EnvironmentFile=-$STATE_DIR/db.env
EnvironmentFile=-$STATE_DIR/app.env
ExecStart=$STATE_DIR/run.sh
Restart=always
RestartSec=2

[Install]
WantedBy=$WANTED_BY
EOF
}

nginx_conf() {
  local cert="$1" first
  first="${DOMAINS%% *}"
  local body
  if [ "$RUNTIME" = static ]; then
    local fallback='=404'
    [ "$SPA" = 1 ] && fallback='/index.html'
    body="    root $APP_DIR/$STATIC_DIR;
    index index.html;
    location / { try_files \$uri \$uri.html \$uri/ $fallback; }"
  else
    body="    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$http_connection;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }"
  fi
  printf '%s %s\n' "$MARKER" "$APP"
  if [ "$cert" = 1 ]; then
    cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAINS;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAINS;
    ssl_certificate /etc/letsencrypt/live/$first/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$first/privkey.pem;
    client_max_body_size $MAX_BODY;
$body
}
EOF
  else
    cat <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAINS;
    client_max_body_size $MAX_BODY;
$body
}
EOF
  fi
}

write_nginx() {
  [ -n "$DOMAINS" ] || return 0
  need_root "nginx"
  AS="$SUDO"
  command -v nginx >/dev/null || apt_install nginx
  local conf link="" first cert=0
  if [ -d /etc/nginx/sites-available ]; then
    conf="/etc/nginx/sites-available/$APP.conf"; link="/etc/nginx/sites-enabled/$APP.conf"
  else
    conf="/etc/nginx/conf.d/$APP.conf"
  fi
  assert_ours "$conf"
  first="${DOMAINS%% *}"
  $SUDO test -f "/etc/letsencrypt/live/$first/fullchain.pem" && cert=1

  local backup
  backup="$(mktemp)"
  $SUDO cat "$conf" > "$backup" 2>/dev/null || : > "$backup"
  CHANGED=0
  nginx_conf "$cert" | put_root_file "$conf" 0644
  [ -n "$link" ] && { $SUDO test -L "$link" || { $SUDO ln -sfn "$conf" "$link"; CHANGED=1; }; }
  if [ "$CHANGED" = 1 ]; then
    if ! $SUDO nginx -t >/dev/null 2>&1; then
      $SUDO nginx -t || true
      if [ -s "$backup" ]; then $SUDO install -m 0644 "$backup" "$conf"; else $SUDO rm -f "$conf" "$link"; fi
      rm -f "$backup"
      die "nginx -t failed; restored the previous $conf"
    fi
    $SUDO systemctl reload nginx
    log "nginx: $conf reloaded"
  fi
  rm -f "$backup"

  if [ "$TLS" = 1 ] && [ "$cert" = 0 ]; then
    command -v certbot >/dev/null || apt_install certbot python3-certbot-nginx
    local args=(certonly --nginx --non-interactive --agree-tos --cert-name "$first")
    for d in $DOMAINS; do args+=(-d "$d"); done
    if [ -n "$TLS_EMAIL" ]; then args+=(-m "$TLS_EMAIL"); else args+=(--register-unsafely-without-email); fi
    if $SUDO certbot "${args[@]}"; then
      nginx_conf 1 | put_root_file "$conf" 0644
      $SUDO nginx -t && $SUDO systemctl reload nginx
      log "tls: certificate issued for $DOMAINS"
    else
      warn "certbot failed (does DNS for $first point here yet?); serving plain http, the next run retries"
    fi
  fi
}

health() {
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) url="http://127.0.0.1:$PORT$HEALTH_PATH"
  log "health: waiting for $url (up to ${HEALTH_TIMEOUT}s)"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; then log "health ok"; return 0; fi
    sleep 2
  done
  warn "no healthy answer from $url"
  $JCTL "$UNIT" -n 40 --no-pager 2>/dev/null || true
  return 1
}

phase_activate() {
  detect
  mkdir -p "$STATE_DIR"
  if [ "$RUNTIME" = static ]; then
    [ -d "$APP_DIR/$STATIC_DIR" ] || die "RUNTIME=static but $APP_DIR/$STATIC_DIR does not exist"
    [ -n "$DOMAINS" ] || warn "RUNTIME=static and no DOMAINS: nothing serves this"
    write_nginx
    log "activate ok (static)"
    return 0
  fi
  systemd_mode
  if [ "$SYSTEMD_MODE" = user ] && [ "$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)" != yes ]; then
    loginctl enable-linger "$(id -un)" 2>/dev/null \
      || warn "could not enable linger: $UNIT stops when $(id -un) logs out (run: sudo loginctl enable-linger $(id -un))"
  fi
  CHANGED=0
  write_unit
  if [ "$CHANGED" = 1 ]; then $SCTL daemon-reload; fi
  $SCTL enable "$UNIT" >/dev/null 2>&1
  log "restarting $UNIT ($SYSTEMD_MODE unit)"
  $SCTL restart "$UNIT"
  health || exit 3
  write_nginx
  log "activate ok"
}

phase_status() {
  detect
  printf 'app=%s\nruntime=%s\nsrc=%s\napp_dir=%s\nstate=%s\n' "$APP" "$RUNTIME" "$SRC_DIR" "$APP_DIR" "$STATE_DIR"
  if [ "$RUNTIME" != static ]; then
    systemd_mode
    printf 'unit=%s\nsystemd=%s\nactive=%s\n' "$UNIT" "$SYSTEMD_MODE" "$($SCTL is-active "$UNIT" 2>/dev/null || true)"
    printf 'health=%s\n' "$(curl -fsS -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:$PORT$HEALTH_PATH" 2>/dev/null || echo down)"
  fi
  [ -n "$DOMAINS" ] && printf 'domains=%s\n' "$DOMAINS"
  return 0
}

case "${1:-all}" in
  setup) phase_setup ;;
  build) phase_build ;;
  activate) phase_activate ;;
  status) phase_status ;;
  all) phase_setup; phase_build; phase_activate ;;
  -h|--help|help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown phase '$1' (setup | build | activate | status | all)" ;;
esac
