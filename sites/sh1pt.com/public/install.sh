#!/usr/bin/env sh
# sh1pt installer — curl -fsSL sh1pt.com/install.sh | sh
set -e

if command -v bun >/dev/null 2>&1; then
  echo "[sh1pt] installing via bun"
  bun install -g @sh1pt/cli
elif command -v npm >/dev/null 2>&1; then
  echo "[sh1pt] installing via npm"
  npm install -g @sh1pt/cli
elif command -v deno >/dev/null 2>&1; then
  echo "[sh1pt] installing via deno"
  deno install -g -A -f -n sh1pt jsr:@sh1pt/cli
else
  echo "sh1pt needs a JS runtime. Install one of:"
  echo "  bun   https://bun.sh"
  echo "  node  https://nodejs.org"
  echo "  deno  https://deno.com"
  exit 1
fi

echo "[sh1pt] done — run: sh1pt --help"
