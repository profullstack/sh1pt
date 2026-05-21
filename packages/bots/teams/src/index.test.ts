import { contractTestBot } from "@profullstack/sh1pt-core/testing";
import { describe, expect, it, vi } from "vitest";
import type { BotCtx, BotHandler } from "@profullstack/sh1pt-core";
import bot from "./index.js";

contractTestBot(bot, { sampleConfig: {}, sampleChannel: "19:xxx@thread.v2" });

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

function jsonResponse(status: number, body: unknown): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function testCtx(): BotCtx {
  return {
    secret: (key) => {
      if (key === "TEAMS_APP_ID") return "app-id";
      if (key === "TEAMS_APP_PASSWORD") return "app-key";
      return undefined;
    },
    log: () => {},
    dryRun: false,
  };
}

async function postActivity(port: number, body: unknown, authorization = "Bearer token"): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/messages`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Microsoft Teams adapter", () => {
  it("dispatches a Teams command activity and replies through the Bot Connector", async () => {
    let readyPort = 0;
    const connectorCalls: Array<{ url: string; init?: FetchInit }> = [];
    const fetcher = vi.fn(async (url: string, init?: FetchInit) => {
      connectorCalls.push({ url, init });
      if (url.includes("/oauth2/v2.0/token")) return jsonResponse(200, { access_token: "access-token" });
      if (url.includes("/v3/conversations/19%3Ateam-thread%40thread.v2/activities/activity-1")) {
        return jsonResponse(200, { id: "reply-1" });
      }
      return jsonResponse(404, { error: "unexpected" });
    });
    const jwtValidator = vi.fn(async () => {});
    const handler: BotHandler = {
      match: { type: "command", command: "deploy" },
      async handle(_ctx, event) {
        expect(event).toMatchObject({
          type: "command",
          channel: "19:team-thread@thread.v2",
          command: "deploy",
          args: ["prod"],
          text: "!deploy prod",
          user: { id: "user-1", displayName: "Ada" },
          replyToId: "activity-1",
        });
        return {
          text: "Deployment queued",
          actions: [{ id: "status", label: "Status" }],
        };
      },
    };

    const handle = await bot.register(testCtx(), [handler], {
      port: 0,
      fetch: fetcher,
      jwtValidator,
      onServerReady: ({ port }) => {
        readyPort = port;
      },
    });

    try {
      const response = await postActivity(readyPort, {
        type: "message",
        id: "activity-1",
        timestamp: "2026-05-21T08:00:00.000Z",
        serviceUrl: "https://smba.trafficmanager.net/teams/",
        channelId: "msteams",
        text: "!deploy prod",
        from: { id: "user-1", name: "Ada" },
        recipient: { id: "bot-1", name: "sh1pt" },
        conversation: { id: "19:team-thread@thread.v2", tenantId: "tenant-1" },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ id: "reply-1" });
      expect(jwtValidator).toHaveBeenCalledWith(
        "token",
        expect.objectContaining({ id: "activity-1" }),
        expect.objectContaining({ appId: "app-id" }),
      );

      const replyCall = connectorCalls.find((call) => call.url.includes("/v3/conversations/"));
      expect(replyCall?.init?.headers?.Authorization).toBe("Bearer access-token");
      expect(JSON.parse(replyCall?.init?.body ?? "{}")).toMatchObject({
        type: "message",
        text: "Deployment queued",
        replyToId: "activity-1",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: {
              type: "AdaptiveCard",
              actions: [{ type: "Action.Submit", title: "Status", data: { actionId: "status" } }],
            },
          },
        ],
      });
    } finally {
      await handle.close();
    }
  });

  it("rejects incoming activities without a Bot Framework bearer token", async () => {
    let readyPort = 0;
    const handle = await bot.register(testCtx(), [], {
      port: 0,
      fetch: async () => jsonResponse(200, {}),
      jwtValidator: async () => {},
      onServerReady: ({ port }) => {
        readyPort = port;
      },
    });

    try {
      const response = await postActivity(
        readyPort,
        { type: "message", conversation: { id: "19:team-thread@thread.v2" }, serviceUrl: "https://smba.trafficmanager.net/teams/" },
        "",
      );
      expect(response.status).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it("maps Teams conversation updates to join and leave events", async () => {
    let readyPort = 0;
    const seen: string[] = [];
    const handlers: BotHandler[] = [
      {
        match: { type: "join" },
        handle(_ctx, event) {
          seen.push(`${event.type}:${event.user.id}`);
        },
      },
      {
        match: { type: "leave" },
        handle(_ctx, event) {
          seen.push(`${event.type}:${event.user.id}`);
        },
      },
    ];
    const handle = await bot.register(testCtx(), handlers, {
      port: 0,
      fetch: async () => jsonResponse(200, {}),
      jwtValidator: async () => {},
      onServerReady: ({ port }) => {
        readyPort = port;
      },
    });

    try {
      const response = await postActivity(readyPort, {
        type: "conversationUpdate",
        timestamp: "2026-05-21T08:00:00.000Z",
        serviceUrl: "https://smba.trafficmanager.net/teams/",
        conversation: { id: "19:team-thread@thread.v2" },
        membersAdded: [{ id: "user-added", name: "Grace" }],
        membersRemoved: [{ id: "user-removed", name: "Lin" }],
      });
      expect(response.status).toBe(202);
      expect(seen).toEqual(["join:user-added", "leave:user-removed"]);
    } finally {
      await handle.close();
    }
  });

  it("sends proactive messages to a stored Teams conversation reference", async () => {
    const connectorCalls: Array<{ url: string; init?: FetchInit }> = [];
    const fetcher = vi.fn(async (url: string, init?: FetchInit) => {
      connectorCalls.push({ url, init });
      if (url.includes("/oauth2/v2.0/token")) return jsonResponse(200, { access_token: "access-token" });
      if (url.includes("/v3/conversations/19%3Ateam-thread%40thread.v2/activities")) {
        return jsonResponse(200, { id: "sent-1" });
      }
      return jsonResponse(404, { error: "unexpected" });
    });

    const result = await bot.send(
      testCtx(),
      JSON.stringify({
        serviceUrl: "https://smba.trafficmanager.net/teams/",
        conversationId: "19:team-thread@thread.v2",
        tenantId: "tenant-1",
      }),
      {
        text: "Build finished",
        actions: [{ id: "open", label: "Open", style: "link", url: "https://example.com/build" }],
      },
      { fetch: fetcher },
    );

    expect(result).toEqual({ id: "sent-1" });
    const sendCall = connectorCalls.find((call) => call.url.includes("/v3/conversations/"));
    expect(sendCall?.init?.headers?.Authorization).toBe("Bearer access-token");
    expect(JSON.parse(sendCall?.init?.body ?? "{}")).toMatchObject({
      type: "message",
      text: "Build finished",
      conversation: { id: "19:team-thread@thread.v2", tenantId: "tenant-1" },
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            actions: [{ type: "Action.OpenUrl", title: "Open", url: "https://example.com/build" }],
          },
        },
      ],
    });
  });
});
