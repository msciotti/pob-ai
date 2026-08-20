/**
 * HTTP e2e suite — drives the BUILT server (`packages/core/dist/main.js`) over a
 * real StreamableHTTP transport with the official MCP SDK Client.
 *
 * The concurrent-clients test is the regression test for the transport-clobbering
 * bug this branch fixes: PoeAiMcpServer used to `connect()` a single shared
 * McpServer to a fresh transport on every request, so the SDK's Protocol class
 * overwriting its own `_transport` field under concurrency could route one
 * client's response to another. Each connect() now gets its own McpServer.
 *
 * Requires `pnpm -r build` to have run first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MAIN_HTTP_JS } from '../helpers/paths.js';
import { writeTempConfig, type TempConfigHandle } from '../helpers/config.js';
import { spawnNode, type SpawnedProcess } from '../helpers/process.js';

async function startHttpServer(
  configPath: string,
  extraEnv: Record<string, string> = {},
): Promise<{ proc: SpawnedProcess; baseUrl: URL }> {
  const proc = spawnNode(MAIN_HTTP_JS, { env: { PORT: '0', POE_AI_CONFIG_PATH: configPath, ...extraEnv } });
  const match = await proc.waitForStderr(/Server running on (http:\/\/localhost:\d+\/mcp)/);
  return { proc, baseUrl: new URL(match[1]) };
}

async function connectedClient(baseUrl: URL): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(baseUrl);
  const client = new Client({ name: 'e2e-http-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

describe('HTTP e2e', () => {
  beforeAll(() => {
    expect(existsSync(MAIN_HTTP_JS), `Built server not found at ${MAIN_HTTP_JS} — run "pnpm -r build" first`).toBe(
      true,
    );
  });

  const procs: SpawnedProcess[] = [];
  const configs: TempConfigHandle[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
    await Promise.all(procs.splice(0).map((p) => p.kill()));
    configs.splice(0).forEach((c) => c.cleanup());
  });

  it('initialize + tools/list + tools/call all work over StreamableHTTP', async () => {
    const config = writeTempConfig();
    configs.push(config);
    const { proc, baseUrl } = await startHttpServer(config.configPath);
    procs.push(proc);

    const { client } = await connectedClient(baseUrl);
    clients.push(client);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('echo_tool');

    const result = await client.callTool({ name: 'echo_tool', arguments: { message: 'via http' } });
    expect(result.isError).not.toBe(true);
    expect((result.content as Array<{ text: string }>)[0].text).toBe('via http');
  });

  it('/health responds', async () => {
    const config = writeTempConfig();
    configs.push(config);
    const { proc, baseUrl } = await startHttpServer(config.configPath);
    procs.push(proc);

    const res = await fetch(new URL('/health', baseUrl));
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', server: 'poe-ai' });
  });

  it('N concurrent clients get correct, non-interleaved responses (no cross-request transport clobbering)', async () => {
    const config = writeTempConfig();
    configs.push(config);
    const { proc, baseUrl } = await startHttpServer(config.configPath);
    procs.push(proc);

    const CLIENT_COUNT = 6;
    const sessions = await Promise.all(Array.from({ length: CLIENT_COUNT }, () => connectedClient(baseUrl)));
    sessions.forEach((s) => clients.push(s.client));

    const start = Date.now();
    const results = await Promise.all(
      sessions.map((session, i) =>
        i % 2 === 0
          ? session.client.callTool({ name: 'slow_tool', arguments: {} })
          : session.client.callTool({ name: 'echo_tool', arguments: { message: `client-${i}` } }),
      ),
    );
    const elapsedMs = Date.now() - start;

    // Every slow_tool call sleeps ~2s; if they ran concurrently (as they must, on
    // independent transports/McpServer instances) total wall time should stay near
    // 2s, not scale with how many slow calls were in flight.
    expect(elapsedMs).toBeLessThan(6000);

    results.forEach((result, i) => {
      expect(result.isError).not.toBe(true);
      const text = (result.content as Array<{ text: string }>)[0].text;
      if (i % 2 === 0) {
        expect(text).toBe('slow_tool finished sleeping');
      } else {
        // Each client's echo must come back with exactly its own message — proof
        // no response was routed to the wrong client under concurrency.
        expect(text).toBe(`client-${i}`);
      }
    });
  });

  it('plugins initialize exactly once, even across many concurrent requests', async () => {
    const config = writeTempConfig();
    configs.push(config);
    const initLogDir = mkdtempSync(join(tmpdir(), 'poe-ai-init-log-'));
    const initLogPath = join(initLogDir, 'init.log');

    const { proc, baseUrl } = await startHttpServer(config.configPath, { FIXTURE_INIT_LOG: initLogPath });
    procs.push(proc);

    const sessions = await Promise.all(Array.from({ length: 8 }, () => connectedClient(baseUrl)));
    sessions.forEach((s) => clients.push(s.client));
    await Promise.all(sessions.map((s) => s.client.callTool({ name: 'echo_tool', arguments: { message: 'x' } })));

    const lines = readFileSync(initLogPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('occupied-port startup produces a clear, actionable error instead of an unhandled crash', async () => {
    const config = writeTempConfig();
    configs.push(config);

    const { proc: first, baseUrl } = await startHttpServer(config.configPath);
    procs.push(first);
    const occupiedPort = baseUrl.port;

    const second = spawnNode(MAIN_HTTP_JS, {
      env: { PORT: occupiedPort, POE_AI_CONFIG_PATH: config.configPath },
    });
    procs.push(second);

    const exitCode = await second.waitForExit(10_000);
    expect(exitCode).not.toBe(0);
    expect(second.stderrLines.join('\n')).toMatch(/already in use/i);
  });
});
