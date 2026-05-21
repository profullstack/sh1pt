import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { defineBot, tokenSetup, type BotCtx, type BotEvent, type BotHandler, type BotReply } from "@profullstack/sh1pt-core";

// Slack bot using the Events API over HTTP plus Web API chat.postMessage for
// outbound messages and handler replies.
export interface Config {
  mode?: "events";
  port?: number;
  path?: string;
  botToken?: string;
  signingSecret?: string;
  commandPrefix?: string;
  webApiBaseUrl?: string;
  timestampToleranceSeconds?: number;
  fetch?: FetchLike;
  onServerReady?: (server: Server) => void;
}

export interface SlackApiResponse {
  ok?: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  message?: { ts?: string };
}

export type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ json(): Promise<SlackApiResponse> }>;

interface SlackEnvelope {
  type?: string;
  challenge?: string;
  event?: SlackInnerEvent;
  event_id?: string;
  team_id?: string;
  user?: { id?: string; username?: string; name?: string };
  channel?: { id?: string; name?: string };
  container?: { channel_id?: string; message_ts?: string };
  actions?: Array<{ action_id?: string; value?: string; text?: { text?: string } }>;
}

interface SlackInnerEvent {
  type?: string;
  subtype?: string;
  channel?: string;
  channel_id?: string;
  channel_type?: string;
  user?: string;
  user_id?: string;
  username?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  event_ts?: string;
  reaction?: string;
  item?: { channel?: string; ts?: string };
  member?: string;
  action_id?: string;
  actions?: Array<{ action_id?: string; value?: string; text?: { text?: string } }>;
}

const DEFAULT_EVENTS_PATH = "/slack/events";
const DEFAULT_PORT = 3000;
const DEFAULT_COMMAND_PREFIX = "!";
const DEFAULT_TIMESTAMP_TOLERANCE_SECONDS = 300;
const DEFAULT_WEB_API_BASE = "https://slack.com/api";

