import { describe, expect, it } from 'vitest';
import { callHttpMcpTool } from './mcp-server.js';

describe('callHttpMcpTool', () => {
  it('throws JSON-RPC errors returned by JSON responses', async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { id: number; method: string };
      callCount++;

      if (body.method === 'initialize') {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: { protocolVersion: '2025-03-26', capabilities: {} },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: 'unknown tool' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    try {
      await expect(callHttpMcpTool(
        { log: () => {}, secret: () => undefined, dryRun: false },
        { name: 'missing-tool' },
        {},
        { url: 'https://example.test/mcp' },
      )).rejects.toThrow('MCP error -32601: unknown tool');
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
