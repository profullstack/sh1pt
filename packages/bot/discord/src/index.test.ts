import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

const requiredEnv = {
  DISCORD_BOT_TOKEN: "token",
};

describe("loadConfig", () => {
  it("uses numeric defaults when optional env values are absent", () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      sessionTimeoutMs: 1800000,
      maxOutputLength: 2000,
      maxConcurrentSessions: 5,
    });
  });

  it("accepts complete positive integer env values", () => {
    expect(
      loadConfig({
        ...requiredEnv,
        SESSION_TIMEOUT_MS: "60000",
        MAX_OUTPUT_LENGTH: "1200",
        MAX_CONCURRENT_SESSIONS: "3",
      }),
    ).toMatchObject({
      sessionTimeoutMs: 60000,
      maxOutputLength: 1200,
      maxConcurrentSessions: 3,
    });
  });

  it.each([
    ["SESSION_TIMEOUT_MS", "10abc"],
    ["MAX_OUTPUT_LENGTH", "1.5"],
    ["MAX_CONCURRENT_SESSIONS", "0"],
  ])("rejects malformed positive integer env %s=%s", (name, value) => {
    expect(() => loadConfig({ ...requiredEnv, [name]: value })).toThrow();
  });
});
