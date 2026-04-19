import {
  AgentProviderAdapter,
  AgentProviderNotImplementedError,
  AgentProviderConfigError,
} from "@sh1pt/agent-provider-shared";
import axios from "axios";

export const openrouterProvider: AgentProviderAdapter = {
  id: "openrouter",
  displayName: "OpenRouter",
  capabilities: { chat: true },

  getRequiredEnv() {
    return [
      { key: "OPENROUTER_API_KEY", required: true },
      { key: "OPENROUTER_BASE_URL", required: false },
      { key: "OPENROUTER_HTTP_REFERER", required: false },
      { key: "OPENROUTER_X_TITLE", required: false },
    ];
  },

  validateEnv(env) {
    if (!env.OPENROUTER_API_KEY) {
      throw new AgentProviderConfigError("Missing OPENROUTER_API_KEY");
    }
  },

  async listModels() {
    throw new AgentProviderNotImplementedError("openrouter.listModels");
  },

  async chat(req) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new AgentProviderConfigError("Missing OPENROUTER_API_KEY");
    }

    const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    const res = await axios.post(
      `${baseURL}/chat/completions`,
      {
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        messages: req.messages,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(process.env.OPENROUTER_HTTP_REFERER
            ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
            : {}),
          ...(process.env.OPENROUTER_X_TITLE
            ? { "X-Title": process.env.OPENROUTER_X_TITLE }
            : {}),
        },
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter empty response");
    }

    return { content };
  },

  async healthcheck() {
    return { ok: true, message: "env validated only" };
  },
};
