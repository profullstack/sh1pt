import { createOpenAICompatibleProvider } from "@profullstack/sh1pt-agent-provider-shared";

export const cerebrasProvider = createOpenAICompatibleProvider({
  id: "cerebras",
  displayName: "Cerebras",
  apiKeyEnv: "CEREBRAS_API_KEY",
  baseUrlEnv: "CEREBRAS_BASE_URL",
  modelEnv: "CEREBRAS_MODEL",
  defaultBaseURL: "https://api.cerebras.ai/v1",
  defaultModel: "gpt-oss-120b",
});
