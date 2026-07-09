import { createOpenAICompatibleProvider } from "@profullstack/sh1pt-agent-provider-shared";

export const xaiProvider = createOpenAICompatibleProvider({
  id: "xai",
  displayName: "xAI",
  apiKeyEnv: "XAI_API_KEY",
  baseUrlEnv: "XAI_BASE_URL",
  modelEnv: "XAI_MODEL",
  defaultBaseURL: "https://api.x.ai/v1",
  defaultModel: "grok-4.3",
});
