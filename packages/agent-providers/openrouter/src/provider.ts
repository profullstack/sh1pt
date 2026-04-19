import {
  AgentProviderAdapter,
  AgentProviderNotImplementedError,
  AgentProviderConfigError,
} from "@sh1pt/agent-provider-shared";

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

  async chat() {
    throw new AgentProviderNotImplementedError("openrouter.chat");
  },

  async healthcheck() {
    return { ok: true, message: "env validated only" };
  },
};
