import { describe, expect, it } from "vitest";
import { cerebrasProvider } from "./provider.js";

describe("cerebras agent provider", () => {
  it("declares metadata and env", () => {
    expect(cerebrasProvider.id).toBe("cerebras");
    expect(cerebrasProvider.displayName).toBe("Cerebras");
    expect(cerebrasProvider.capabilities.chat).toBe(true);
    expect(cerebrasProvider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "CEREBRAS_API_KEY", required: true },
        { key: "CEREBRAS_BASE_URL", required: false },
        { key: "CEREBRAS_MODEL", required: false },
      ]),
    );
  });

  it("requires CEREBRAS_API_KEY", () => {
    expect(() => cerebrasProvider.validateEnv({})).toThrow("Missing CEREBRAS_API_KEY");
    expect(() => cerebrasProvider.validateEnv({ CEREBRAS_API_KEY: "sk-test" })).not.toThrow();
  });
});
