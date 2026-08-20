/**
 * Small, curated gem knowledge tables used by the classifier and the PoB adapter.
 *
 * Why this exists instead of pulling tags live from the PoB bridge: `getSocketGroups()`
 * (see plugin-pob's pob-bridge.lua `api.getSocketGroups`) returns gem name/level/quality/
 * enabled — not the gem's tag table. Rather than doing bridge surgery to expose PoB's
 * internal tag data for v1, we ship a curated subset here, hand-checked against
 * `pob-data/src/Data/Gems.lua`'s `tags = { ... }` table for the specific gems this
 * package's archetypes and classifier signals care about. This is intentionally not
 * exhaustive — extend it as new archetypes need more gems.
 */

/**
 * Reservation "buff aura" active skill gems — i.e. gems in Gems.lua tagged
 * `aura = true` AND `grants_active_skill = true` AND NOT `support = true`, filtered to
 * the conventional self/party reservation buffs that "aura stacking" itemization
 * actually targets.
 *
 * Excluded on purpose even though Gems.lua also tags them `aura = true`:
 *   - Totem/mine/trap skills whose "aura" tag reflects a periodic pulse effect around
 *     the totem/mine (Rejuvenation Totem, Icicle Mine, Pyroclast Mine, Stormblast Mine,
 *     Summon Skitterbots, Smite) — not a reservation buff relevant to aura-stacking gear.
 *   - Support gems (Blasphemy, Awakened Blasphemy, Generosity, Awakened Generosity,
 *     Arrogance, Divine/Eternal/Guardian's Blessing) — these are counted separately
 *     below via BLASPHEMY_SUPPORT_NAMES, since they turn a *curse* into a reservation
 *     aura rather than being a standalone skill gem.
 *
 * Checked against pob-data/src/Data/Gems.lua at the patch pinned for this package
 * (3.29) — see PR description for the extraction method.
 */
export const RESERVATION_AURA_GEM_NAMES: ReadonlySet<string> = new Set([
  'Anger',
  'Hatred',
  'Wrath',
  'Discipline',
  'Determination',
  'Grace',
  'Purity of Fire',
  'Purity of Ice',
  'Purity of Lightning',
  'Purity of Elements',
  'Vitality',
  'Clarity',
  'Haste',
  'Zealotry',
  'Precision',
  'Pride',
  'Malevolence',
  'Flesh and Stone',
  'War Banner',
  'Dread Banner',
  'Defiance Banner',
]);

/** Support gems that convert a linked curse into a reservation aura (counts as +1 aura per linked curse). */
export const BLASPHEMY_SUPPORT_NAMES: ReadonlySet<string> = new Set([
  'Blasphemy',
  'Awakened Blasphemy',
]);

/**
 * Curated gem-name -> tag-set lookup, hand-checked against Gems.lua `tags = {...}` for
 * the main skills referenced by this package's seed archetype signals. Tag vocabulary
 * matches Gems.lua exactly (e.g. "physical", "fire", "duration", "attack", "spell") —
 * note PoB's data has no explicit "bleed" or "damage_over_time" tag; bleed-focused
 * skills are identified by name pattern in the archetype signals instead, per the
 * grounding check performed for this PR.
 */
export const GEM_TAGS: Readonly<Record<string, readonly string[]>> = {
  'Righteous Fire': ['area', 'fire', 'spell'],
  'Vaal Righteous Fire': ['area', 'fire', 'spell', 'duration', 'vaal'],
  Lacerate: ['area', 'attack', 'melee', 'physical'],
  Puncture: ['attack', 'bow', 'projectile', 'physical', 'duration'],
  'Blade Flurry': ['area', 'attack', 'channelling', 'melee'],
  Sunder: ['area', 'attack', 'melee', 'slam'],
  Reap: ['area', 'spell', 'physical', 'duration'],
  'Corrupting Fever': ['spell', 'physical', 'duration'],
  'Viper Strike': ['attack', 'melee', 'strike', 'chaos', 'duration'],
  Fireball: ['area', 'fire', 'spell', 'projectile'],
  'Scorching Ray': ['channelling', 'fire', 'spell', 'duration'],
  'Fire Trap': ['area', 'fire', 'spell', 'trap', 'duration'],
  'Blazing Salvo': ['area', 'fire', 'spell', 'projectile'],
  Cremation: ['area', 'fire', 'spell', 'projectile', 'duration'],
  'Wintertide Brand': ['area', 'cold', 'spell', 'brand', 'duration'],
};

/**
 * Returns the tag set for a gem name (case-insensitive), or an empty array if unknown.
 * An unknown gem is not an error — it just means gemTags-based signals won't match it;
 * namePatterns-based signals still work for gems outside this table.
 */
export function tagsForGem(gemName: string): readonly string[] {
  const key = Object.keys(GEM_TAGS).find((k) => k.toLowerCase() === gemName.toLowerCase());
  return key ? GEM_TAGS[key] : [];
}
