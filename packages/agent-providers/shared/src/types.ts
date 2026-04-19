export type AgentProviderId = string;

export interface AgentProviderCapabilities {
  chat?: boolean;
  streaming?: boolean;
  toolUse?: boolean;
}

export interface AgentProviderEnvRequirement {
  key: string;
  required: boolean;
}

export interface AgentProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentProviderChatRequest {
  messages: AgentProviderMessage[];
}

export interface AgentProviderChatResponse {
  content: string;
}

export interface AgentProviderHealthcheckResult {
  ok: boolean;
  message?: string;
}

export interface AgentProviderAdapter {
  id: AgentProviderId;
  displayName: string;
  capabilities: AgentProviderCapabilities;

  getRequiredEnv(): AgentProviderEnvRequirement[];
  validateEnv(env: Record<string, string | undefined>): void;

  listModels(): Promise<never>;
  chat(req: AgentProviderChatRequest): Promise<AgentProviderChatResponse>;
  healthcheck(): Promise<AgentProviderHealthcheckResult>;
}
