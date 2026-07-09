import { describe, expect, it } from "vitest";
import { xaiProvider } from "./provider.js";

describe("xai agent provider", () => {
  it("declares metadata and env", () => {
    expect(xaiProvider.id).toBe("xai");
    expect(xaiProvider.displayName).toBe("xAI");
    expect(xaiProvider.capabilities.chat).toBe(true);
    expect(xaiProvider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "XAI_API_KEY", required: true },
        { key: "XAI_BASE_URL", required: false },
        { key: "XAI_MODEL", required: false },
      ]),
    );
  });

  it("requires XAI_API_KEY", () => {
    expect(() => xaiProvider.validateEnv({})).toThrow("Missing XAI_API_KEY");
    expect(() => xaiProvider.validateEnv({ XAI_API_KEY: "sk-test" })).not.toThrow();
  });
});
