import { AgentProviderAdapter } from "./types";

const registry = new Map<string, AgentProviderAdapter>();

export function registerAgentProvider(p: AgentProviderAdapter) {
  registry.set(p.id, p);
}

export function getAgentProvider(id: string) {
  return registry.get(id);
}

export function listAgentProviders() {
  return [...registry.values()];
}
