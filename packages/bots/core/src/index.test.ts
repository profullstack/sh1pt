import { describe, expect, it } from "vitest";
import { loadAIConfig } from "./index";

describe("loadAIConfig", () => {
  it("loads positive integer env limits", () => {
    expect(loadAIConfig({
      AI_MAX_TURNS: "12",
      SESSION_TIMEOUT_MS: "60000",
      MAX_CONCURRENT_SESSIONS: "3",
    })).toMatchObject({
      aiMaxTurns: 12,
      sessionTimeoutMs: 60000,
      maxConcurrentSessions: 3,
    });
  });

  it.each([
    ["AI_MAX_TURNS", "10abc"],
    ["SESSION_TIMEOUT_MS", "1.5"],
    ["MAX_CONCURRENT_SESSIONS", "0"],
  ])("rejects malformed %s values", (key, value) => {
    expect(() => loadAIConfig({ [key]: value })).toThrow();
  });
});
