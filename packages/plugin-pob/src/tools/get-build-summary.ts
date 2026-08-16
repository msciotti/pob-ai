import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import { KEY_BUILD_STATS } from './constants.js';

const inputSchema = z.object({});

type Input = z.infer<typeof inputSchema>;

export const getBuildSummaryTool: PluginTool<Input> = {
  name: 'get_build_summary',
  description:
    'Get a structured snapshot of the currently loaded build: class, ascendancy, main skill ' +
    'and support gems, equipped items, keystones, notables, bandit/pantheon, and key stats. ' +
    'Use this before calling get_meta_builds to compare your build against the meta.',
  inputSchema,

  async handler(_input: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: 'PoB plugin not loaded' }],
        isError: true,
      };
    }

    try {
      ctx.logger.info('[get_build_summary] Fetching build summary...');

      // Cast to the full runtime type — extended methods beyond PobRuntime interface
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const runtime = ctx.pobRuntime as any;

      const [
        characterClass,
        ascendancy,
        buildMeta,
        equippedItems,
        socketGroups,
        allocatedNodes,
        allConfig,
        allStats,
      ] = await Promise.all([
        runtime.getCharacterClass() as Promise<string>,
        runtime.getAscendancy() as Promise<string>,
        runtime.getBuildMeta() as Promise<{
          bandit: string;
          pantheonMajorGod: string;
          pantheonMinorGod: string;
          characterLevel: number;
        }>,
        runtime.getEquippedItems() as Promise<
          Array<{ slot: string; itemId: number; name: string; rarity: string }>
        >,
        runtime.getSocketGroups() as Promise<
          Array<{
            index: number;
            label: string;
            enabled: boolean;
            slot?: string;
            gemCount: number;
            gems: Array<{ name: string; level: number; quality: number; enabled: boolean }>;
          }>
        >,
        runtime.getAllocatedNodes() as Promise<
          Array<{ id: string; name: string; type: string; isKeystone: boolean; isNotable: boolean }>
        >,
        runtime.getAllConfig() as Promise<Record<string, boolean | string | number>>,
        ctx.pobRuntime.getBuildStats(),
      ]);

      // Filter keystones and notables
      const keystones = allocatedNodes
        .filter((n) => n.isKeystone)
        .map((n) => n.name);

      const notables = allocatedNodes
        .filter((n) => n.isNotable && !n.isKeystone)
        .map((n) => n.name);

      // Main skill = first enabled socket group; fall back to first group
      const mainSkillGroup =
        socketGroups.find((g) => g.enabled) ?? socketGroups[0] ?? null;

      // Filter config: only include explicitly set (non-false, non-zero) values
      const configAssumptions: Record<string, boolean | string | number> = {};
      for (const [key, value] of Object.entries(allConfig)) {
        if (value !== false && value !== 0 && value !== null && value !== undefined) {
          configAssumptions[key] = value;
        }
      }

      // Key stats subset
      const keyStats: Record<string, number> = {};
      for (const key of KEY_BUILD_STATS) {
        if (typeof allStats[key] === 'number') {
          keyStats[key] = allStats[key];
        }
      }
      // Also include crit/res since these matter for comparisons
      const extraStats = [
        'CritChance',
        'CritMultiplier',
        'FireResist',
        'ColdResist',
        'LightningResist',
        'ChaosResist',
        'Mana',
        'ManaRegen',
      ];
      for (const key of extraStats) {
        if (typeof allStats[key] === 'number') {
          keyStats[key] = allStats[key];
        }
      }

      const output = {
        success: true,
        characterClass,
        ascendancy,
        characterLevel: buildMeta.characterLevel,
        bandit: buildMeta.bandit,
        pantheonMajor: buildMeta.pantheonMajorGod,
        pantheonMinor: buildMeta.pantheonMinorGod,
        mainSkillGroup: mainSkillGroup
          ? {
              label: mainSkillGroup.label,
              slot: mainSkillGroup.slot,
              gems: mainSkillGroup.gems,
            }
          : null,
        allSkillGroups: socketGroups.map((g) => ({
          label: g.label,
          enabled: g.enabled,
          slot: g.slot,
          gems: g.gems,
        })),
        equippedItems: equippedItems.map((i) => ({
          slot: i.slot,
          name: i.name,
          rarity: i.rarity,
        })),
        keystones,
        notables,
        configAssumptions,
        keyStats,
      };

      ctx.logger.info(
        `[get_build_summary] Complete: ${characterClass}/${ascendancy}, ` +
          `${keystones.length} keystones, ${notables.length} notables, ` +
          `${equippedItems.length} equipped items`
      );

      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.logger.error(`[get_build_summary] Failed: ${errorMessage}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: errorMessage }),
          },
        ],
        isError: true,
      };
    }
  },
};
