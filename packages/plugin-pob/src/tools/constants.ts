/**
 * Key build statistics used across multiple tools to provide immediate feedback
 * without requiring a separate get_build_stats call.
 */
export const KEY_BUILD_STATS = [
  'Level',
  'Life',
  'TotalDPS',
  'EnergyShield',
  'Armour',
  'Evasion',
  'HitChance',        // attack accuracy — <95% is a red flag for attack builds
  'BlockChance',
  'PhysicalTakenHitMult',  // physical mitigation ratio
] as const;
