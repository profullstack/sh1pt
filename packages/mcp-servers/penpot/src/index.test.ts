import { describe, expect, it } from 'vitest';
import { contractTestMcpServer, fakeConnectContext } from '@profullstack/sh1pt-core/testing';
import adapter from './index.js';

contractTestMcpServer(adapter, {
  sampleConfig: { command: 'node', args: ['--version'] },
});

describe('mcp-server-penpot stdio tool calls', () => {
  it('calls an MCP tool over newline-delimited stdio JSON-RPC', async () => {
    const script = `
      const readline = require('node:readline');
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', (line) => {
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'fake-penpot', version: '0.0.0' }
            }
          }));
        }
        if (msg.method === 'tools/call') {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: 'called ' + msg.params.name + ' for ' + msg.params.arguments.fileId }]
            }
          }));
        }
      });
    `;
    const ctx = { ...fakeConnectContext({}), dryRun: false };

    const result = await adapter.callTool(ctx, {
      name: 'inspect_file',
      arguments: { fileId: 'file-123' },
    }, {
      command: process.execPath,
      args: ['-e', script],
      timeoutMs: 5_000,
    });

    expect(result.content?.[0]).toEqual({
      type: 'text',
      text: 'called inspect_file for file-123',
    });
  });
});
