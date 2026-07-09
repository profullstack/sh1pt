import {
  AgentProviderConfigError,
  AgentProviderRequestError,
} from "./errors";
import type {
  AgentProviderAdapter,
  AgentProviderChatResponse,
  AgentProviderEnvRequirement,
  AgentProviderMessage,
} from "./types";

export interface OpenAICompatibleProviderConfig {
  id: string;
  displayName: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseURL: string;
  defaultModel: string;
  optionalEnv?: string[];
}

export interface OpenAICompatibleProviderOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
}

interface ModelsResponse {
  data?: Array<{ id?: string }>;
}

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig,
  options: OpenAICompatibleProviderOptions = {},
): AgentProviderAdapter {
  const env = options.env ?? process.env;
  const fetchFn = options.fetch ?? fetch;

  return {
    id: config.id,
    displayName: config.displayName,
    capabilities: { chat: true },

    getRequiredEnv() {
      const envVars: AgentProviderEnvRequirement[] = [
        { key: config.apiKeyEnv, required: true },
        { key: config.baseUrlEnv, required: false },
        { key: config.modelEnv, required: false },
      ];
      for (const key of config.optionalEnv ?? []) {
        envVars.push({ key, required: false });
      }
      return envVars;
    },

    validateEnv(candidateEnv) {
      if (!nonEmpty(candidateEnv[config.apiKeyEnv])) {
        throw new AgentProviderConfigError(`Missing ${config.apiKeyEnv}`);
      }
      resolveBaseURL(config, candidateEnv);
    },

    async listModels() {
      const { apiKey, baseURL } = resolveRuntime(config, env);
      const res = await fetchFn(`${baseURL}/models`, {
        method: "GET",
        headers: authHeaders(apiKey),
      });
      if (!res.ok) {
        throw new AgentProviderRequestError(await formatProviderError(config, "listModels", res));
      }

      const data = (await res.json()) as ModelsResponse;
      return (data.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => Boolean(id))
        .sort();
    },

    async chat(req) {
      const { apiKey, baseURL, model } = resolveRuntime(config, env);
      const res = await fetchFn(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          ...authHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: normalizeMessages(req.messages),
        }),
      });
      if (!res.ok) {
        throw new AgentProviderRequestError(await formatProviderError(config, "chat", res));
      }

      const data = (await res.json()) as ChatCompletionResponse;
      const content = parseContent(data);
      if (!content) {
        throw new AgentProviderRequestError(`${config.displayName} empty response`);
      }
      return { content };
    },

    async healthcheck() {
      this.validateEnv(env);
      return { ok: true, message: "env validated only" };
    },
  };
}

function resolveRuntime(
  config: OpenAICompatibleProviderConfig,
  env: Record<string, string | undefined>,
): { apiKey: string; baseURL: string; model: string } {
  const apiKey = nonEmpty(env[config.apiKeyEnv]);
  if (!apiKey) {
    throw new AgentProviderConfigError(`Missing ${config.apiKeyEnv}`);
  }

  return {
    apiKey,
    baseURL: resolveBaseURL(config, env),
    model: nonEmpty(env[config.modelEnv]) ?? config.defaultModel,
  };
}

function resolveBaseURL(
  config: OpenAICompatibleProviderConfig,
  env: Record<string, string | undefined>,
): string {
  const baseURL = nonEmpty(env[config.baseUrlEnv]) ?? config.defaultBaseURL;
  try {
    return new URL(baseURL).toString().replace(/\/$/, "");
  } catch {
    throw new AgentProviderConfigError(`${config.baseUrlEnv} must be a valid URL`);
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

function normalizeMessages(messages: AgentProviderMessage[]): AgentProviderMessage[] {
  if (messages.length === 0) {
    throw new AgentProviderConfigError("chat requires at least one message");
  }
  return messages;
}

function parseContent(data: ChatCompletionResponse): AgentProviderChatResponse["content"] {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("");
  }
  return "";
}

async function formatProviderError(
  config: OpenAICompatibleProviderConfig,
  operation: "chat" | "listModels",
  res: Response,
): Promise<string> {
  const detail = await readErrorDetail(res);
  return `${config.displayName} ${operation} ${res.status}${detail ? `: ${detail}` : ""}`;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text.trim()) return "";
    try {
      const parsed = JSON.parse(text) as {
        error?: string | { message?: string; type?: string };
        message?: string;
      };
      if (typeof parsed.error === "string") return parsed.error;
      return parsed.error?.message ?? parsed.message ?? text.trim().slice(0, 500);
    } catch {
      return text.trim().slice(0, 500);
    }
  } catch {
    return "";
  }
}
