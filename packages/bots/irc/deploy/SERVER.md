# irc.profullstack.com — TLS-only ircd deployment

Runbook for hosting the Profullstack IRC endpoint on a DigitalOcean droplet
using [Ergo](https://github.com/ergochat/ergo) (single-binary Go ircd).

**Design goal: accept only SSL/TLS connections.** This is enforced *not* by DNS
(a hostname carries no port) but by binding a single TLS listener on `6697` and
never opening the cleartext `6667` port — at the firewall and in the ircd config.

Pinned: Ergo **v2.18.0**.

---

## 1. DNS

```
A    irc.profullstack.com -> <droplet-ipv4>
AAAA irc.profullstack.com -> <droplet-ipv6>   # optional
```

## 2. Firewall (this is what makes it SSL-only at the network edge)

```bash
ufw allow 22/tcp
ufw allow 6697/tcp        # IRC over TLS
ufw allow 80/tcp          # ONLY needed during cert issuance/renewal (http-01)
ufw enable
# 6667 is never opened -> plaintext IRC is unreachable from the internet
```

## 3. TLS certificate (Let's Encrypt)

```bash
apt-get update && apt-get install -y certbot
certbot certonly --standalone -d irc.profullstack.com
# -> /etc/letsencrypt/live/irc.profullstack.com/{fullchain,privkey}.pem
```

Install the renewal hook so Ergo reloads its cert after each renewal:

```bash
install -m 0755 certbot-deploy-hook.sh \
  /etc/letsencrypt/renewal-hooks/deploy/reload-ergo.sh
```

## 4. Install Ergo

```bash
useradd -r -s /usr/sbin/nologin ergo || true
mkdir -p /opt/ergo
cd /opt/ergo
VER=v2.18.0
curl -fsSL "https://github.com/ergochat/ergo/releases/download/${VER}/ergo-${VER}-linux-x86_64.tar.gz" \
  | tar xz --strip-components=1
cp default.yaml ircd.yaml   # start from the shipped default, then apply §5
```

Give the `ergo` user read access to the certs:

```bash
# certs are root-only by default; a group read grant is the least-privilege option
groupadd -f tls-cert
usermod -aG tls-cert ergo
setfacl -R -m g:tls-cert:rX /etc/letsencrypt/live /etc/letsencrypt/archive
```

## 5. ircd.yaml overlay (the SSL-only bit)

Edit `/opt/ergo/ircd.yaml`. The only changes that matter for this goal are the
server name and the **listeners** block — define one TLS listener on `6697` and
remove the default plaintext `:6667` listener entirely:

```yaml
server:
  name: irc.profullstack.com

  listeners:
    # NO ":6667" entry. The plaintext socket simply does not exist.
    ":6697":
      tls:
        cert: /etc/letsencrypt/live/irc.profullstack.com/fullchain.pem
        key:  /etc/letsencrypt/live/irc.profullstack.com/privkey.pem
        # optional hardening:
        # min-tls-version: 1.2

  # If you ever bind a localhost-only plaintext listener for an internal bot,
  # restrict it to loopback so it is never exposed:
  #   "127.0.0.1:6667": {}
```

Do **not** use STARTTLS on a cleartext port — it is vulnerable to TLS-stripping.
Implicit TLS on 6697 with no 6667 is strictly simpler and safer.

Smoke-test the config in the foreground before wiring up systemd (Ergo
auto-creates its datastore on first run — no `initdb` step needed):

```bash
sudo -u ergo /opt/ergo/ergo run --conf /opt/ergo/ircd.yaml
# watch for "listening on" :6697 and no TLS errors, then Ctrl-C
```

## 6. systemd

```bash
cp ergo.service /etc/systemd/system/ergo.service
systemctl daemon-reload
systemctl enable --now ergo
systemctl status ergo
```

## 7. Verify it is TLS-only

```bash
# TLS handshake succeeds:
openssl s_client -connect irc.profullstack.com:6697 -servername irc.profullstack.com </dev/null 2>/dev/null | head

# plaintext is refused / times out (no listener, firewall closed):
nc -vz -w5 irc.profullstack.com 6667    # expect: connection refused / timed out
```

## 8. Connect sh1pt's IRC bot

`@profullstack/sh1pt-bot-irc` already supports implicit TLS — set `tls: true`
and the port defaults to 6697 (see `../src/index.ts`):

```ts
import { IrcBot } from "@profullstack/sh1pt-bot-irc";

const bot = new IrcBot({
  server: "irc.profullstack.com",
  tls: true,            // port omitted -> 6697
  nick: "sh1pt",
  channels: ["#sh1pt"],
});
```
