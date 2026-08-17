import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';
import type { BuildProfile } from '../runtime/luajit-runtime.js';

const inputSchema = z.object({
  code: z.string().describe(
    'PoB build code to compare against. Accepted formats: raw base64 export code, ' +
    'or a pastebin/pobb.in URL (the code will be extracted from the URL).'
  ),
  label: z.string().optional().describe(
    'Display label for the comparison build, e.g. "Meta Boneshatter Jugg". ' +
    'Used in output for clarity.'
  ),
});

type Input = z.infer<typeof inputSchema>;

/** Stats where a lower value is better. */
const LOWER_IS_BETTER = new Set<string>();

/** Ordered stat keys to include in the comparison output. */
const COMPARISON_STATS: Array<{ key: string; label: string }> = [
  // Offense
  { key: 'TotalDPS',                   label: 'Total DPS' },
  { key: 'AverageDamage',              label: 'Average Hit' },
  { key: 'CritChance',                 label: 'Crit Chance (%)' },
  { key: 'CritMultiplier',             label: 'Crit Multi (%)' },
  { key: 'HitChance',                  label: 'Hit Chance (%)' },
  // Health pools
  { key: 'Life',                       label: 'Life' },
  { key: 'EnergyShield',               label: 'Energy Shield' },
  { key: 'Ward',                        label: 'Ward' },
  // Max single hit you can survive per damage type
  { key: 'PhysicalMaximumHitTaken',    label: 'Max Phys Hit' },
  { key: 'FireMaximumHitTaken',        label: 'Max Fire Hit' },
  { key: 'ColdMaximumHitTaken',        label: 'Max Cold Hit' },
  { key: 'LightningMaximumHitTaken',   label: 'Max Lightning Hit' },
  { key: 'ChaosMaximumHitTaken',       label: 'Max Chaos Hit' },
  // Mitigation layers
  { key: 'PhysicalDamageReduction',    label: 'Phys Reduction (%)' },
  { key: 'EvadeChance',                label: 'Evade Chance (%)' },
  { key: 'BlockChance',                label: 'Block Chance (%)' },
  { key: 'SpellBlockChance',           label: 'Spell Block (%)' },
  // Resistances
  { key: 'FireResist',                 label: 'Fire Resist (%)' },
  { key: 'ColdResist',                 label: 'Cold Resist (%)' },
  { key: 'LightningResist',            label: 'Lightning Resist (%)' },
  { key: 'ChaosResist',               label: 'Chaos Resist (%)' },
  // Recovery
  { key: 'NetLifeRegen',               label: 'Life Regen/s' },
  { key: 'EnergyShieldRegen',          label: 'ES Regen/s' },
];

/** Extract a raw build code from a pastebin or pobb.in URL, or return as-is. */
function extractCode(input: string): string {
  const trimmed = input.trim();
  // pastebin.com/XXXX or pastebin.com/raw/XXXX
  const pastebin = trimmed.match(/pastebin\.com\/(?:raw\/)?([A-Za-z0-9]+)/);
  if (pastebin) return pastebin[1];
  // pobb.in/XXXX
  const pobbin = trimmed.match(/pobb\.in\/([A-Za-z0-9]+)/);
  if (pobbin) return pobbin[1];
  return trimmed;
}

export const compareBuildsTool: PluginTool<Input> = {
  name: 'compare_builds',
  description:
    'Compare the currently loaded build against another build from a PoB export code or ' +
    'pastebin/pobb.in URL. Returns a stat-by-stat diff (your build vs theirs) for DPS, ' +
    'defense, resistances, and more. ' +
    'NOTE: After this call your primary build is replaced — use load_build to reload it.',
  inputSchema,

  async handler(input: Input, ctx: PluginContext) {
    if (!ctx.pobRuntime) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'plugin-pob is not loaded' }) }],
        isError: true,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runtime = ctx.pobRuntime as any;

    try {
      const code = extractCode(input.code);
      const label = input.label ?? 'Comparison Build';

      ctx.logger.info(`[compare_builds] Loading comparison build: ${label}`);
      const result = await runtime.compareBuilds(code, label) as {
        primary: BuildProfile;
        compare: BuildProfile;
        primaryReplaced: boolean;
      };

      const { primary, compare } = result;

      // ── Stat diff ──────────────────────────────────────────────────────────
      const statComparison: Record<string, {
        yours: number;
        theirs: number;
        delta: number;
        deltaPercent: number;
        theirsBetter: boolean;
      }> = {};

      for (const { key, label: statLabel } of COMPARISON_STATS) {
        const yours = primary.stats[key] ?? 0;
        const theirs = compare.stats[key] ?? 0;
        if (yours === 0 && theirs === 0) continue;

        const delta = theirs - yours;
        const deltaPercent =
          yours !== 0 ? Math.round((delta / Math.abs(yours)) * 1000) / 10 : 0;
        const lowerIsBetter = LOWER_IS_BETTER.has(key);
        const theirsBetter = lowerIsBetter ? delta < 0 : delta > 0;

        statComparison[statLabel] = {
          yours: Math.round(yours * 10) / 10,
          theirs: Math.round(theirs * 10) / 10,
          delta: Math.round(delta * 10) / 10,
          deltaPercent,
          theirsBetter,
        };
      }

      // ── Keystone diff ──────────────────────────────────────────────────────
      const yoursKeystones = new Set(primary.keystones);
      const theirsKeystones = new Set(compare.keystones);
      const keystoneComparison = {
        onlyYours: primary.keystones.filter(k => !theirsKeystones.has(k)),
        onlyTheirs: compare.keystones.filter(k => !yoursKeystones.has(k)),
        shared: primary.keystones.filter(k => theirsKeystones.has(k)),
      };

      // ── Notable diff (only differences, shared list is noisy) ───────────────
      const yoursNotables = new Set(primary.notables);
      const theirsNotables = new Set(compare.notables);
      const notableComparison = {
        onlyYours: primary.notables.filter(n => !theirsNotables.has(n)),
        onlyTheirs: compare.notables.filter(n => !yoursNotables.has(n)),
      };

      // ── Unique item diff ───────────────────────────────────────────────────
      const yoursUniques = Object.fromEntries(primary.uniqueItems.map(u => [u.slot, u.name]));
      const theirsUniques = Object.fromEntries(compare.uniqueItems.map(u => [u.slot, u.name]));
      const allSlots = new Set([
        ...Object.keys(yoursUniques),
        ...Object.keys(theirsUniques),
      ]);
      const uniqueComparison: Record<string, { yours: string | null; theirs: string | null; same: boolean }> = {};
      for (const slot of [...allSlots].sort()) {
        const y = yoursUniques[slot] ?? null;
        const t = theirsUniques[slot] ?? null;
        uniqueComparison[slot] = { yours: y, theirs: t, same: y === t };
      }

      const output = {
        success: true,
        comparisonLabel: label,
        warning:
          'Your primary build has been replaced by the comparison build. ' +
          'Use load_build to reload your original build.',
        statComparison,
        keystoneComparison,
        notableComparison,
        uniqueItemComparison: uniqueComparison,
        mainSkill: {
          yours: primary.mainSkill,
          theirs: compare.mainSkill,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: (err as Error).message,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
