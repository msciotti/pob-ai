/**
 * Integration test: wiki plugin tools are registered and exposed via MCP.
 *
 * This is the missing layer between unit tests (which test the wiki client in
 * isolation) and end-to-end tests (which require a real MCP host). It verifies
 * that the actual plugin-wiki module, when loaded through PoeAiMcpServer, results
 * in the expected tool names appearing in the MCP tool listing.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PoeAiMcpServer } from '../server.js';

// Stub loadConfig so the server doesn't read ~/.config/poe-ai/config.json in CI
vi.mock('../config/index.js', () => ({
  loadConfig: vi.fn().mockReturnValue({
    league: 'Standard',
    patchVersion: '3.26.0',
    hardcore: false,
    ssf: false,
    plugins: ['@poe-ai/plugin-wiki'],
    cacheTtlMs: 60_000,
    cacheMaxSize: 500,
    httpMinIntervalMs: 0,
  }),
}));

// Minimal in-memory transport — same pattern as src/mcp/__tests__/test-helpers.ts
class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId = `test-${Date.now()}-${Math.random()}`;

  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const a = new InMemoryTransport();
    const b = new InMemoryTransport();
    a.peer = b;
    b.peer = a;
    return [a, b];
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.peer) throw new Error('Transport not connected to peer');
    setImmediate(() => this.peer?.onmessage?.(message));
  }

  async close(): Promise<void> {
    this.onclose?.();
    this.peer?.onclose?.();
    this.onmessage = undefined;
    this.onclose = undefined;
    this.peer = null;
  }
}

async function startServer(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = new PoeAiMcpServer();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe('PoeAiMcpServer + plugin-wiki integration', () => {
  it('exposes all four wiki tools in the MCP tool listing', async () => {
    const { client, cleanup } = await startServer();

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('wiki_lookup');
    expect(names).toContain('get_skill_info');
    expect(names).toContain('get_item_info');
    expect(names).toContain('get_passive_info');

    await cleanup();
  });

  it('each wiki tool has a description and inputSchema', async () => {
    const { client, cleanup } = await startServer();

    const { tools } = await client.listTools();
    const wikiTools = tools.filter((t) =>
      ['wiki_lookup', 'get_skill_info', 'get_item_info', 'get_passive_info'].includes(t.name)
    );

    expect(wikiTools).toHaveLength(4);
    for (const tool of wikiTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }

    await cleanup();
  });

  it('wiki_lookup returns a valid ToolResult shape when called', async () => {
    const { client, cleanup } = await startServer();

    // The handler calls WikiClient which makes an HTTP request. We don't stub the
    // HTTP client here — we just verify the response envelope is correct regardless
    // of whether the wiki lookup succeeds or fails gracefully.
    const result = await client.callTool({
      name: 'wiki_lookup',
      arguments: { query: 'Fireball' },
    });

    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]).toHaveProperty('type', 'text');
    expect(typeof (result.content[0] as { type: string; text: string }).text).toBe('string');

    await cleanup();
  });

  it('wiki_lookup returns an error for invalid input (empty query string)', async () => {
    const { client, cleanup } = await startServer();

    // Zod's min(1) check causes the MCP server to return isError: true
    const result = await client.callTool({ name: 'wiki_lookup', arguments: { query: '' } });
    expect(result.isError).toBe(true);

    await cleanup();
  });

  it('get_skill_info returns a valid ToolResult shape when called', async () => {
    const { client, cleanup } = await startServer();

    const result = await client.callTool({
      name: 'get_skill_info',
      arguments: { skillName: 'Fireball' },
    });

    expect(result.content[0]).toHaveProperty('type', 'text');

    await cleanup();
  });
});
