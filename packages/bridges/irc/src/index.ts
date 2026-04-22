import { defineBridge, manualSetup } from '@profullstack/sh1pt-core';

// IRC bridge — classic TCP/TLS client against any IRC network (Libera,
// OFTC, self-hosted InspIRCd, etc.). Use SASL for auth on modern networks.
interface Config {
  server: string;                   // e.g. 'irc.libera.chat'
  port?: number;                    // default 6697 TLS
  nick: string;
  realname?: string;
  sasl?: boolean;                   // use SASL PLAIN — requires NICK password in vault
}

export default defineBridge<Config>({
  id: 'bridge-irc',
  label: 'IRC',

  async subscribe(ctx, channels, onMessage, config) {
    if (config.sasl && !ctx.secret('IRC_PASSWORD')) throw new Error('IRC_PASSWORD not in vault (SASL enabled)');
    ctx.log(`irc bridge · ${config.server}:${config.port ?? 6697} · channels=${channels.join(',')}`);
    // TODO: TLS socket connect, CAP LS → SASL PLAIN → NICK → USER → JOIN
    // channels; parse PRIVMSG into BridgeMessage.
    return { async close() {} };
  },

  async send(ctx, channel, msg, config) {
    ctx.log(`irc bridge · PRIVMSG ${channel}`);
    if (ctx.dryRun) return { id: 'dry-run' };
    // TODO: write "PRIVMSG <channel> :<username> [<network>]: <text>\r\n"
    // IRC has no native multi-line; split at ~400 bytes and send multiple
    // PRIVMSGs. Media: post a link (IRC has no attachments).
    return { id: `irc_${Date.now()}` };
  },

  setup: manualSetup({
    label: "IRC bridge",
    vendorDocUrl: "https://datatracker.ietf.org/doc/html/rfc1459",
    steps: [
      "Configure server host + port + TLS + nickname in sh1pt.config.ts",
      "Run: sh1pt secret set IRC_NICKSERV_PASSWORD <pw>  (only if your nick is registered)",
    ],
  }),
});
