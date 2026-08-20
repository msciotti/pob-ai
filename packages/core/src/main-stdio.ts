#!/usr/bin/env node

/**
 * poe-ai MCP Server Entry Point — stdio transport
 *
 * Communicates with the parent process over stdin/stdout, the transport used by
 * MCP-aware agent clients (Claude Code, hermes, etc.) that launch MCP servers as
 * local subprocesses, as opposed to main.ts's HTTP transport.
 *
 * IMPORTANT: stdout is reserved exclusively for JSON-RPC message framing. A single
 * stray console.log/process.stdout.write from this file, core, or a loaded plugin
 * corrupts the protocol stream for the client. All logging — here and in
 * ConsoleLogger — goes to stderr instead.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PoeAiMcpServer } from './server.js';

const poeServer = new PoeAiMcpServer();

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await poeServer.connect(transport);
  console.error('[poe-ai] stdio server ready');
}

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.error(`[poe-ai] Received ${signal}, shutting down gracefully...`);
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

main().catch((error) => {
  console.error('[poe-ai] Fatal error during startup:', error);
  process.exit(1);
});
