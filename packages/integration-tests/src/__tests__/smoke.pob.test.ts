/**
 * Real-plugin smoke test: stdio-loads the actual @poe-ai/plugin-pob (spawns the
 * real LuaJIT subprocess against the downloaded pob-data) through the BUILT
 * server, and calls one real tool.
 *
 * Off by default — run explicitly (after `pnpm install` has fetched pob-data):
 *   POB_INTEGRATION=true pnpm --filter @poe-ai/integration-tests test
 */
import { existsSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MAIN_STDIO_JS } from '../helpers/paths.js';
import { writeTempConfig, type TempConfigHandle } from '../helpers/config.js';

const RUN = process.env.POB_INTEGRATION === 'true';

function processEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return { ...env, ...overrides };
}

describe.skipIf(!RUN)('plugin-pob smoke test (real LuaJIT)', () => {
  const configs: TempConfigHandle[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
    configs.splice(0).forEach((c) => c.cleanup());
  });

  it(
    'loads the real plugin-pob over stdio (LuaJIT subprocess boots) and get_build_summary returns a ToolResult',
    async () => {
      expect(existsSync(MAIN_STDIO_JS), `Built server not found at ${MAIN_STDIO_JS} — run "pnpm -r build" first`).toBe(
        true,
      );

      const config = writeTempConfig({ plugins: ['@poe-ai/plugin-pob'] });
      configs.push(config);

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [MAIN_STDIO_JS],
        env: processEnv({ POE_AI_CONFIG_PATH: config.configPath }),
      });
      const client = new Client({ name: 'e2e-pob-smoke', version: '1.0.0' }, { capabilities: {} });
      clients.push(client);
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('get_build_summary');

      // No build is loaded — this just proves the real LuaJIT round trip and MCP
      // wiring work end-to-end; it must come back as a well-formed ToolResult
      // (isError is fine either way) rather than hanging or crashing the server.
      const result = await client.callTool({ name: 'get_build_summary', arguments: {} });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(Array.isArray(content)).toBe(true);
      expect(content.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
