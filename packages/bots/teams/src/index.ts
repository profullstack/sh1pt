import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";
import {
  defineBot,
  tokenSetup,
  type BotEvent,
  type BotCtx,
  type BotHandler,
  type BotReply,
} from "@profullstack/sh1pt-core";

const DEFAULT_PATH = "/api/messages";
const DEFAULT_PORT = 3978;
const DEFAULT_COMMAND_PREFIX = "!";
const DEFAULT_SERVICE_URL = "https://smba.trafficmanager.net/teams/";
const DEFAULT_OAUTH_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token";
const DEFAULT_OPENID_METADATA_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const BOT_CONNECTOR_SCOPE = "https://api.botframework.com/.default";
const BOT_CONNECTOR_ISSUER = "https://api.botframework.com";

interface Config {
  appId?: string;
  appPassword?: string;
  tenantId?: string;
  botName?: string;
  commandPrefix?: string;
  port?: number;
  path?: string;
  serviceUrl?: string;
  oauthUrl?: string;
  openIdMetadataUrl?: string;
  clockSkewSeconds?: number;
  fetch?: FetchLike;
  jwtValidator?: JwtValidator;
  onServerReady?: (info: { port: number; path: string }) => void | Promise<void>;
}

type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

type JwtValidator = (token: string, activity: TeamsActivity, config: RequiredAuthConfig) => Promise<void>;

interface RequiredAuthConfig {
  appId: string;
  openIdMetadataUrl: string;
  clockSkewSeconds: number;
  fetch: FetchLike;
}

interface TeamsAccount {
  id?: string;
  name?: string;
  aadObjectId?: string;
  role?: string;
}

interface TeamsConversation {
  id?: string;
  name?: string;
  tenantId?: string;
}

interface TeamsActivity {
  type?: string;
  id?: string;
  timestamp?: string;
  serviceUrl?: string;
  channelId?: string;
  text?: string;
  name?: string;
  value?: unknown;
  from?: TeamsAccount;
  recipient?: TeamsAccount;
  conversation?: TeamsConversation;
  membersAdded?: TeamsAccount[];
  membersRemoved?: TeamsAccount[];
  replyToId?: string;
  attachments?: TeamsAttachment[];
}

interface TeamsAttachment {
  contentType?: string;
  contentUrl?: string;
  name?: string;
  content?: unknown;
}

interface ConnectorTokenResponse {
  access_token?: string;
  token_type?: string;
}

interface OpenIdMetadata {
  issuer?: string;
  jwks_uri?: string;
  id_token_signing_alg_values_supported?: string[];
}

interface JsonWebKeySet {
  keys?: Array<JsonWebKey & { kid?: string; x5t?: string; endorsements?: string[] }>;
}

interface ParsedJwt {
  header: {
    alg?: string;
    kid?: string;
    x5t?: string;
  };
  payload: {
    aud?: string | string[];
    iss?: string;
    exp?: number;
    nbf?: number;
    serviceurl?: string;
    serviceUrl?: string;
  };
  signed: string;
  signature: Buffer;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class TeamsConnector {
  constructor(
    private readonly appId: string,
    private readonly appPassword: string,
    private readonly config: Config,
  ) {}

  async reply(activity: TeamsActivity, reply: BotReply): Promise<{ id: string }> {
    const serviceUrl = requiredString(activity.serviceUrl, "activity.serviceUrl");
    const conversationId = requiredString(activity.conversation?.id, "activity.conversation.id");
    const activityId = activity.id;
    const path = activityId
      ? `/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`
      : `/v3/conversations/${encodeURIComponent(conversationId)}/activities`;
    return this.postActivity(serviceUrl, path, buildReplyActivity(reply, activity, this.config.botName));
  }

  async send(channel: string, reply: BotReply): Promise<{ id: string }> {
    const reference = parseConversationReference(channel, this.config);
    return this.postActivity(
      reference.serviceUrl,
      `/v3/conversations/${encodeURIComponent(reference.conversationId)}/activities`,
      buildProactiveActivity(reply, reference, this.config.botName),
    );
  }

  private async postActivity(serviceUrl: string, path: string, activity: Record<string, unknown>): Promise<{ id: string }> {
    const token = await this.getAccessToken();
    const url = joinUrl(serviceUrl, path);
    const response = await fetchFor(this.config)(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(activity),
    });

    if (!response.ok) {
      throw new Error(`Teams Connector request failed (${response.status} ${response.statusText}): ${await response.text()}`);
    }

    const body = await response.json();
    if (isRecord(body) && typeof body.id === "string") return { id: body.id };
    return { id: `teams_${Date.now()}` };
  }

