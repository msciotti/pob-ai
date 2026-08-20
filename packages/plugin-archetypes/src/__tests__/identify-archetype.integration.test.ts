/**
 * Integration test — loads a real build through plugin-pob's LuaJIT runtime and runs
 * identify_archetype against it. Not required (the classifier/tool suites above cover
 * the logic with a mocked ctx and no LuaJIT dependency) but useful as a real-world sanity
 * check that the pob-adapter's assumptions about getSocketGroups/getAllocatedNodes/etc.
 * hold against an actual PoB build, not just hand-built fixtures.
 *
 * Run with:
 *   ARCHETYPES_INTEGRATION=true pnpm --filter @poe-ai/plugin-archetypes test
 *
 * Skipped by default — requires LuaJIT + the bundled/downloaded PoB data (see plugin-pob's
 * postinstall) and is slower than the unit suites.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';
import { LuaJITRuntime, getPobPath } from '@poe-ai/plugin-pob';
import { identifyArchetypeTool } from '../tools/identify-archetype.js';

const RUN = process.env['ARCHETYPES_INTEGRATION'] === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeCtx(runtime: LuaJITRuntime): PluginContext {
  return {
    pobRuntime: runtime as unknown as PluginContext['pobRuntime'],
    http: { get: async () => { throw new Error('not used'); }, post: async () => { throw new Error('not used'); } },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.29.0', hardcore: false, ssf: false },
    logger: { info: console.log, warn: console.warn, error: console.error, debug: () => {} },
  };
}

describe.skipIf(!RUN)('identify_archetype (integration, real PoB build)', () => {
  let runtime: LuaJITRuntime;

  beforeAll(async () => {
    const pobPath = await getPobPath(process.env['POB_PATH']);
    runtime = new LuaJITRuntime({ pobPath });
    await runtime.initialize();
  }, 60000);

  afterAll(async () => {
    await runtime?.destroy();
  });

  it('classifies the shared sample build without throwing', async () => {
    const buildPath = join(__dirname, '..', '..', '..', '..', 'test-data', 'sample-build.txt');
    const xml = await readFile(buildPath, 'utf-8');
    await runtime.loadBuildFromXML(xml, 'Archetype Integration Test');

    const result = await identifyArchetypeTool.handler({}, makeCtx(runtime));

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.length).toBeGreaterThan(0);
    console.log(result.content[0].text);
  }, 30000);
});
