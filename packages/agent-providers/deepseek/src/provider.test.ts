import { describe, expect, it } from "vitest";
import { deepseekProvider } from "./provider.js";

describe("deepseek agent provider", () => {
  it("declares metadata and env", () => {
    expect(deepseekProvider.id).toBe("deepseek");
    expect(deepseekProvider.displayName).toBe("DeepSeek");
    expect(deepseekProvider.capabilities.chat).toBe(true);
    expect(deepseekProvider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "DEEPSEEK_API_KEY", required: true },
        { key: "DEEPSEEK_BASE_URL", required: false },
        { key: "DEEPSEEK_MODEL", required: false },
      ]),
    );
  });

  it("requires DEEPSEEK_API_KEY", () => {
    expect(() => deepseekProvider.validateEnv({})).toThrow("Missing DEEPSEEK_API_KEY");
    expect(() => deepseekProvider.validateEnv({ DEEPSEEK_API_KEY: "sk-test" })).not.toThrow();
  });
});
