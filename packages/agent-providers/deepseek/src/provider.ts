import { createOpenAICompatibleProvider } from "@profullstack/sh1pt-agent-provider-shared";

export const deepseekProvider = createOpenAICompatibleProvider({
  id: "deepseek",
  displayName: "DeepSeek",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  baseUrlEnv: "DEEPSEEK_BASE_URL",
  modelEnv: "DEEPSEEK_MODEL",
  defaultBaseURL: "https://api.deepseek.com",
  defaultModel: "deepseek-v4-flash",
});