  private async getAccessToken(): Promise<string> {
    const oauthUrl = this.config.oauthUrl ?? oauthUrlFor(this.config.tenantId);
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.appId,
      client_secret: this.appPassword,
      scope: BOT_CONNECTOR_SCOPE,
    });
    const response = await fetchFor(this.config)(oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Teams OAuth request failed (${response.status} ${response.statusText}): ${await response.text()}`);
    }

    const data = await response.json();
    if (!isConnectorTokenResponse(data) || !data.access_token) {
      throw new Error("Teams OAuth response did not include an access token");
    }
    return data.access_token;
  }
}

export async function authenticateBotFrameworkJwt(
  token: string,
  activity: TeamsActivity,
  config: RequiredAuthConfig,
): Promise<void> {
  const parsed = parseJwt(token);
  if (parsed.header.alg !== "RS256") throw new HttpError(403, "Unsupported Bot Framework JWT algorithm");
  if (!hasAudience(parsed.payload.aud, config.appId)) throw new HttpError(403, "Bot Framework JWT audience mismatch");
  if (parsed.payload.iss !== BOT_CONNECTOR_ISSUER) throw new HttpError(403, "Bot Framework JWT issuer mismatch");
  assertJwtClock(parsed, config.clockSkewSeconds);

  const tokenServiceUrl = parsed.payload.serviceurl ?? parsed.payload.serviceUrl;
  if (typeof tokenServiceUrl === "string" && activity.serviceUrl && tokenServiceUrl !== activity.serviceUrl) {
    throw new HttpError(403, "Bot Framework JWT serviceUrl mismatch");
  }

  const metadata = await getOpenIdMetadata(config.fetch, config.openIdMetadataUrl);
  if (metadata.issuer && metadata.issuer !== BOT_CONNECTOR_ISSUER) {
    throw new HttpError(403, "Unexpected Bot Framework OpenID issuer");
  }
  if (!metadata.id_token_signing_alg_values_supported?.includes("RS256")) {
    throw new HttpError(403, "Bot Framework OpenID metadata does not allow RS256");
  }
  if (!metadata.jwks_uri) throw new HttpError(403, "Bot Framework OpenID metadata missing jwks_uri");

  const keySet = await getSigningKeys(config.fetch, metadata.jwks_uri);
  const keyId = parsed.header.kid ?? parsed.header.x5t;
  const key = keySet.keys?.find((candidate) => candidate.kid === keyId || candidate.x5t === keyId);
  if (!key) throw new HttpError(403, "Bot Framework JWT signing key not found");

  const verifier = createVerify("RSA-SHA256");
  verifier.update(parsed.signed);
  verifier.end();
  const publicKey = createPublicKey({ key, format: "jwk" });
  if (!verifier.verify(publicKey, parsed.signature)) {
    throw new HttpError(403, "Bot Framework JWT signature failed validation");
  }
}

async function startTeamsServer(
  ctx: BotCtx,
  handlers: BotHandler[],
  config: Config,
  connector: TeamsConnector,
): Promise<{ close(): Promise<void> }> {
  const path = config.path ?? DEFAULT_PATH;
  const port = config.port ?? DEFAULT_PORT;
  const authConfig = requiredAuthConfig(config);
  const validateJwt = config.jwtValidator ?? authenticateBotFrameworkJwt;

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || stripQuery(req.url ?? "") !== path) {
        writeJson(res, 404, { error: "not_found" });
        return;
      }

      const activity = await readActivity(req);
      const token = bearerToken(req.headers.authorization);
      await validateJwt(token, activity, authConfig);

      const reply = await dispatchActivity(ctx, handlers, activity, config);
      if (reply) {
        const result = await connector.reply(activity, reply);
        writeJson(res, 200, { id: result.id });
        return;
      }

      writeJson(res, activity.type === "invoke" ? 200 : 202, {});
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown Teams adapter error";
      writeJson(res, status, { error: message });
    }
  });

  ctx.signal?.addEventListener("abort", () => {
    void closeServer(server);
  });

  await listen(server, port);
  const boundPort = boundServerPort(server, port);
  await config.onServerReady?.({ port: boundPort, path });
  ctx.log(`bot-teams · listening on ${path} port=${boundPort}`);

  return { close: () => closeServer(server) };
}

async function dispatchActivity(
  ctx: BotCtx,
  handlers: BotHandler[],
  activity: TeamsActivity,
  config: Config,
): Promise<BotReply | void> {
  const events = activityToBotEvents(activity, config);
  let firstReply: BotReply | undefined = undefined;
  for (const event of events) {
    for (const handler of handlers) {
      if (!handlerMatches(handler, event)) continue;
      const reply = await handler.handle(ctx, event);
      if (reply && !firstReply) firstReply = reply;
    }
  }
  return firstReply;
}

function activityToBotEvents(activity: TeamsActivity, config: Config): BotEvent[] {
  const timestamp = activity.timestamp ?? new Date().toISOString();
  const channel = requiredString(activity.conversation?.id, "activity.conversation.id");
  const user = {
    id: activity.from?.id ?? "unknown",
    username: activity.from?.name,
    displayName: activity.from?.name,
    isBot: activity.from?.role === "bot",
  };

  if (activity.type === "message") {
    const text = activity.text ?? "";
    const prefix = config.commandPrefix ?? DEFAULT_COMMAND_PREFIX;
    const base = {
      channel,
      user,
      text,
      attachments: attachmentsFromActivity(activity),
      replyToId: activity.id,
      timestamp,
      raw: activity,
    };
    const command = parseCommand(text, prefix);
    if (command) return [{ type: "command", ...base, command: command.name, args: command.args }];
    return [{ type: "message", ...base }];
  }

  if (activity.type === "conversationUpdate") {
    const joins = (activity.membersAdded ?? []).map((member) => membershipEvent("join", channel, member, timestamp, activity));
    const leaves = (activity.membersRemoved ?? []).map((member) => membershipEvent("leave", channel, member, timestamp, activity));
    return [...joins, ...leaves];
  }

  if (activity.type === "invoke") {
    return [
      {
        type: "interaction",
        channel,
        user,
        command: activity.name,
        text: typeof activity.value === "string" ? activity.value : undefined,
        replyToId: activity.id,
        timestamp,
        raw: activity,
      },
    ];
  }

  return [];
}

function membershipEvent(
  type: "join" | "leave",
  channel: string,
  member: TeamsAccount,
  timestamp: string,
  raw: TeamsActivity,
): BotEvent {
  return {
    type,
    channel,
    user: {
      id: member.id ?? "unknown",
      username: member.name,
      displayName: member.name,
      isBot: member.role === "bot",
    },
    timestamp,
    raw,
  };
}

function handlerMatches(handler: BotHandler, event: BotEvent): boolean {
  const match = handler.match;
  if (match.type !== event.type) return false;
  if (match.type === "message") return !match.pattern || match.pattern.test(event.text ?? "");
  if (match.type === "command") return match.command === event.command;
  if (match.type === "interaction") return !match.actionId || match.actionId === event.command;
  return true;
}

function parseCommand(text: string, prefix: string): { name: string; args: string[] } | undefined {
  if (!text.startsWith(prefix)) return undefined;
  const parts = text.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
  const [name, ...args] = parts;
  return name ? { name, args } : undefined;
}

function attachmentsFromActivity(activity: TeamsActivity): BotEvent["attachments"] {
  return (activity.attachments ?? [])
    .filter((attachment) => typeof attachment.contentUrl === "string")
    .map((attachment) => ({
      url: attachment.contentUrl as string,
      filename: attachment.name,
      mimeType: attachment.contentType,
    }));
}

function buildReplyActivity(reply: BotReply, source: TeamsActivity, botName?: string): Record<string, unknown> {
  return {
    type: "message",
    text: reply.text ?? "",
    from: source.recipient,
    recipient: source.from,
    conversation: source.conversation,
    replyToId: source.id,
    attachments: buildAttachments(reply),
    ...(botName ? { channelData: { botName } } : {}),
  };
}

function buildProactiveActivity(
  reply: BotReply,
  reference: { conversationId: string; serviceUrl: string; tenantId?: string },
  botName?: string,
): Record<string, unknown> {
  return {
    type: "message",
    text: reply.text ?? "",
    conversation: { id: reference.conversationId, tenantId: reference.tenantId },
    attachments: buildAttachments(reply),
    ...(botName ? { channelData: { botName } } : {}),
  };
}

function buildAttachments(reply: BotReply): TeamsAttachment[] | undefined {
  const cardActions = (reply.actions ?? []).map((action) => ({
    type: action.url ? "Action.OpenUrl" : "Action.Submit",
    title: action.label,
    ...(action.url ? { url: action.url } : { data: { actionId: action.id } }),
  }));

  const cards = cardActions.length
    ? [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: reply.text ? [{ type: "TextBlock", text: reply.text, wrap: true }] : [],
            actions: cardActions,
          },
        },
      ]
    : [];

  const files = (reply.attachments ?? []).map((attachment) => ({
    contentType: attachment.mimeType,
    contentUrl: attachment.url,
    name: attachment.filename,
  }));

  const attachments = [...cards, ...files];
  return attachments.length ? attachments : undefined;
}

function parseConversationReference(
  channel: string,
  config: Config,
): { conversationId: string; serviceUrl: string; tenantId?: string } {
  const trimmed = channel.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) throw new Error("Invalid Teams conversation reference JSON");
    const conversationId = readString(parsed, "conversationId") ?? readNestedString(parsed, "conversation", "id");
    const serviceUrl = readString(parsed, "serviceUrl") ?? config.serviceUrl ?? DEFAULT_SERVICE_URL;
    const tenantId = readString(parsed, "tenantId") ?? readNestedString(parsed, "conversation", "tenantId") ?? config.tenantId;
    if (!conversationId) throw new Error("Teams conversation reference missing conversationId");
    return { conversationId, serviceUrl, tenantId };
  }

  const parts = trimmed.split("|");
  if (parts.length === 2) {
    const [serviceUrl, conversationId] = parts;
    if (serviceUrl && conversationId) return { serviceUrl, conversationId, tenantId: config.tenantId };
  }

  return {
    conversationId: trimmed,
    serviceUrl: config.serviceUrl ?? DEFAULT_SERVICE_URL,
    tenantId: config.tenantId,
  };
}

function requiredAuthConfig(config: Config): RequiredAuthConfig {
  if (!config.appId) throw new Error("TEAMS_APP_ID not configured");
  return {
    appId: config.appId,
    openIdMetadataUrl: config.openIdMetadataUrl ?? DEFAULT_OPENID_METADATA_URL,
    clockSkewSeconds: config.clockSkewSeconds ?? 300,
    fetch: fetchFor(config),
  };
}

function fetchFor(config: Config): FetchLike {
  if (config.fetch) return config.fetch;
  if (typeof fetch !== "function") throw new Error("Global fetch is not available; pass config.fetch");
  return fetch as FetchLike;
}

function oauthUrlFor(tenantId?: string): string {
  if (!tenantId) return DEFAULT_OAUTH_URL;
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

function bearerToken(value: string | string[] | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Missing Bot Framework bearer token");
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new HttpError(401, "Empty Bot Framework bearer token");
  return token;
}

async function readActivity(req: IncomingMessage): Promise<TeamsActivity> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const parsed = JSON.parse(body) as unknown;
  if (!isRecord(parsed)) throw new HttpError(400, "Teams activity body must be a JSON object");
  return parsed as TeamsActivity;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function boundServerPort(server: Server, fallback: number): number {
  const address = server.address();
  return typeof address === "object" && address ? address.port : fallback;
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function stripQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function readNestedString(source: Record<string, unknown>, key: string, nestedKey: string): string | undefined {
  const nested = source[key];
  return isRecord(nested) ? readString(nested, nestedKey) : undefined;
}

function isConnectorTokenResponse(value: unknown): value is ConnectorTokenResponse {
  return isRecord(value) && (typeof value.access_token === "string" || value.access_token === undefined);
}

async function getOpenIdMetadata(fetcher: FetchLike, url: string): Promise<OpenIdMetadata> {
  const response = await fetcher(url);
  if (!response.ok) throw new HttpError(403, `Failed to load Bot Framework OpenID metadata (${response.status})`);
  const body = await response.json();
  if (!isRecord(body)) throw new HttpError(403, "Bot Framework OpenID metadata was not an object");
  return body as OpenIdMetadata;
}

async function getSigningKeys(fetcher: FetchLike, url: string): Promise<JsonWebKeySet> {
  const response = await fetcher(url);
  if (!response.ok) throw new HttpError(403, `Failed to load Bot Framework signing keys (${response.status})`);
  const body = await response.json();
  if (!isRecord(body)) throw new HttpError(403, "Bot Framework signing keys were not an object");
  return body as JsonWebKeySet;
}

function parseJwt(token: string): ParsedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(403, "Bot Framework JWT must have three parts");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new HttpError(403, "Bot Framework JWT part missing");
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as unknown;
  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as unknown;
  if (!isRecord(header) || !isRecord(payload)) throw new HttpError(403, "Bot Framework JWT payload invalid");
  return {
    header: header as ParsedJwt["header"],
    payload: payload as ParsedJwt["payload"],
    signed: `${encodedHeader}.${encodedPayload}`,
    signature: base64UrlDecode(encodedSignature),
  };
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function hasAudience(aud: string | string[] | undefined, appId: string): boolean {
  if (typeof aud === "string") return aud === appId;
  return Array.isArray(aud) && aud.includes(appId);
}

function assertJwtClock(parsed: ParsedJwt, skewSeconds: number): void {
  const now = Math.floor(Date.now() / 1000);
  if (typeof parsed.payload.exp !== "number" || parsed.payload.exp < now - skewSeconds) {
    throw new HttpError(403, "Bot Framework JWT expired");
  }
  if (typeof parsed.payload.nbf === "number" && parsed.payload.nbf > now + skewSeconds) {
    throw new HttpError(403, "Bot Framework JWT not yet valid");
  }
}

export default defineBot<Config>({
  id: "bot-teams",
  label: "Microsoft Teams",
  supports: ["message", "command", "interaction", "join", "leave"],

  async register(ctx, handlers, config) {
    const appPassword = config.appPassword ?? ctx.secret("TEAMS_APP_PASSWORD");
    const appId = config.appId ?? ctx.secret("TEAMS_APP_ID");
    if (!appPassword) throw new Error("TEAMS_APP_PASSWORD not in vault");
    if (!appId) throw new Error("TEAMS_APP_ID not in vault");

    const resolvedConfig = { ...config, appId, appPassword };
    ctx.log(`bot-teams · register ${handlers.length} handlers (app=configured)`);
    if (ctx.dryRun) return { async close() {} };

    const connector = new TeamsConnector(appId, appPassword, resolvedConfig);
    return startTeamsServer(ctx, handlers, resolvedConfig, connector);
  },

  async send(ctx, channel, reply, config) {
    const appPassword = config.appPassword ?? ctx.secret("TEAMS_APP_PASSWORD");
    const appId = config.appId ?? ctx.secret("TEAMS_APP_ID");
    if (!appPassword) throw new Error("TEAMS_APP_PASSWORD not in vault");
    if (!appId) throw new Error("TEAMS_APP_ID not in vault");

    ctx.log(`bot-teams · send -> ${channel}`);
    if (ctx.dryRun) return { id: "dry-run" };

    const connector = new TeamsConnector(appId, appPassword, { ...config, appId, appPassword });
    return connector.send(channel, reply);
  },

  setup: tokenSetup({
    secretKey: "TEAMS_APP_PASSWORD",
    label: "Microsoft Teams bot",
    vendorDocUrl: "https://learn.microsoft.com/microsoftteams/platform/bots/overview",
    steps: [
      "Create an Azure Bot resource and Microsoft app registration",
      "Enable the Microsoft Teams channel",
      "Store the app password in TEAMS_APP_PASSWORD and the app id in TEAMS_APP_ID",
    ],
  }),
});
