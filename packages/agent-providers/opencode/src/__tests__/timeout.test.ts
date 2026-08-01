import { describe, expect, it } from "vitest";
import { createOpencodeProvider } from "../provider";

describe("opencode timeout configuration", () => {
  const provider = createOpencodeProvider();

  it.each(["15000ms", "1e3", "1.5", "Infinity", "9007199254740992"])(
    "rejects a non-decimal positive integer: %s",
    (timeout) => {
      expect(() => provider.validateEnv({ OPENCODE_TIMEOUT_MS: timeout })).toThrow("positive integer");
    },
  );

  it("accepts surrounding whitespace around a valid decimal integer", () => {
    expect(() => provider.validateEnv({ OPENCODE_TIMEOUT_MS: " 15000 " })).not.toThrow();
  });
});
