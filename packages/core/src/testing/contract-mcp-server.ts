import { describe, expect, it } from 'vitest';
import type { McpServer, StdioMcpConfig } from '../mcp-server.js';
import { fakeConnectContext } from './harness.js';

export interface McpServerContractOptions {
  sampleConfig: StdioMcpConfig;
}

export function contractTestMcpServer(server: McpServer<StdioMcpConfig>, opts: McpServerContractOptions): void {
  describe(`${server.id} MCP server contract`, () => {
    it('has MCP server metadata', () => {
      expect(server.id).toMatch(/^mcp-server-/);
      expect(server.label.length).toBeGreaterThan(0);
      expect(typeof server.callTool).toBe('function');
    });

    it('supports dry-run tool calls without starting the MCP subprocess', async () => {
      const ctx = { ...fakeConnectContext({}), dryRun: true };
      const result = await server.callTool(ctx, { name: 'example_tool', arguments: { value: 1 } }, opts.sampleConfig);
      expect(result.content?.[0]?.type).toBe('text');
      expect(result.content?.[0]?.text).toContain('example_tool');
    });
  });
}
