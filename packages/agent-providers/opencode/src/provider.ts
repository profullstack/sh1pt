import {
  AgentProviderAdapter,
  AgentProviderNotImplementedError,
} from "@profullstack/sh1pt-agent-provider-shared";

export const opencodeProvider: AgentProviderAdapter = {
  id: "opencode",
  displayName: "OpenCode",
  capabilities: { chat: true },

  getRequiredEnv() {
    return [];
  },

  validateEnv() {
    // no-op for now
  },

  async listModels() {
    throw new AgentProviderNotImplementedError("opencode.listModels");
  },

  async chat() {
    throw new AgentProviderNotImplementedError("opencode.chat");
  },

  async healthcheck() {
    throw new AgentProviderNotImplementedError("opencode.healthcheck");
  },
};
