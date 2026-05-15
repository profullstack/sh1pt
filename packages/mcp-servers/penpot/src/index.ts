import {
  callStdioMcpTool,
  defineMcpServer,
  setupGuide,
  type McpToolCall,
  type StdioMcpConfig,
} from '@profullstack/sh1pt-core';

export interface PenpotMcpConfig extends StdioMcpConfig {
  mode?: 'local' | 'remote';
}

const DEFAULT_COMMAND = 'npx';
const DEFAULT_ARGS = ['-y', '@penpot/mcp@stable'];

export default defineMcpServer<PenpotMcpConfig>({
  id: 'mcp-server-penpot',
  label: 'Penpot MCP server',
  description: 'Calls Penpot MCP tools from sh1pt through a configured stdio MCP server.',
  defaultCommand: DEFAULT_COMMAND,
  defaultArgs: DEFAULT_ARGS,

  async callTool(ctx, call: McpToolCall, config) {
    return callStdioMcpTool(ctx, call, config, {
      command: DEFAULT_COMMAND,
      args: DEFAULT_ARGS,
      label: 'penpot',
      timeoutMs: 30_000,
    });
  },

  setup: setupGuide<PenpotMcpConfig>({
    label: 'Penpot MCP server',
    vendorDocUrl: 'https://help.penpot.app/mcp/',
    config: {
      mode: 'local',
      command: DEFAULT_COMMAND,
      args: DEFAULT_ARGS,
    },
    steps: [
      'Use Penpot local MCP when a design file needs agent access through the Penpot plugin.',
      'Start the server with `npx @penpot/mcp@stable` and keep it running while the design file is open.',
      'In Penpot, load the plugin from `http://localhost:4400/manifest.json` and connect it to the MCP server.',
      'For remote Penpot MCP, configure command/args through a stdio bridge such as `mcp-remote` and keep tokens in the vault.',
    ],
  }),
});
