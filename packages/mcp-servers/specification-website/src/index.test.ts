import { describe, expect, it } from 'vitest';
import { contractTestMcpServer, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestMcpServer(adapter, {
  sampleConfig: { url: 'https://mcp.specification.website/mcp' },
});

describe('mcp-server-specification-website HTTP tool calls', () => {
  it('calls an MCP tool over Streamable HTTP JSON-RPC', async () => {
    // Intercept fetch with a minimal stub so we don't hit the real server in unit tests.
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { method: string; id: number };
      callCount++;
      if (body.method === 'initialize') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (body.method === 'tools/call') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'spec result' }] } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const ctx = { ...fakeConnectContext({}), dryRun: false };
      const result = await adapter.callTool(ctx, { name: 'search', arguments: { query: 'performance' } }, {});
      expect(result.content?.[0]).toEqual({ type: 'text', text: 'spec result' });
      expect(callCount).toBe(2); // initialize + tools/call
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = originalFetch;
    }
  });

  it('parses SSE JSON-RPC payloads split across multiple data lines', async () => {
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { method: string; id: number };
      if (body.method === 'initialize') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: {} } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (body.method === 'tools/call') {
        return new Response(
          [
            `data: {"jsonrpc":"2.0","id":${body.id},`,
            'data: "result":{"content":[{"type":"text","text":"split spec result"}]}}',
            '',
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const ctx = { ...fakeConnectContext({}), dryRun: false };
      const result = await adapter.callTool(ctx, { name: 'search', arguments: { query: 'performance' } }, {});
      expect(result.content?.[0]).toEqual({ type: 'text', text: 'split spec result' });
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = originalFetch;
    }
  });
});
