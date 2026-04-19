export class AgentProviderNotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented`);
  }
}

export class AgentProviderConfigError extends Error {}

export class AgentProviderRequestError extends Error {}
