#!/usr/bin/env node

/**
 * poe-ai MCP Server Entry Point
 *
 * Starts an HTTP server that exposes the MCP protocol. Plugins listed in
 * ~/.config/poe-ai/config.json are loaded dynamically on first connection.
 *
 * Compatible with:
 * - Claude Desktop
 * - MCP Inspector: npx @modelcontextprotocol/inspector
 * - Web-based LLMs (claude.ai, etc.)
 */

import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { PoeAiMcpServer } from './server.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const app = express();

// Parse JSON request bodies
app.use(express.json());

// Create the MCP server instance (reusable across requests)
const poeServer = new PoeAiMcpServer();

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'poe-ai',
    version: '0.1.0',
  });
});

// MCP endpoint — handles all MCP protocol communication
app.post('/mcp', async (req, res) => {
  try {
    // A new transport is created for each request. With sessionIdGenerator set to
    // undefined the SDK operates in stateless HTTP mode: each transport is
    // single-use and self-contained, so calling poeServer.connect() per request
    // is the correct pattern — the MCP server re-attaches to each transport
    // independently. This also prevents JSON-RPC request ID collisions between
    // concurrent clients.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Clean up transport when response is closed
    res.on('close', () => {
      transport.close();
    });

    // Connect server to this transport and handle the request
    await poeServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[poe-ai] Error handling MCP request:', error);
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

// Start the HTTP server. PORT=0 asks the OS for an ephemeral free port — useful for
// tests and for running multiple instances side by side; the actually-bound port is
// read back from the server's address() once listening starts, since it may differ
// from the requested PORT (0 → OS-assigned).
const httpServer = app.listen(PORT, () => {
  const address = httpServer.address();
  const boundPort = address && typeof address === 'object' ? address.port : PORT;
  console.error(`[poe-ai] Server running on http://localhost:${boundPort}/mcp`);
  console.error(`[poe-ai] Health check: http://localhost:${boundPort}/health`);
  console.error('[poe-ai] Ready to accept connections');
}).on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[poe-ai] Port ${PORT} is already in use by another process. ` +
      `Set the PORT environment variable to a free port (or PORT=0 to let the OS pick one) and try again.`,
    );
  } else {
    console.error('[poe-ai] Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.error(`[poe-ai] Received ${signal}, shutting down gracefully...`);

  // Stop accepting new connections and wait for all in-flight requests to finish
  // before tearing down the MCP layer underneath them.
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  console.error('[poe-ai] HTTP server closed');

  // Close the MCP server only after the HTTP layer is fully drained.
  try {
    await poeServer.close();
  } catch (error) {
    console.error('[poe-ai] Error during MCP server shutdown:', error);
  }

  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Catch-all error handlers
process.on('uncaughtException', (error) => {
  console.error('[poe-ai] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[poe-ai] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
