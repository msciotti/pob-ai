import { z } from 'zod';
import type { PluginTool, PluginContext } from '@poe-ai/core';

// ─────────────────────────────────────────────────────────────────────────────
// Static harvest craft data
//
// Harvest crafts are a finite, patch-stable list defined by the Harvest league
// mechanic itself, not by per-item game data -- RePoE's exports have no
// harvest-craft domain/generation_type at all (checked: the full set of
// mods.min.json domain/generation_type values contains nothing harvest-shaped).
// So, same as before this migration, we keep this as a hardcoded list rather
// than a scraped or generated one. This file is now fully self-contained --
// no HTTP fetching, no CraftingClient dependency.
// ─────────────────────────────────────────────────────────────────────────────

export interface HarvestCraft {
  name: string;
  description: string;
  /** Harvest colour that produces this craft: yellow, blue, purple, red */
  colour: 'yellow' | 'blue' | 'purple' | 'red';
  /** Tag associated with the craft operation, e.g. "life", "caster" */
  tag: string;
  /** Broad applicability — not always 1-to-1 with PoE item classes */
  applicableTo: string[];
  operation: 'reforge' | 'augment' | 'remove-add' | 'remove' | 'other';
}

const HARVEST_CRAFTS: HarvestCraft[] = [
  // ── Reforge keeping prefix/suffix ──────────────────────────────────────────
  {
    name: 'Reforge keeping prefixes',
    description: 'Reforge a magic or rare item with new random modifiers, keeping all prefixes.',
    colour: 'yellow',
    tag: 'reforge',
    applicableTo: ['any'],
    operation: 'reforge',
  },
  {
    name: 'Reforge keeping suffixes',
    description: 'Reforge a magic or rare item with new random modifiers, keeping all suffixes.',
    colour: 'yellow',
    tag: 'reforge',
    applicableTo: ['any'],
    operation: 'reforge',
  },
  // ── Augment ─────────────────────────────────────────────────────────────────
  {
    name: 'Augment a life modifier',
    description: 'Add a new life modifier to a magic or rare item that has no life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['any'],
    operation: 'augment',
  },
  {
    name: 'Augment a caster modifier',
    description: 'Add a new caster modifier to a magic or rare item that has no caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment an attack modifier',
    description: 'Add a new attack modifier to a magic or rare item that has no attack modifier.',
    colour: 'yellow',
    tag: 'attack',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a defence modifier',
    description: 'Add a new defence modifier to a magic or rare item that has no defence modifier.',
    colour: 'purple',
    tag: 'defence',
    applicableTo: ['armour'],
    operation: 'augment',
  },
  {
    name: 'Augment a physical modifier',
    description: 'Add a new physical modifier to a magic or rare item that has no physical modifier.',
    colour: 'yellow',
    tag: 'physical',
    applicableTo: ['weapon', 'armour'],
    operation: 'augment',
  },
  {
    name: 'Augment a fire modifier',
    description: 'Add a new fire modifier to a magic or rare item that has no fire modifier.',
    colour: 'red',
    tag: 'fire',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a cold modifier',
    description: 'Add a new cold modifier to a magic or rare item that has no cold modifier.',
    colour: 'blue',
    tag: 'cold',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a lightning modifier',
    description: 'Add a new lightning modifier to a magic or rare item that has no lightning modifier.',
    colour: 'yellow',
    tag: 'lightning',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a chaos modifier',
    description: 'Add a new chaos modifier to a magic or rare item that has no chaos modifier.',
    colour: 'purple',
    tag: 'chaos',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'augment',
  },
  {
    name: 'Augment a speed modifier',
    description: 'Add a new speed modifier to a magic or rare item that has no speed modifier.',
    colour: 'yellow',
    tag: 'speed',
    applicableTo: ['boots', 'gloves', 'belt'],
    operation: 'augment',
  },
  // ── Remove-Add (non-destructive reroll of one tag) ─────────────────────────
  {
    name: 'Remove a life modifier, then add a new caster modifier',
    description: 'Remove a life modifier from a rare item, then add a new caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a caster modifier, then add a new life modifier',
    description: 'Remove a caster modifier from a rare item, then add a new life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove an attack modifier, then add a new caster modifier',
    description: 'Remove an attack modifier from a rare item, then add a new caster modifier.',
    colour: 'blue',
    tag: 'caster',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a caster modifier, then add a new attack modifier',
    description: 'Remove a caster modifier from a rare item, then add a new attack modifier.',
    colour: 'yellow',
    tag: 'attack',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a physical modifier, then add a new fire modifier',
    description: 'Remove a physical modifier from a rare item, then add a new fire modifier.',
    colour: 'red',
    tag: 'fire',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a fire modifier, then add a new cold modifier',
    description: 'Remove a fire modifier from a rare item, then add a new cold modifier.',
    colour: 'blue',
    tag: 'cold',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a cold modifier, then add a new lightning modifier',
    description: 'Remove a cold modifier from a rare item, then add a new lightning modifier.',
    colour: 'yellow',
    tag: 'lightning',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a lightning modifier, then add a new chaos modifier',
    description: 'Remove a lightning modifier from a rare item, then add a new chaos modifier.',
    colour: 'purple',
    tag: 'chaos',
    applicableTo: ['weapon', 'armour', 'accessory'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a defence modifier, then add a new life modifier',
    description: 'Remove a defence modifier from a rare item, then add a new life modifier.',
    colour: 'yellow',
    tag: 'life',
    applicableTo: ['armour'],
    operation: 'remove-add',
  },
  {
    name: 'Remove a life modifier, then add a new defence modifier',
    description: 'Remove a life modifier from a rare item, then add a new defence modifier.',
    colour: 'purple',
    tag: 'defence',
    applicableTo: ['armour'],
    operation: 'remove-add',
  },
];

export function getHarvestOptions(tag?: string, itemClass?: string): HarvestCraft[] {
  let results = HARVEST_CRAFTS;

  if (tag) {
    const lowerTag = tag.toLowerCase();
    results = results.filter((c) => c.tag.toLowerCase() === lowerTag);
  }

  if (itemClass) {
    const lowerClass = itemClass.toLowerCase();
    results = results.filter(
      (c) =>
        c.applicableTo.includes('any') ||
        c.applicableTo.some((a) => a.toLowerCase().includes(lowerClass)) ||
        lowerClass.includes(c.applicableTo.find((a) => lowerClass.includes(a)) ?? '__no_match__')
    );
  }

  return results;
}

const inputSchema = z.object({
  tag: z
    .string()
    .optional()
    .describe(
      'Harvest tag filter: life, caster, attack, defence, physical, fire, cold, lightning, chaos, speed, reforge'
    ),
  itemClass: z
    .string()
    .optional()
    .describe('Item class filter to narrow down applicability'),
});

type Input = z.infer<typeof inputSchema>;

export const harvestOptionsTool: PluginTool<Input> = {
  name: 'crafting_harvest_options',
  description:
    'List available Harvest crafting options in Path of Exile. ' +
    'Filter by tag (e.g. "life", "caster") or item class to find relevant crafts. ' +
    'Harvest crafts include augment, remove-add, and reforge operations tied to specific modifier tags.',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: inputSchema as any,

  async handler({ tag, itemClass }: Input, ctx: PluginContext) {
    try {
      ctx.logger.info(
        `[crafting_harvest_options] Listing harvest options` +
          (tag ? ` tag="${tag}"` : '') +
          (itemClass ? ` itemClass="${itemClass}"` : '')
      );

      const results = getHarvestOptions(tag, itemClass);

      ctx.logger.info(`[crafting_harvest_options] Returned ${results.length} option(s)`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: results.length, crafts: results }, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.logger.error(`[crafting_harvest_options] Failed: ${msg}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: msg }),
          },
        ],
        isError: true,
      };
    }
  },
};
