#!/usr/bin/env node

/**
 * `poe-ai` CLI entry point — currently just dispatches to `poe-ai init`
 * (packages/core/src/cli/init.ts). Exposed as a bin alongside `poe-ai-mcp`
 * (see main-stdio.ts), which stays the actual MCP server entry point.
 */
import { runInit } from './init.js';

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (subcommand === 'init') {
    await runInit(rest, {
      io: { input: process.stdin, output: process.stdout },
      isInteractive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    });
    return;
  }

  if (subcommand === undefined || subcommand === '--help' || subcommand === '-h') {
    console.log('Usage: poe-ai <command>\n\nCommands:\n  init    Set up ~/.config/poe-ai/config.json and download what enabled plugins need\n');
    return;
  }

  console.error(`Unknown command: "${subcommand}". Run "poe-ai --help" for usage.`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[poe-ai] Fatal error:', error);
  process.exitCode = 1;
});
