/**
 * Real-plugin smoke test: stdio-loads the actual @poe-ai/plugin-wiki (hits the real
 * PoE wiki over the network) through the BUILT server, and calls one real tool.
 *
 * Off by default — run explicitly:
 *   WIKI_INTEGRATION=true pnpm --filter @poe-ai/integration-tests test
 *
 * Same gating convention as packages/plugin-wiki's own network integration test.
 */
import { existsSync } from 'node:fs';
import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MAIN_STDIO_JS } from '../helpers/paths.js';
import { writeTempConfig, type TempConfigHandle } from '../helpers/config.js';

const RUN = process.env.WIKI_INTEGRATION === 'true';

function processEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return { ...env, ...overrides };
}

describe.skipIf(!RUN)('plugin-wiki smoke test (real network)', () => {
  const configs: TempConfigHandle[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
    configs.splice(0).forEach((c) => c.cleanup());
  });

  it(
    'loads the real plugin-wiki over stdio and wiki_lookup returns real content',
    async () => {
      expect(existsSync(MAIN_STDIO_JS), `Built server not found at ${MAIN_STDIO_JS} — run "pnpm -r build" first`).toBe(
        true,
      );

      const config = writeTempConfig({ plugins: ['@poe-ai/plugin-wiki'] });
      configs.push(config);

      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [MAIN_STDIO_JS],
        env: processEnv({ POE_AI_CONFIG_PATH: config.configPath }),
      });
      const client = new Client({ name: 'e2e-wiki-smoke', version: '1.0.0' }, { capabilities: {} });
      clients.push(client);
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('wiki_lookup');

      const result = await client.callTool({ name: 'wiki_lookup', arguments: { query: 'Fireball' } });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content.length).toBeGreaterThan(0);
      expect(content[0].text.length).toBeGreaterThan(0);
    },
    30_000,
  );
});
