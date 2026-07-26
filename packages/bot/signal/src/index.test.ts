import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

const requiredEnv = {
  SIGNAL_PHONE_NUMBER: "+15551234567",
};

describe("loadConfig", () => {
  it("uses numeric defaults when optional env values are absent", () => {
    expect(loadConfig(requiredEnv)).toMatchObject({
      httpPort: 7580,
      sessionTimeoutMs: 1800000,
      maxOutputLength: 4000,
      maxConcurrentSessions: 5,
    });
  });

  it("accepts complete positive integer env values", () => {
    expect(
      loadConfig({
        ...requiredEnv,
        SIGNAL_HTTP_PORT: "8080",
        SESSION_TIMEOUT_MS: "60000",
        MAX_OUTPUT_LENGTH: "1200",
        MAX_CONCURRENT_SESSIONS: "3",
      }),
    ).toMatchObject({
      httpPort: 8080,
      sessionTimeoutMs: 60000,
      maxOutputLength: 1200,
      maxConcurrentSessions: 3,
    });
  });

  it.each([
    ["SIGNAL_HTTP_PORT", "7580abc"],
    ["SIGNAL_HTTP_PORT", "65536"],
    ["SESSION_TIMEOUT_MS", "10abc"],
    ["MAX_OUTPUT_LENGTH", "1.5"],
    ["MAX_CONCURRENT_SESSIONS", "0"],
  ])("rejects malformed numeric env %s=%s", (name, value) => {
    expect(() => loadConfig({ ...requiredEnv, [name]: value })).toThrow();
  });
});
