import { autoSetup } from './setup-helpers.js';

// Bot — a long-running, event-driven runtime you DEPLOY to a comms
// platform and that handles inbound events (messages, slash commands,
// SMS, voice calls) by dispatching to registered handlers.
//
// Distinct from:
//   - bridge-*  : cross-posts messages between networks (no handlers)
//   - chat-*    : deploy-target only (push a bot binary to a store)
//   - webhook-* : one-way inbound notification (no reply channel)
//   - social-*  : broadcast content (no interactive dispatch)
//
// "All comms" scope: chat (discord/slack/telegram/matrix/irc/teams/
// whatsapp/signal/twitch/wechat), SMS (twilio/vonage/messagebird),
// voice (twilio/vapi/retell). Every modality normalizes to BotEvent —
// adapters flatten platform-specifics into the same dispatch API.

export type BotEventType =
  | 'message'          // user posted a message / SMS body
  | 'command'          // slash command / !command / SMS keyword
  | 'interaction'      // button / select menu / quick reply
  | 'reaction'         // emoji reaction on a prior message
  | 'join' | 'leave'   // channel/room membership changes
  | 'call.start'       // voice: inbound call connected
  | 'call.end'         // voice: call hung up
  | 'call.utterance';  // voice: ASR'd speaker turn

export interface BotUser {
  id: string;                       // provider-native user id or phone number
  username?: string;
  displayName?: string;
  isBot?: boolean;
}

export interface BotEvent {
  type: BotEventType;
  channel: string;                  // channel id / room id / phone number / call sid
  user: BotUser;
  text?: string;                    // message text or ASR transcript
  command?: string;                 // 'help', 'start', … (no slash or bang)
  args?: string[];
  attachments?: Array<{ url: string; mimeType?: string; filename?: string }>;
  replyToId?: string;
  timestamp: string;
  // Raw provider payload when handlers need full fidelity (Discord interaction
  // token for deferred responses, Twilio CallSid, Matrix event id, etc.).
  raw?: unknown;
}

export interface BotReply {
  text?: string;
  ephemeral?: boolean;              // only visible to the invoking user where supported
  attachments?: Array<{ url: string; filename?: string; mimeType?: string }>;
  // Buttons / quick replies — adapters render platform-natively (Discord
  // components, Slack blocks, WhatsApp quick-replies, Telegram inline kb).
  actions?: Array<{ id: string; label: string; style?: 'primary' | 'danger' | 'link'; url?: string }>;
  // Voice-only: TTS text or pre-recorded audio URL to play back.
  voice?: { say?: string; play?: string };
}

export interface BotCtx {
  secret(k: string): string | undefined;
  log(m: string): void;
  dryRun: boolean;
  signal?: AbortSignal;
}

export type BotHandlerMatch =
  | { type: 'message'; pattern?: RegExp }
  | { type: 'command'; command: string }
  | { type: 'interaction'; actionId?: string }
  | { type: 'reaction'; emoji?: string }
  | { type: 'join' | 'leave' }
  | { type: 'call.start' | 'call.end' | 'call.utterance' };

export interface BotHandler {
  match: BotHandlerMatch;
  handle(ctx: BotCtx, event: BotEvent): Promise<BotReply | void> | BotReply | void;
}

export interface Bot<Config = unknown> {
  id: string;                       // 'bot-discord', 'bot-telegram', 'bot-sms', …
  label: string;
  // Every adapter must declare which event types it can emit. Voice-only
  // adapters won't emit 'message'; SMS adapters won't emit 'interaction'.
  supports: BotEventType[];
  // Open the live connection / webhook subscription and register handlers.
  // Returns a close() for graceful shutdown.
  register(
    ctx: BotCtx,
    handlers: BotHandler[],
    config: Config,
  ): Promise<{ close(): Promise<void> }>;
  // Explicit outbound send — handlers can also return a BotReply which
  // the runtime sends for them. send() is for proactive messages
  // (reminders, campaign pushes, scheduled drips).
  send(
    ctx: BotCtx,
    channel: string,
    reply: BotReply,
    config: Config,
  ): Promise<{ id: string }>;
  setup?(ctx: import('./setup.js').SetupContext): Promise<import('./setup.js').SetupResult<Config>>;
}

export function defineBot<Config>(b: Bot<Config>): Bot<Config> {
  return autoSetup(b);
}

const botRegistry = new Map<string, Bot<any>>();

export function registerBot(b: Bot<any>): void {
  if (botRegistry.has(b.id)) throw new Error(`Bot already registered: ${b.id}`);
  botRegistry.set(b.id, b);
}

export function getBot(id: string): Bot<any> | undefined {
  return botRegistry.get(id);
}

export function listBots(): Bot<any>[] {
  return [...botRegistry.values()];
}
