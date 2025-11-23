/**
 * Test Helpers for MCP Server Testing
 * Provides utilities to test MCP tools without requiring full HTTP setup
 */
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PobMcpServer } from '../server.js';

/**
 * Simple in-memory transport implementation for testing
 * Creates a pair of linked transports that communicate directly
 */
export class InMemoryTransport implements Transport {
  private peer: InMemoryTransport | null = null;
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

  constructor() {
    this.sessionId = `test-session-${Date.now()}-${Math.random()}`;
  }

  static createLinkedPair(): [InMemoryTransport, InMemoryTransport] {
    const transport1 = new InMemoryTransport();
    const transport2 = new InMemoryTransport();

    transport1.peer = transport2;
    transport2.peer = transport1;

    return [transport1, transport2];
  }

  async start(): Promise<void> {
    // No-op for in-memory transport
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.peer) {
      throw new Error('Transport not connected to peer');
    }

    // Send to peer asynchronously
    setImmediate(() => {
      if (this.peer?.onmessage) {
        this.peer.onmessage(message);
      }
    });
  }

  async close(): Promise<void> {
    if (this.onclose) {
      this.onclose();
    }

    if (this.peer?.onclose) {
      this.peer.onclose();
    }

    // Clear event handlers to prevent memory leaks
    this.onmessage = undefined;
    this.onclose = undefined;
    this.onerror = undefined;

    // Clear peer reference
    this.peer = null;
  }
}

/**
 * Creates a test client connected to the PobMcpServer via in-memory transport
 * Returns both the client and server for testing
 */
export async function createTestClient(): Promise<{
  client: Client;
  server: PobMcpServer;
  cleanup: () => Promise<void>;
}> {
  const server = new PobMcpServer();

  // Create in-memory transport pair
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  // Connect server to its transport
  await server.connect(serverTransport);

  // Create and connect client
  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  await client.connect(clientTransport);

  // Cleanup function
  const cleanup = async () => {
    await client.close();
    await server.close();
  };

  return { client, server, cleanup };
}

/**
 * Helper to call a tool and get the result
 * Throws an error if the tool call returns an error response
 */
export async function callTool(
  client: Client,
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  // Throw if the result is an error to match test expectations
  if (result.isError) {
    // Type guard: content is always an array of ContentBlock
    const content = result.content as Array<{ type: string; text?: string }>;
    // Join all text blocks to avoid losing multi-block error messages
    const errorText =
      content
        .map((c) => c.text)
        .filter(Boolean)
        .join('\n') || 'Tool call failed';
    throw new Error(errorText);
  }

  return result;
}
