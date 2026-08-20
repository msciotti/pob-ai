import type { PluginContext } from '@poe-ai/core';
import type { BuildProfile } from './classifier.js';
import { RESERVATION_AURA_GEM_NAMES, BLASPHEMY_SUPPORT_NAMES } from './gem-knowledge.js';

export type PobAdapterResult = { ok: true; profile: BuildProfile } | { ok: false; reason: string };

interface BridgeGem {
  name: string;
  enabled: boolean;
  support?: boolean;
  tags?: Record<string, boolean>;
}

interface BridgeSocketGroup {
  enabled: boolean;
  gems: BridgeGem[];
}

/**
 * Builds a plain BuildProfile from the currently loaded PoB build via ctx.pobRuntime.
 *
 * What this adapter CAN see (v1, current bridge):
 *   - main skill (best-effort: first non-support gem in the "main" socket group, using
 *     the same enabled-group heuristic get_build_summary already uses), plus its gem
 *     tags — via the `tags`/`support` fields added to getSocketGroups() in this PR
 *   - keystones and ascendancy — via getAllocatedNodes()/getAscendancy()
 *   - aura count — derived from RESERVATION_AURA_GEM_NAMES + Blasphemy-linked curses
 *     across enabled socket groups (see gem-knowledge.ts for what's counted and why)
 *   - equipped unique/relic items — via getEquippedItems()
 *   - key stats — via getBuildStats()
 *
 * What it can NOT see and leaves undefined rather than guessing: anything not exposed
 * by the bridge at all (e.g. flask setup, cluster jewel notables as a distinct signal
 * from regular tree keystones — they already show up via getAllocatedNodes if allocated).
 *
 * getAscendancy()/getSocketGroups()/getAllocatedNodes()/getEquippedItems()/
 * getCharacterClass() are implemented by LuaJITRuntime but are NOT part of the minimal
 * `PobRuntime` interface in @poe-ai/core/types.ts (that interface intentionally stays
 * small so core doesn't depend on plugin-pob internals) — get_build_summary.ts already
 * casts to the concrete runtime type to reach them, and this adapter does the same.
 */
export async function buildProfileFromPobRuntime(ctx: PluginContext): Promise<PobAdapterResult> {
  if (!ctx.pobRuntime) {
    return {
      ok: false,
      reason:
        'No PoB runtime available — @poe-ai/plugin-pob is not loaded, so there is no build to classify. ' +
        'Add "@poe-ai/plugin-pob" to your plugins list.',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runtime = ctx.pobRuntime as any;

  let ascendancy: string;
  let characterClass: string;
  let allocatedNodes: Array<{ name: string; isKeystone: boolean }>;
  let socketGroups: BridgeSocketGroup[];
  let equippedItems: Array<{ name: string; rarity: string }>;
  let stats: Record<string, number>;

  try {
    [ascendancy, characterClass, allocatedNodes, socketGroups, equippedItems, stats] = await Promise.all([
      runtime.getAscendancy(),
      runtime.getCharacterClass(),
      runtime.getAllocatedNodes(),
      runtime.getSocketGroups(),
      runtime.getEquippedItems(),
      ctx.pobRuntime.getBuildStats(),
    ]);
  } catch (err) {
    return {
      ok: false,
      reason: `No build loaded — call load_build first (${(err as Error).message}).`,
    };
  }

  const keystones = allocatedNodes.filter((n) => n.isKeystone).map((n) => n.name);

  const mainSkillGroup = socketGroups.find((g) => g.enabled) ?? socketGroups[0] ?? null;
  const mainSkillGem = mainSkillGroup?.gems.find((g) => g.enabled && !g.support) ?? null;
  const mainSkill = mainSkillGem
    ? {
        name: mainSkillGem.name,
        gemTags: Object.entries(mainSkillGem.tags ?? {})
          .filter(([, present]) => present)
          .map(([tag]) => tag),
      }
    : null;

  let auraCount = 0;
  for (const group of socketGroups) {
    if (!group.enabled) continue;
    for (const gem of group.gems) {
      if (!gem.enabled) continue;
      if (RESERVATION_AURA_GEM_NAMES.has(gem.name) || BLASPHEMY_SUPPORT_NAMES.has(gem.name)) {
        auraCount++;
      }
    }
  }

  const equippedUniques = equippedItems
    .filter((i) => i.rarity === 'UNIQUE' || i.rarity === 'RELIC')
    .map((i) => i.name);

  const profile: BuildProfile = {
    mainSkill,
    keystones,
    ascendancy: ascendancy || null,
    characterClass: characterClass || null,
    auraCount,
    equippedUniques,
    stats,
  };

  return { ok: true, profile };
}
