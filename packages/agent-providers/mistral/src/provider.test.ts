import { describe, expect, it } from "vitest";
import { mistralProvider } from "./provider.js";

describe("mistral agent provider", () => {
  it("declares metadata and env", () => {
    expect(mistralProvider.id).toBe("mistral");
    expect(mistralProvider.displayName).toBe("Mistral");
    expect(mistralProvider.capabilities.chat).toBe(true);
    expect(mistralProvider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "MISTRAL_API_KEY", required: true },
        { key: "MISTRAL_BASE_URL", required: false },
        { key: "MISTRAL_MODEL", required: false },
      ]),
    );
  });

  it("requires MISTRAL_API_KEY", () => {
    expect(() => mistralProvider.validateEnv({})).toThrow("Missing MISTRAL_API_KEY");
    expect(() => mistralProvider.validateEnv({ MISTRAL_API_KEY: "sk-test" })).not.toThrow();
  });
});
