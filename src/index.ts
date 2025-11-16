#!/usr/bin/env node

/**
 * Path of Building MCP Server Entry Point
 *
 * This server runs on HTTP and can be connected to by:
 * - Claude Desktop
 * - MCP Inspector: npx @modelcontextprotocol/inspector
 * - Web-based LLMs (claude.ai, etc.)
 */

import express from 'express';
import { PobMcpServer } from './mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Create the MCP server instance (reusable across requests)
const pobServer = new PobMcpServer();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'pob-mcp',
    version: '0.1.0',
  });
});

// MCP endpoint - handles all MCP protocol communication
app.post('/mcp', async (req, res) => {
  try {
    // Create a new transport for each request to prevent request ID collisions
    // Different clients may use the same JSON-RPC request IDs
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Clean up transport when response is closed
    res.on('close', () => {
      transport.close();
    });

    // Connect server to this transport and handle the request
    await pobServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[PoB MCP] Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

// Start the server
const server = app.listen(PORT, () => {
  console.error(`[PoB MCP] Server running on http://localhost:${PORT}/mcp`);
  console.error(`[PoB MCP] Health check: http://localhost:${PORT}/health`);
  console.error('[PoB MCP] Ready to accept connections');
}).on('error', (error) => {
  console.error('[PoB MCP] Server error:', error);
  process.exit(1);
});

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.error(`[PoB MCP] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.error('[PoB MCP] HTTP server closed');
  });

  // Close MCP server
  try {
    await pobServer.close();
  } catch (error) {
    console.error('[PoB MCP] Error during shutdown:', error);
  }

  process.exit(0);
};

// Handle termination signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[PoB MCP] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[PoB MCP] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
