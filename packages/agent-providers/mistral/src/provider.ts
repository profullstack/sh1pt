import { createOpenAICompatibleProvider } from "@profullstack/sh1pt-agent-provider-shared";

export const mistralProvider = createOpenAICompatibleProvider({
  id: "mistral",
  displayName: "Mistral",
  apiKeyEnv: "MISTRAL_API_KEY",
  baseUrlEnv: "MISTRAL_BASE_URL",
  modelEnv: "MISTRAL_MODEL",
  defaultBaseURL: "https://api.mistral.ai/v1",
  defaultModel: "mistral-large-latest",
});
