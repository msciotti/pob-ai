/**
 * MCP Server for Path of Building
 *
 * This server exposes Path of Building functionality to LLMs via the Model Context Protocol.
 * It provides tools for loading builds, allocating passive nodes, and querying build stats.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export class PobMcpServer {
  private mcpServer: McpServer;

  constructor() {
    // Initialize MCP server with metadata
    this.mcpServer = new McpServer({
      name: 'pob-mcp',
      version: '0.1.0',
    });

    console.error('[PoB MCP] Server initialized');
  }

  /**
   * Connect the MCP server to a transport
   * Can be called multiple times for different transports (stateless HTTP mode)
   */
  async connect(transport: Transport): Promise<void> {
    try {
      await this.mcpServer.connect(transport);
      console.error('[PoB MCP] Server connected to transport');
    } catch (error) {
      console.error('[PoB MCP] Failed to connect to transport:', error);
      throw error;
    }
  }

  /**
   * Gracefully close the server
   */
  async close(): Promise<void> {
    try {
      await this.mcpServer.close();
      console.error('[PoB MCP] Server closed successfully');
    } catch (error) {
      console.error('[PoB MCP] Error closing server:', error);
      throw error;
    }
  }

  /**
   * Get the underlying MCP server instance (for registering tools later)
   */
  getServer(): McpServer {
    return this.mcpServer;
  }
}
