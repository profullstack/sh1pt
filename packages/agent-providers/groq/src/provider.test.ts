import { describe, expect, it } from "vitest";
import { groqProvider } from "./provider.js";

describe("groq agent provider", () => {
  it("declares metadata and env", () => {
    expect(groqProvider.id).toBe("groq");
    expect(groqProvider.displayName).toBe("Groq");
    expect(groqProvider.capabilities.chat).toBe(true);
    expect(groqProvider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "GROQ_API_KEY", required: true },
        { key: "GROQ_BASE_URL", required: false },
        { key: "GROQ_MODEL", required: false },
      ]),
    );
  });

  it("requires GROQ_API_KEY", () => {
    expect(() => groqProvider.validateEnv({})).toThrow("Missing GROQ_API_KEY");
    expect(() => groqProvider.validateEnv({ GROQ_API_KEY: "sk-test" })).not.toThrow();
  });
});
