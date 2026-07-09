import {
  callHttpMcpTool,
  defineMcpServer,
  setupGuide,
  type HttpMcpConfig,
  type McpToolCall,
} from '@profullstack/sh1pt-core';

export interface SpecificationWebsiteMcpConfig extends HttpMcpConfig {
  // No auth required — override url to point at a self-hosted instance if needed.
}

const DEFAULT_URL = 'https://mcp.specification.website/mcp';

export default defineMcpServer<SpecificationWebsiteMcpConfig>({
  id: 'mcp-server-specification-website',
  label: 'Specification Website MCP server',
  description: 'Calls the specification.website MCP tools (search, list_topics, get_topic, get_checklist) via Streamable HTTP.',

  async callTool(ctx, call: McpToolCall, config) {
    return callHttpMcpTool(ctx, call, config, {
      url: DEFAULT_URL,
      label: 'specification-website',
      timeoutMs: 30_000,
    });
  },

  setup: setupGuide<SpecificationWebsiteMcpConfig>({
    label: 'Specification Website MCP server',
    vendorDocUrl: 'https://specification.website/mcp/',
    config: { url: DEFAULT_URL },
    steps: [
      'No authentication required — the specification.website MCP server is public.',
      `Default endpoint: ${DEFAULT_URL}`,
      'Available tools: search, list_topics, get_topic, get_checklist.',
      'To point at a self-hosted instance, set url in the config.',
    ],
  }),
});