export default defineBot<Config>({
  id: "bot-slack",
  label: "Slack",
  supports: ["message", "command", "interaction", "reaction", "join", "leave"],

  async register(ctx, handlers, config) {
    const token = getBotToken(ctx, config);
    const signingKey = getSigningSecret(ctx, config);
    ctx.log(`bot-slack register ${handlers.length} handlers (mode=${config.mode ?? "events"})`);
    if (ctx.dryRun) return { async close() {} };

    if (config.mode && config.mode !== "events") {
      throw new Error("bot-slack currently supports Events API mode");
    }

    const server = createServer((req, res) => {
      void handleSlackRequest(ctx, handlers, token, signingKey, config, req, res);
    });
    await listen(server, config.port ?? DEFAULT_PORT);
    config.onServerReady?.(server);

    const abort = () => server.close();
    ctx.signal?.addEventListener("abort", abort, { once: true });

    return {
      async close() {
        ctx.signal?.removeEventListener("abort", abort);
        await closeServer(server);
      },
    };
  },

  async send(ctx, channel, reply, config) {
    const token = getBotToken(ctx, config);
    ctx.log(`bot-slack send channel=${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };
    return await sendSlackMessage(token, channel, reply, config);
  },

  setup: tokenSetup({
    secretKey: "SLACK_BOT_TOKEN",
    label: "Slack bot",
    vendorDocUrl: "https://docs.slack.dev/apis/events-api/",
    steps: [
      "Create a Slack app and install its bot user to the workspace",
      "Subscribe the Events API request URL to /slack/events",
      "Store the bot token as SLACK_BOT_TOKEN and the app signing secret as SLACK_SIGNING_SECRET",
    ],
  }),
});

function getBotToken(ctx: BotCtx, config: Pick<Config, "botToken">): string {
  const token = config.botToken ?? ctx.secret("SLACK_BOT_TOKEN");
  if (!token) throw new Error("SLACK_BOT_TOKEN not in vault");
  return token;
}

function getSigningSecret(ctx: BotCtx, config: Pick<Config, "signingSecret">): string {
  const value = config.signingSecret ?? ctx.secret("SLACK_SIGNING_SECRET");
  if (!value) throw new Error("SLACK_SIGNING_SECRET not in vault");
  return value;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function handleSlackRequest(
  ctx: BotCtx,
  handlers: BotHandler[],
  token: string,
  signingKey: string,
  config: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if ((req.url ?? "").split("?")[0] !== (config.path ?? DEFAULT_EVENTS_PATH)) {
    writeJson(res, 404, { ok: false, error: "not_found" });
    return;
  }

  const rawBody = await readBody(req);
  if (!verifySlackSignature(rawBody, req.headers, signingKey, config.timestampToleranceSeconds)) {
    writeJson(res, 401, { ok: false, error: "invalid_signature" });
    return;
  }

  const contentType = String(req.headers["content-type"] ?? "");
  const payload = safeParseSlackPayload(rawBody, contentType);
  if (!payload) {
    writeJson(res, 400, { ok: false, error: "invalid_payload" });
    return;
  }

  if ("type" in payload && payload.type === "url_verification" && payload.challenge) {
    writeText(res, 200, payload.challenge);
    return;
  }

  if ("command" in payload) {
    await dispatchEvent(ctx, handlers, token, config, commandPayloadToEvent(payload));
    writeJson(res, 200, { ok: true });
    return;
  }

  const event = slackPayloadToEvent(payload, config.commandPrefix ?? DEFAULT_COMMAND_PREFIX);
  if (!event) {
    writeJson(res, 200, { ok: true });
    return;
  }

  await dispatchEvent(ctx, handlers, token, config, event);
  writeJson(res, 200, { ok: true });
}

function safeParseSlackPayload(rawBody: string, contentType: string): SlackEnvelope | Record<string, string> | undefined {
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(rawBody);
      const payload = params.get("payload");
      if (payload) return JSON.parse(payload) as SlackEnvelope;
      return Object.fromEntries(params.entries());
    }
    return JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return undefined;
  }
}

function slackPayloadToEvent(payload: SlackEnvelope, commandPrefix: string): BotEvent | undefined {
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    return {
      type: "interaction",
      channel: payload.channel?.id ?? payload.container?.channel_id ?? "",
      user: {
        id: payload.user?.id ?? "unknown",
        displayName: payload.user?.username ?? payload.user?.name,
      },
      text: action?.value ?? action?.text?.text,
      command: action?.action_id,
      replyToId: payload.container?.message_ts,
      timestamp: new Date().toISOString(),
      raw: payload,
    };
  }

  if (payload.type !== "event_callback" || !payload.event) return undefined;
  const event = payload.event;
  if (event.bot_id) return undefined;

  if (event.type === "message" || event.type === "app_mention") {
    if (event.subtype === "channel_join") return memberEvent("join", event, payload);
    if (event.subtype === "channel_leave") return memberEvent("leave", event, payload);
    const base = messageEvent(event, payload);
    if (!base) return undefined;
    return maybeCommand(base, event.text ?? "", commandPrefix);
  }

  if (event.type === "reaction_added") {
    return {
      type: "reaction",
      channel: event.item?.channel ?? event.channel ?? "",
      user: { id: event.user ?? "unknown" },
      text: event.reaction,
      timestamp: slackTimestamp(event.event_ts),
      replyToId: event.item?.ts,
      raw: payload,
    };
  }

  if (event.type === "member_joined_channel") return memberEvent("join", event, payload);
  if (event.type === "member_left_channel") return memberEvent("leave", event, payload);

  return undefined;
}

function messageEvent(event: SlackInnerEvent, payload: SlackEnvelope): BotEvent | undefined {
  const channel = event.channel ?? event.channel_id;
  if (!channel) return undefined;
  return {
    type: "message",
    channel,
    user: {
      id: event.user ?? event.user_id ?? "unknown",
      displayName: event.username,
    },
    text: event.text ?? "",
    timestamp: slackTimestamp(event.event_ts ?? event.ts),
    replyToId: event.ts,
    raw: payload,
  };
}

function commandPayloadToEvent(payload: Record<string, string>): BotEvent {
  const command = (payload.command ?? "").replace(/^\//, "");
  const text = payload.text ?? "";
  return {
    type: "command",
    channel: payload.channel_id ?? payload.channel_name ?? "",
    user: {
      id: payload.user_id ?? "unknown",
      displayName: payload.user_name,
    },
    text,
    command,
    args: text.split(/\s+/).filter(Boolean),
    timestamp: new Date().toISOString(),
    raw: payload,
  };
}

function memberEvent(type: "join" | "leave", event: SlackInnerEvent, payload: SlackEnvelope): BotEvent {
  return {
    type,
    channel: event.channel ?? event.channel_id ?? "",
    user: {
      id: event.user ?? event.member ?? event.user_id ?? "unknown",
      displayName: event.username,
    },
    timestamp: slackTimestamp(event.event_ts ?? event.ts),
    raw: payload,
  };
}

function maybeCommand(event: BotEvent, text: string, prefix = DEFAULT_COMMAND_PREFIX): BotEvent {
  if (!text.startsWith(prefix) || text.length <= prefix.length) return event;
  const [command, ...args] = text.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  if (!command) return event;
  return {
    ...event,
    type: "command",
    command,
    args,
  };
}

async function dispatchEvent(
  ctx: BotCtx,
  handlers: BotHandler[],
  token: string,
  config: Config,
  event: BotEvent,
): Promise<void> {
  for (const handler of handlers) {
    if (!matches(handler, event)) continue;
    try {
      const reply = await handler.handle(ctx, event);
      if (reply?.text || reply?.actions?.length) {
        await sendSlackMessage(token, event.channel, reply, config, event.replyToId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.log(`bot-slack handler error: ${message}`);
    }
  }
}

function matches(handler: BotHandler, event: BotEvent): boolean {
  const match = handler.match;
  if (match.type !== event.type) return false;
  if (match.type === "message" && match.pattern) return match.pattern.test(event.text ?? "");
  if (match.type === "command") return event.command === match.command;
  if (match.type === "interaction") return !match.actionId || match.actionId === event.command;
  if (match.type === "reaction") return !match.emoji || match.emoji === event.text;
  return true;
}

async function sendSlackMessage(
  token: string,
  channel: string,
  reply: BotReply,
  config: Pick<Config, "fetch" | "webApiBaseUrl">,
  threadTs?: string,
): Promise<{ id: string }> {
  const fetcher = config.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!fetcher) throw new Error("fetch unavailable for Slack Web API");

  const body = {
    channel,
    text: reply.text ?? "",
    ...(threadTs ? { thread_ts: threadTs } : {}),
    ...(reply.actions?.length ? { blocks: slackBlocks(reply) } : {}),
  };
  const result = await fetcher(`${config.webApiBaseUrl ?? DEFAULT_WEB_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const payload = await result.json();
  if (!payload.ok) throw new Error(`Slack chat.postMessage failed: ${payload.error ?? "unknown_error"}`);
  return { id: payload.ts ?? payload.message?.ts ?? `s_${Date.now()}` };
}

function slackBlocks(reply: BotReply): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  if (reply.text) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: reply.text },
    });
  }
  if (reply.actions?.length) {
    blocks.push({
      type: "actions",
      elements: reply.actions.map((action) => ({
        type: "button",
        action_id: action.id,
        text: { type: "plain_text", text: action.label },
        style: action.style === "danger" ? "danger" : action.style === "primary" ? "primary" : undefined,
        url: action.url,
        value: action.url ?? action.id,
      })),
    });
  }
  return blocks;
}

function verifySlackSignature(
  rawBody: string,
  headers: IncomingMessage["headers"],
  signingKey: string,
  toleranceSeconds = DEFAULT_TIMESTAMP_TOLERANCE_SECONDS,
): boolean {
  const timestamp = firstHeader(headers["x-slack-request-timestamp"]);
  const signature = firstHeader(headers["x-slack-signature"]);
  if (!timestamp || !signature) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (toleranceSeconds > 0 && Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > toleranceSeconds) {
    return false;
  }
  const expected = slackSignature(rawBody, timestamp, signingKey);
  const actual = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

export function slackSignature(rawBody: string, timestamp: string, signingKey: string): string {
  const digest = createHmac("sha256", signingKey)
    .update(`v0:${timestamp}:${rawBody}`, "utf8")
    .digest("hex");
  return `v0=${digest}`;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function slackTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function writeText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}
