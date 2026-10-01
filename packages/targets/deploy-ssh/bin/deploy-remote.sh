#!/usr/bin/env bash
# deploy-remote.sh: the server half of `sh1pt ship --target deploy-ssh`.
#
# sh1pt pipes this over `ssh <host> bash -s`, preceded by `export` lines that
# set the variables below, so nothing secret ever appears in argv or `ps`.
#
#   ACTION        deploy | status | rollback
#   APP           app name
#   ROOT          app root; relative paths are under $HOME
#   SOURCE        git | rsync
#   REPO          any git URL the box can read (GitHub, GitLab, Codeberg, self-hosted)
#   REF           branch, tag or sha to deploy (git); recorded sha (rsync)
#   RELEASE       release id, sortable: <UTC yyyymmddHHMMSS>-<sha7>
#   KEEP          releases to keep
#   APP_ENV_B64   base64 of shared/app.env, written 0600 when ENV_MANAGED=1
#   FALLBACK_B64  base64 of the generic bin/install.sh, used when the repo has none
#   TO            rollback: release to return to (default: the one before current)
#
# Layout:  ROOT/repo.git (mirror)  ROOT/releases/<id>  ROOT/current -> releases/<id>
#          ROOT/shared/{app.env,db.env,run.sh,install.sh,deploys.log}
#
# The repo's bin/install.sh does the real work (see its header); this script
# only places code, flips `current`, and puts it back when activation fails.

set -euo pipefail

say() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

cd "$HOME"
mkdir -p "$ROOT"
ROOT="$(cd "$ROOT" && pwd)"
mkdir -p "$ROOT/releases" "$ROOT/shared"
chmod 700 "$ROOT/shared"
KEEP="${KEEP:-5}"

export APP STATE_DIR="$ROOT/shared" APP_DIR="$ROOT/current"

installer_for() {
  if [ -f "$1/bin/install.sh" ]; then
    printf '%s\n' "$1/bin/install.sh"
  else
    printf '%s' "$FALLBACK_B64" | base64 -d > "$ROOT/shared/install.sh"
    chmod 755 "$ROOT/shared/install.sh"
    printf '%s\n' "$ROOT/shared/install.sh"
  fi
}

run_phase() {
  local dir="$1" phase="$2" inst
  inst="$(installer_for "$dir")"
  ( cd "$dir" && SRC_DIR="$dir" bash "$inst" "$phase" )
}

flip() {
  ln -sfn "$1" "$ROOT/current.next"
  mv -Tf "$ROOT/current.next" "$ROOT/current"
}

current_release() { if [ -L "$ROOT/current" ]; then basename "$(readlink "$ROOT/current")"; fi; }

record() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$ROOT/shared/deploys.log"; }

prune() {
  local cur keep_n=0 name
  cur="$(current_release)"
  # shellcheck disable=SC2012
  for name in $(ls -1 "$ROOT/releases" | sort -r); do
    keep_n=$((keep_n + 1))
    [ "$name" = "$cur" ] && continue
    [ "$keep_n" -le "$KEEP" ] && continue
    rm -rf "${ROOT:?}/releases/$name"
    say "pruned $name"
  done
}

activate_or_restore() {
  local rel="$1" prev="$2"
  flip "$rel"
  if run_phase "$rel" activate; then return 0; fi
  if [ -n "$prev" ] && [ -d "$ROOT/releases/$prev" ]; then
    say "activation failed, returning to $prev"
    flip "$ROOT/releases/$prev"
    run_phase "$ROOT/releases/$prev" activate || say "WARNING: $prev did not come back healthy either"
  fi
  return 1
}

do_deploy() {
  local rel="$ROOT/releases/$RELEASE" sha prev
  case "$SOURCE" in
    git)
      command -v git >/dev/null || die "git is not installed on this box"
      [ "$(current_release)" = "$RELEASE" ] && die "release $RELEASE is already current"
      if [ -d "$ROOT/repo.git" ]; then
        git -C "$ROOT/repo.git" remote set-url origin "$REPO"
        git -C "$ROOT/repo.git" remote update --prune >/dev/null
      else
        say "cloning $REPO"
        git clone --quiet --mirror "$REPO" "$ROOT/repo.git"
      fi
      sha="$(git -C "$ROOT/repo.git" rev-parse --verify --quiet "$REF^{commit}")" \
        || die "$REF is not in $REPO (pushed?)"
      rm -rf "$rel"
      mkdir -p "$rel"
      git -C "$ROOT/repo.git" archive "$sha" | tar -x -C "$rel"
      ;;
    rsync)
      [ -d "$rel" ] && [ -n "$(ls -A "$rel")" ] || die "rsync left nothing in $rel"
      sha="$REF"
      ;;
    *) die "SOURCE must be git or rsync" ;;
  esac
  printf 'RELEASE=%s\nSHA=%s\n' "$RELEASE" "$sha" > "$rel/.sh1pt-release"
  say "release $RELEASE ($sha)"

  if [ "${ENV_MANAGED:-0}" = 1 ]; then
    ( umask 077; printf '%s' "$APP_ENV_B64" | base64 -d > "$ROOT/shared/app.env.next" )
    mv -f "$ROOT/shared/app.env.next" "$ROOT/shared/app.env"
  fi

  prev="$(current_release)"
  if ! run_phase "$rel" setup || ! run_phase "$rel" build; then
    record "$RELEASE" build-failed
    die "build failed; $prev is still current"
  fi
  if ! activate_or_restore "$rel" "$prev"; then
    record "$RELEASE" failed
    die "release $RELEASE failed to activate"
  fi
  record "$RELEASE" ok
  prune
  printf 'SH1PT release=%s sha=%s previous=%s\n' "$RELEASE" "$sha" "$prev"
}

do_status() {
  local cur
  cur="$(current_release)"
  printf 'SH1PT current=%s\n' "$cur"
  # shellcheck disable=SC2012
  printf 'SH1PT releases=%s\n' "$(ls -1 "$ROOT/releases" | sort -r | tr '\n' ' ')"
  [ -n "$cur" ] && run_phase "$ROOT/releases/$cur" status | sed 's/^/SH1PT /'
  return 0
}

do_rollback() {
  local cur to
  cur="$(current_release)"
  to="${TO:-}"
  if [ -z "$to" ]; then
    # shellcheck disable=SC2012
    to="$(ls -1 "$ROOT/releases" | sort -r | awk -v c="$cur" 'f { print; exit } $0 == c { f = 1 }')"
  fi
  [ -n "$to" ] || die "no release before $cur to roll back to"
  [ -d "$ROOT/releases/$to" ] || die "release $to does not exist"
  say "rolling back $cur -> $to"
  if ! activate_or_restore "$ROOT/releases/$to" "$cur"; then
    record "$to" rollback-failed
    die "rollback to $to failed"
  fi
  record "$to" rollback
  printf 'SH1PT release=%s previous=%s\n' "$to" "$cur"
}

case "$ACTION" in
  deploy) do_deploy ;;
  status) do_status ;;
  rollback) do_rollback ;;
  *) die "ACTION must be deploy, status or rollback" ;;
esac
