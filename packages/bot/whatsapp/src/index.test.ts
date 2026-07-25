import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("parses positive integer environment limits", () => {
    const config = loadConfig({
      SESSION_TIMEOUT_MS: "60000",
      MAX_OUTPUT_LENGTH: "1200",
      MAX_CONCURRENT_SESSIONS: "3",
    });

    expect(config.sessionTimeoutMs).toBe(60000);
    expect(config.maxOutputLength).toBe(1200);
    expect(config.maxConcurrentSessions).toBe(3);
  });

  it("rejects partially parsed and non-integer environment limits", () => {
    expect(() => loadConfig({ SESSION_TIMEOUT_MS: "10abc" })).toThrow(
      "SESSION_TIMEOUT_MS must be a positive integer"
    );
    expect(() => loadConfig({ MAX_OUTPUT_LENGTH: "1.5" })).toThrow(
      "MAX_OUTPUT_LENGTH must be a positive integer"
    );
    expect(() => loadConfig({ MAX_CONCURRENT_SESSIONS: "0" })).toThrow(
      "MAX_CONCURRENT_SESSIONS must be a positive integer"
    );
  });
});
