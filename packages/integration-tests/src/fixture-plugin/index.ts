/**
 * Hermetic fixture plugin for e2e tests.
 *
 * Implements PoEPlugin with trivial tools — no network, no LuaJIT, no external
 * state beyond what a test explicitly opts into via env vars. Loaded by the e2e
 * suites through a temp plugin config (see ../helpers/config.ts), exactly the way
 * a real community plugin would be loaded in production.
 */
import { appendFileSync } from 'node:fs';
import { z } from 'zod';
import type { PoEPlugin, PluginTool } from '@poe-ai/core';

export const echoTool: PluginTool<{ message: string }> = {
  name: 'echo_tool',
  description: 'Echoes the given message back unchanged. Fixture tool — no side effects.',
  inputSchema: z.object({
    message: z.string().describe('The message to echo back'),
  }),
  async handler(input) {
    return { content: [{ type: 'text', text: input.message }] };
  },
};

export const failTool: PluginTool<Record<string, never>> = {
  name: 'fail_tool',
  description: 'Always throws inside its handler. Fixture tool for exercising tool-call error handling.',
  inputSchema: z.object({}),
  async handler() {
    throw new Error('fail_tool always fails');
  },
};

export const slowTool: PluginTool<Record<string, never>> = {
  name: 'slow_tool',
  description: 'Sleeps for ~2 seconds before responding. Fixture tool for concurrency tests.',
  inputSchema: z.object({}),
  async handler() {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { content: [{ type: 'text', text: 'slow_tool finished sleeping' }] };
  },
};

const FixturePlugin: PoEPlugin = {
  name: '@poe-ai/integration-tests-fixture',
  version: '0.0.0',
  patchCompatibility: '*',

  async initialize(ctx) {
    ctx.logger.info('[fixture-plugin] initialized');

    // If a test wants to assert plugin initialization only happens once (e.g. across
    // many concurrent HTTP requests hitting a lazily-initialized server), it points
    // this at a temp file; each initialize() call appends one line to it.
    const initLogPath = process.env.FIXTURE_INIT_LOG;
    if (initLogPath) {
      appendFileSync(initLogPath, `${process.pid}:${Date.now()}\n`);
    }
  },

  tools: [echoTool, failTool, slowTool],
};

export default FixturePlugin;
