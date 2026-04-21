#!/usr/bin/env sh
# sh1pt installer — curl -fsSL https://sh1pt.com/install.sh | sh
set -e

PKG="@profullstack/sh1pt"

if command -v bun >/dev/null 2>&1; then
  echo "[sh1pt] installing $PKG via bun"
  bun install -g "$PKG"
elif command -v npm >/dev/null 2>&1; then
  echo "[sh1pt] installing $PKG via npm"
  npm install -g "$PKG"
elif command -v deno >/dev/null 2>&1; then
  echo "[sh1pt] installing $PKG via deno"
  deno install -g -A -f -n sh1pt "npm:$PKG"
else
  echo "sh1pt needs a JS runtime. Install one of:"
  echo "  bun   https://bun.sh"
  echo "  node  https://nodejs.org"
  echo "  deno  https://deno.com"
  exit 1
fi

echo "[sh1pt] done — run: sh1pt --help"
