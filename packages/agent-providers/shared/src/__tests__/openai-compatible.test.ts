import { describe, expect, it, vi } from "vitest";
import { AgentProviderConfigError } from "../errors.js";
import { createOpenAICompatibleProvider } from "../openai-compatible.js";

const config = {
  id: "testai",
  displayName: "TestAI",
  apiKeyEnv: "TESTAI_API_KEY",
  baseUrlEnv: "TESTAI_BASE_URL",
  modelEnv: "TESTAI_MODEL",
  defaultBaseURL: "https://api.test.invalid/v1",
  defaultModel: "test-model",
};

describe("createOpenAICompatibleProvider", () => {
  it("declares provider metadata and env requirements", () => {
    const provider = createOpenAICompatibleProvider(config, { env: {} });

    expect(provider.id).toBe("testai");
    expect(provider.displayName).toBe("TestAI");
    expect(provider.capabilities.chat).toBe(true);
    expect(provider.getRequiredEnv()).toEqual(
      expect.arrayContaining([
        { key: "TESTAI_API_KEY", required: true },
        { key: "TESTAI_BASE_URL", required: false },
        { key: "TESTAI_MODEL", required: false },
      ]),
    );
  });

  it("validates required API key and base URL", () => {
    const provider = createOpenAICompatibleProvider(config, { env: {} });

    expect(() => provider.validateEnv({})).toThrow("Missing TESTAI_API_KEY");
    expect(() => provider.validateEnv({ TESTAI_API_KEY: "sk", TESTAI_BASE_URL: "not-a-url" })).toThrow(
      AgentProviderConfigError,
    );
    expect(() => provider.validateEnv({ TESTAI_API_KEY: "sk" })).not.toThrow();
  });

  it("sends chat completions and returns text", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "hello" } }] }),
    })) as unknown as typeof fetch;
    const provider = createOpenAICompatibleProvider(config, {
      env: { TESTAI_API_KEY: "sk", TESTAI_MODEL: "custom-model" },
      fetch: fetchMock,
    });

    const result = await provider.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result.content).toBe("hello");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test.invalid/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk" }),
      }),
    );
    const body = JSON.parse(String((fetchMock as any).mock.calls[0][1].body));
    expect(body.model).toBe("custom-model");
  });

  it("lists model ids", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "b" }, { id: "a" }] }),
    })) as unknown as typeof fetch;
    const provider = createOpenAICompatibleProvider(config, {
      env: { TESTAI_API_KEY: "sk" },
      fetch: fetchMock,
    });

    await expect(provider.listModels()).resolves.toEqual(["a", "b"]);
  });

  it("includes provider error messages for failed requests", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: { message: "model not found" } }),
    })) as unknown as typeof fetch;
    const provider = createOpenAICompatibleProvider(config, {
      env: { TESTAI_API_KEY: "sk" },
      fetch: fetchMock,
    });

    await expect(provider.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      "TestAI chat 404: model not found",
    );
  });
});
