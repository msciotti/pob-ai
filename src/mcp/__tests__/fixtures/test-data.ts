/**
 * Test fixtures for MCP server tests
 * Includes sample pastebin codes, mock stats, and other test data
 */

/**
 * Valid pastebin codes (8 alphanumeric characters)
 */
export const VALID_PASTEBIN_CODES = {
  sample1: 'uCLE0msa',
  sample2: 'ABC123de',
  sample3: 'test1234',
  sample4: 'ZYX98765',
} as const;

/**
 * Invalid pastebin codes (various invalid formats)
 */
export const INVALID_PASTEBIN_CODES = {
  tooShort: 'abc123',
  tooLong: 'abc123456',
  withSpecialChars: 'abc-123!',
  withSpaces: 'abc 1234',
  empty: '',
  withUnderscores: 'abc_1234',
} as const;

/**
 * Mock build stats (typical PoB stat names and values)
 */
export const MOCK_BUILD_STATS = {
  basic: {
    Level: 85,
    Life: 5432,
    TotalDPS: 1234567,
    EnergyShield: 0,
    Armour: 12000,
    Evasion: 0,
  },
  highLife: {
    Level: 95,
    Life: 8500,
    TotalDPS: 500000,
    EnergyShield: 0,
    Armour: 45000,
    Evasion: 5000,
  },
  energyShield: {
    Level: 90,
    Life: 1200,
    TotalDPS: 2000000,
    EnergyShield: 7500,
    Armour: 0,
    Evasion: 0,
  },
  hybrid: {
    Level: 88,
    Life: 3500,
    TotalDPS: 800000,
    EnergyShield: 3000,
    Armour: 15000,
    Evasion: 15000,
  },
  empty: {},
} as const;

/**
 * Mock stat deltas (before/after allocation changes)
 */
export const MOCK_STAT_DELTAS = {
  lifeNode: {
    Life: { before: 5000, after: 5200, delta: 200 },
    TotalDPS: { before: 1000000, after: 1000000, delta: 0 },
  },
  damageNode: {
    Life: { before: 5000, after: 5000, delta: 0 },
    TotalDPS: { before: 1000000, after: 1100000, delta: 100000 },
  },
  hybridNode: {
    Life: { before: 5000, after: 5150, delta: 150 },
    TotalDPS: { before: 1000000, after: 1050000, delta: 50000 },
    Armour: { before: 10000, after: 11000, delta: 1000 },
  },
} as const;

/**
 * Mock passive node names
 */
export const MOCK_PASSIVE_NODES = {
  keystone: 'Resolute Technique',
  notable: 'Constitution',
  basic: 'Increased Life',
  jewelSocket: 'Jewel Socket',
  notFound: 'Non Existent Node',
} as const;

/**
 * Mock allocated nodes
 */
export const MOCK_ALLOCATED_NODES = [
  { id: '1', name: 'Strength +10', type: 'Normal' },
  { id: '2', name: 'Constitution', type: 'Notable' },
  { id: '3', name: 'Resolute Technique', type: 'Keystone' },
] as const;

/**
 * Build names for testing
 */
export const MOCK_BUILD_NAMES = {
  default: 'Imported Build',
  custom: 'My Test Build',
  withSpecialChars: "Build with 'quotes' and symbols!",
  empty: '',
} as const;

/**
 * Mock item data
 */
export const MOCK_ITEMS = {
  weapon: {
    text: 'Mock Weapon\nRarity: UNIQUE\n+100 to Strength',
    slot: 'Weapon 1',
  },
  helmet: {
    text: 'Mock Helmet\nRarity: RARE\n+50 to Life',
    slot: 'Helmet',
  },
  bodyArmour: {
    text: 'Mock Body Armour\nRarity: UNIQUE\n+1000 to Armour',
    slot: 'Body Armour',
  },
} as const;

/**
 * Mock gem data
 */
export const MOCK_GEMS = {
  mainSkill: [
    { name: 'Fireball', level: 20, quality: 20 },
    { name: 'Spell Echo', level: 20, quality: 0 },
    { name: 'Elemental Focus', level: 20, quality: 0 },
  ],
  aura: [
    { name: 'Anger', level: 20, quality: 0 },
    { name: 'Discipline', level: 20, quality: 0 },
  ],
} as const;

/**
 * Mock jewel data
 */
export const MOCK_JEWELS = {
  basic: {
    nodeId: 1,
    text: 'Mock Jewel\nRarity: RARE\n10% increased Damage',
  },
  unique: {
    nodeId: 2,
    text: 'Unique Jewel\nRarity: UNIQUE\n+50 to all Attributes',
  },
} as const;

/**
 * Mock character configuration
 */
export const MOCK_CHARACTER_CONFIG = {
  level: {
    low: 1,
    mid: 50,
    high: 95,
    max: 100,
  },
  classes: ['Witch', 'Shadow', 'Ranger', 'Duelist', 'Marauder', 'Templar', 'Scion'],
  ascendancies: {
    Witch: ['Necromancer', 'Elementalist', 'Occultist'],
    Shadow: ['Assassin', 'Saboteur', 'Trickster'],
    Ranger: ['Deadeye', 'Raider', 'Pathfinder'],
  },
  bandits: ['None', 'Alira', 'Oak', 'Kraityn'],
} as const;

/**
 * Mock configuration values
 */
export const MOCK_CONFIG_VALUES = {
  booleans: {
    conditionFullLife: true,
    conditionMoving: true,
    conditionStationary: false,
  },
  strings: {
    enemyIsBoss: 'Boss',
    enemyCondition: 'Shocked',
  },
  numbers: {
    enemyLevel: 85,
    playerLevel: 90,
  },
} as const;

/**
 * Helper function to create mock stats with custom overrides
 */
export function createMockStats(overrides: Partial<Record<string, number>> = {}): Record<string, number> {
  return {
    ...MOCK_BUILD_STATS.basic,
    ...overrides,
  };
}

/**
 * Helper function to create mock stat deltas
 */
export function createMockStatDelta(
  statName: string,
  before: number,
  after: number
): { before: number; after: number; delta: number } {
  return {
    before,
    after,
    delta: after - before,
  };
}
