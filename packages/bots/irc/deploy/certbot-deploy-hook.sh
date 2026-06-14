#!/usr/bin/env bash
# Installed to /etc/letsencrypt/renewal-hooks/deploy/reload-ergo.sh
# certbot runs every deploy hook after a successful renewal. Reload Ergo so it
# picks up the new cert without dropping client connections (SIGHUP = rehash).
set -euo pipefail

# Only act when the irc.profullstack.com cert was (re)issued.
case "${RENEWED_LINEAGE:-}" in
  */irc.profullstack.com) systemctl reload ergo ;;
  *) : ;;  # some other cert renewed; nothing to do
esac
