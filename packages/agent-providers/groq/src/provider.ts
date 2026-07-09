import { createOpenAICompatibleProvider } from "@profullstack/sh1pt-agent-provider-shared";

export const groqProvider = createOpenAICompatibleProvider({
  id: "groq",
  displayName: "Groq",
  apiKeyEnv: "GROQ_API_KEY",
  baseUrlEnv: "GROQ_BASE_URL",
  modelEnv: "GROQ_MODEL",
  defaultBaseURL: "https://api.groq.com/openai/v1",
  defaultModel: "llama-3.3-70b-versatile",
});
