/**
 * Stdio e2e suite — drives the BUILT server (`packages/core/dist/main-stdio.js`)
 * over a real stdio transport with the official MCP SDK Client, the way a real
 * agent client (Claude Code, hermes, etc.) actually launches an MCP server.
 *
 * Requires `pnpm -r build` to have run first.
 */
import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { MAIN_STDIO_JS } from '../helpers/paths.js';
import { writeTempConfig, FIXTURE_PLUGIN_SPECIFIER, type TempConfigHandle } from '../helpers/config.js';
import { createAjv, assertValidJsonSchema } from '../helpers/schema.js';
import { spawnNode } from '../helpers/process.js';

const FIXTURE_TOOL_NAMES = ['echo_tool', 'fail_tool', 'slow_tool'];

function processEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return { ...env, ...overrides };
}

interface StdioSession {
  client: Client;
  transport: StdioClientTransport;
}

function startStdioClient(configPath: string, extraEnv: Record<string, string> = {}): StdioSession {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MAIN_STDIO_JS],
    env: processEnv({ POE_AI_CONFIG_PATH: configPath, ...extraEnv }),
  });
  const client = new Client({ name: 'e2e-stdio-client', version: '1.0.0' }, { capabilities: {} });
  return { client, transport };
}

async function closeSession(session: StdioSession): Promise<void> {
  await session.client.close().catch(() => {});
  await session.transport.close().catch(() => {});
}

describe('stdio e2e', () => {
  beforeAll(() => {
    expect(existsSync(MAIN_STDIO_JS), `Built server not found at ${MAIN_STDIO_JS} — run "pnpm -r build" first`).toBe(
      true,
    );
  });

  const sessions: StdioSession[] = [];
  const configs: TempConfigHandle[] = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map(closeSession));
    configs.splice(0).forEach((c) => c.cleanup());
  });

  function newSession(pluginSpecifiers?: string[]): { client: Client; configPath: string } {
    const config = writeTempConfig(pluginSpecifiers ? { plugins: pluginSpecifiers } : undefined);
    configs.push(config);
    const session = startStdioClient(config.configPath);
    sessions.push(session);
    return { client: session.client, configPath: config.configPath };
  }

  it('completes the initialize handshake within a bounded time', async () => {
    const { client } = newSession();
    const start = Date.now();
    // client.connect() spawns the subprocess (via the transport) and performs the
    // full MCP initialize handshake before resolving.
    await client.connect(sessions[0].transport);
    expect(Date.now() - start).toBeLessThan(10_000);
  });

  it('tools/list returns the fixture tools, each with a valid 2020-12 JSON Schema inputSchema', async () => {
    const { client } = newSession();
    await client.connect(sessions[0].transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of FIXTURE_TOOL_NAMES) {
      expect(names).toContain(expected);
    }

    const ajv = createAjv();
    for (const tool of tools) {
      expect(tool.inputSchema, `tool "${tool.name}" has no inputSchema`).toBeDefined();
      assertValidJsonSchema(ajv, tool.inputSchema, tool.name);
    }
  });

  it('tools/call happy path returns a proper ToolResult', async () => {
    const { client } = newSession();
    await client.connect(sessions[0].transport);

    const result = await client.callTool({ name: 'echo_tool', arguments: { message: 'hello e2e' } });
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toEqual([{ type: 'text', text: 'hello e2e' }]);
  });

  it('a handler throw comes back as isError:true, and the server stays alive', async () => {
    const { client } = newSession();
    await client.connect(sessions[0].transport);

    const failed = await client.callTool({ name: 'fail_tool', arguments: {} });
    expect(failed.isError).toBe(true);

    // Server must still be responsive after the failure — not crashed.
    const ok = await client.callTool({ name: 'echo_tool', arguments: { message: 'still alive' } });
    expect(ok.isError).not.toBe(true);
  });

  it('malformed arguments (wrong shape at the protocol level) produce a JSON-RPC error, not a crash', async () => {
    const { client } = newSession();
    await client.connect(sessions[0].transport);

    // `arguments` must be an object per the MCP CallToolRequest schema; sending a
    // string fails validation before our tool handler (or even our own zod
    // re-validation) ever runs, at the protocol layer — this must surface as a
    // JSON-RPC error, distinct from a tool-level isError result.
    await expect(
      client.request(
        { method: 'tools/call', params: { name: 'echo_tool', arguments: 'not-an-object' } },
        CallToolResultSchema,
      ),
    ).rejects.toThrow();

    // Server must still be responsive after the malformed request.
    const ok = await client.callTool({ name: 'echo_tool', arguments: { message: 'still alive' } });
    expect(ok.isError).not.toBe(true);
  });

  it('a nonexistent plugin in the config is skipped — the server still starts and serves the other plugins', async () => {
    const { client } = newSession([FIXTURE_PLUGIN_SPECIFIER, '@poe-ai/this-plugin-does-not-exist']);
    await client.connect(sessions[0].transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of FIXTURE_TOOL_NAMES) {
      expect(names).toContain(expected);
    }
  });

  describe('stdout purity', () => {
    it('every line the subprocess writes to stdout parses as a JSON-RPC message', async () => {
      const config = writeTempConfig();
      try {
        const proc = spawnNode(MAIN_STDIO_JS, { env: { POE_AI_CONFIG_PATH: config.configPath } });
        try {
          proc.child.stdin.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'purity-check', version: '1.0.0' },
              },
            }) + '\n',
          );
          proc.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          proc.child.stdin.write(
            JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n',
          );

          // Wait for the tools/list response to show up before inspecting stdout.
          const start = Date.now();
          while (!proc.stdoutChunks.join('').includes('"id":2') && Date.now() - start < 10_000) {
            await new Promise((r) => setTimeout(r, 25));
          }

          const raw = proc.stdoutChunks.join('');
          const lines = raw.split('\n').filter((line) => line.trim().length > 0);
          expect(lines.length).toBeGreaterThan(0);
          for (const line of lines) {
            let parsed: unknown;
            expect(() => {
              parsed = JSON.parse(line);
            }, `stdout line was not valid JSON: ${line}`).not.toThrow();
            expect((parsed as { jsonrpc?: string }).jsonrpc, `stdout line was not JSON-RPC: ${line}`).toBe('2.0');
          }
        } finally {
          await proc.kill();
        }
      } finally {
        config.cleanup();
      }
    });
  });
});
