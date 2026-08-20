import { describe, it, expect, vi } from 'vitest';
import type { PluginContext } from '@poe-ai/core';
import { TtlCache } from '@poe-ai/core';
import { listArchetypesTool } from '../tools/list-archetypes.js';
import { archetypeInfoTool } from '../tools/archetype-info.js';
import { identifyArchetypeTool } from '../tools/identify-archetype.js';

function makeCtx(pobRuntime?: unknown): PluginContext {
  return {
    pobRuntime,
    http: { get: vi.fn(), post: vi.fn() },
    cache: new TtlCache(),
    leagueState: { currentLeague: 'Standard', patchVersion: '3.29.0', hardcore: false, ssf: false },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('list_archetypes', () => {
  it('lists all five seed archetypes with a one-line summary each', async () => {
    const result = await listArchetypesTool.handler({}, makeCtx());
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    for (const slug of [
      'righteous-fire-regen-tank',
      'aura-stacker',
      'armour-stacker',
      'phys-dot-bleed',
      'ignite-elementalist',
    ]) {
      expect(text).toContain(slug);
    }
  });
});

describe('archetype_info', () => {
  it('returns the full formatted entry for a known slug', async () => {
    const result = await archetypeInfoTool.handler({ archetype: 'righteous-fire-regen-tank' }, makeCtx());
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Righteous Fire Regen Tank');
    expect(text).toContain('Scaling vectors');
    expect(text).toContain('Dead stats');
    expect(text).toContain('Failure modes');
  });

  it('returns a clear error for an unknown slug, listing known slugs', async () => {
    const result = await archetypeInfoTool.handler({ archetype: 'not-a-real-archetype' }, makeCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('aura-stacker');
  });
});

describe('identify_archetype', () => {
  it('returns a clear non-error message when plugin-pob is not loaded', async () => {
    const result = await identifyArchetypeTool.handler({}, makeCtx(undefined));
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.toLowerCase()).toContain('plugin-pob');
  });

  it('returns a clear non-error message when no build is loaded', async () => {
    const runtime = {
      getAscendancy: vi.fn().mockRejectedValue(new Error('No build loaded')),
      getCharacterClass: vi.fn().mockRejectedValue(new Error('No build loaded')),
      getAllocatedNodes: vi.fn().mockRejectedValue(new Error('No build loaded')),
      getSocketGroups: vi.fn().mockRejectedValue(new Error('No build loaded')),
      getEquippedItems: vi.fn().mockRejectedValue(new Error('No build loaded')),
      getBuildStats: vi.fn().mockRejectedValue(new Error('No build loaded')),
    };
    const result = await identifyArchetypeTool.handler({}, makeCtx(runtime));
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text.toLowerCase()).toContain('load_build');
  });

  it('classifies a loaded build and details the top match', async () => {
    const runtime = {
      getAscendancy: vi.fn().mockResolvedValue('Guardian'),
      getCharacterClass: vi.fn().mockResolvedValue('Templar'),
      getAllocatedNodes: vi.fn().mockResolvedValue([]),
      getSocketGroups: vi.fn().mockResolvedValue([
        {
          enabled: true,
          gems: [{ name: 'Righteous Fire', enabled: true, support: false, tags: { area: true, fire: true, spell: true } }],
        },
      ]),
      getEquippedItems: vi.fn().mockResolvedValue([]),
      getBuildStats: vi.fn().mockResolvedValue({ Life: 5200, EnergyShield: 150, FireResist: 76, TotalDPS: 250000 }),
    };
    const result = await identifyArchetypeTool.handler({}, makeCtx(runtime));
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('Righteous Fire Regen Tank');
    expect(text).toContain('Top match detail');
    expect(text).toContain('Failure mode checklist');
    // FireResist 76 >= 75 threshold in the failure mode statCheck, so it should read as OK, not flagged.
    expect(text).toContain('OK — FireResist is 76');
  });

  it('flags a stat-detectable failure mode when the build actually has the problem', async () => {
    const runtime = {
      getAscendancy: vi.fn().mockResolvedValue('Guardian'),
      getCharacterClass: vi.fn().mockResolvedValue('Templar'),
      getAllocatedNodes: vi.fn().mockResolvedValue([]),
      getSocketGroups: vi.fn().mockResolvedValue([
        {
          enabled: true,
          gems: [{ name: 'Righteous Fire', enabled: true, support: false, tags: { area: true, fire: true, spell: true } }],
        },
      ]),
      getEquippedItems: vi.fn().mockResolvedValue([]),
      getBuildStats: vi.fn().mockResolvedValue({ Life: 5200, EnergyShield: 150, FireResist: 40, TotalDPS: 250000 }),
    };
    const result = await identifyArchetypeTool.handler({}, makeCtx(runtime));
    const text = result.content[0].text;
    expect(text).toContain('⚠️ FLAGGED — FireResist is 40');
  });

  it('returns the "no known archetype" message honestly for an out-of-scope build', async () => {
    const runtime = {
      getAscendancy: vi.fn().mockResolvedValue('Deadeye'),
      getCharacterClass: vi.fn().mockResolvedValue('Ranger'),
      getAllocatedNodes: vi.fn().mockResolvedValue([]),
      getSocketGroups: vi.fn().mockResolvedValue([
        { enabled: true, gems: [{ name: 'Tornado Shot', enabled: true, support: false, tags: { bow: true, attack: true, projectile: true } }] },
      ]),
      getEquippedItems: vi.fn().mockResolvedValue([]),
      getBuildStats: vi.fn().mockResolvedValue({ Life: 4000, TotalDPS: 1000000 }),
    };
    const result = await identifyArchetypeTool.handler({}, makeCtx(runtime));
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('No known archetype matched');
  });
});
