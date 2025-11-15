# TypeScript Wrapper API Design for Path of Building

## Overview

This document defines the TypeScript wrapper API that bridges our MCP server to Path of Building's Lua code. Based on research of PoB's internal APIs, we'll expose clean, type-safe functions for build manipulation.

---

## Architecture

```
MCP Tools (TypeScript)
    ↓ calls
Wrapper API (TypeScript)
    ↓ calls Lua via fengari
PoB Lua Code (HeadlessWrapper + Classes)
    ↓ returns
Wrapper API (converts to TypeScript types)
    ↓ returns
MCP Tools (returns to LLM)
```

---

## Core Wrapper Class

### `PobBuildWrapper`

Main class that wraps a PoB build instance.

```typescript
class PobBuildWrapper {
  private luaState: LuaState;  // fengari Lua state
  private buildId: string;     // UUID for this build instance
  private buildObject: any;    // Reference to Lua build object

  constructor(luaState: LuaState, buildId: string, buildObject: any);

  // === PASSIVE TREE OPERATIONS ===

  /**
   * Allocate a passive tree node
   * @param nodeId - Numeric node ID (e.g., 30335)
   * @returns Updated stats after allocation
   */
  async allocateNode(nodeId: number): Promise<BuildStats>;

  /**
   * Deallocate a passive tree node and all dependents
   * @param nodeId - Numeric node ID
   * @returns Updated stats after deallocation
   */
  async deallocateNode(nodeId: number): Promise<BuildStats>;

  /**
   * Find a node by name or ID
   * @param identifier - Node name (string) or ID (number)
   * @returns Node info or null if not found
   */
  async findNode(identifier: string | number): Promise<PassiveNode | null>;

  /**
   * Get all allocated nodes
   * @returns Array of allocated node info
   */
  async getAllocatedNodes(): Promise<PassiveNode[]>;

  /**
   * Get node counts (normal, ascendancy, jewel sockets)
   * @returns Breakdown of allocated nodes
   */
  async getNodeCounts(): Promise<NodeCounts>;

  /**
   * Reset all allocated nodes
   */
  async resetAllNodes(): Promise<void>;

  /**
   * Change character class
   * @param classId - Class ID (0-6: Scion, Marauder, Ranger, Witch, Duelist, Templar, Shadow)
   */
  async selectClass(classId: number): Promise<BuildStats>;

  /**
   * Change ascendancy class
   * @param ascendClassId - Ascendancy ID (0-2 for each base class)
   */
  async selectAscendancy(ascendClassId: number): Promise<BuildStats>;


  // === ITEM OPERATIONS ===

  /**
   * Add an item to the build
   * @param itemText - Raw PoB item text (multi-line format)
   * @param autoEquip - Whether to auto-equip the item
   * @returns Item ID
   */
  async addItem(itemText: string, autoEquip?: boolean): Promise<string>;

  /**
   * Remove an item from the build
   * @param itemId - Item ID to remove
   */
  async deleteItem(itemId: string): Promise<void>;

  /**
   * Equip an item in a specific slot
   * @param itemId - Item ID
   * @param slotName - Slot name (e.g., "Helmet", "Weapon 1")
   * @returns Updated stats
   */
  async equipItem(itemId: string, slotName: string): Promise<BuildStats>;

  /**
   * Unequip an item from a slot
   * @param slotName - Slot name
   */
  async unequipSlot(slotName: string): Promise<void>;

  /**
   * Get item equipped in a slot
   * @param slotName - Slot name
   * @returns Item info or null if empty
   */
  async getEquippedItem(slotName: string): Promise<Item | null>;

  /**
   * Get all equipped items
   * @returns Map of slot name to item
   */
  async getAllEquippedItems(): Promise<Record<string, Item>>;


  // === SKILL/GEM OPERATIONS ===

  /**
   * Add a socket group (skill setup)
   * @param socketGroup - Socket group configuration
   * @returns Socket group ID
   */
  async addSocketGroup(socketGroup: SocketGroupInput): Promise<string>;

  /**
   * Remove a socket group
   * @param socketGroupId - Socket group ID
   */
  async deleteSocketGroup(socketGroupId: string): Promise<void>;

  /**
   * Set a gem in a socket group
   * @param socketGroupId - Socket group ID
   * @param gemIndex - Index in gem list (0-based)
   * @param gemSpec - Gem specification
   */
  async setGem(
    socketGroupId: string,
    gemIndex: number,
    gemSpec: GemSpec
  ): Promise<void>;

  /**
   * Get all socket groups
   * @returns Array of socket groups
   */
  async getSocketGroups(): Promise<SocketGroup[]>;

  /**
   * Set the active skill (for calculation)
   * @param socketGroupId - Socket group ID
   * @param activeSkillIndex - Index of active skill in group
   */
  async setActiveSkill(
    socketGroupId: string,
    activeSkillIndex: number
  ): Promise<BuildStats>;


  // === BUILD STATS & CALCULATION ===

  /**
   * Get all calculated stats for the build
   * @param statFilter - Optional array of stat names to return
   * @returns Build stats
   */
  async getBuildStats(statFilter?: string[]): Promise<BuildStats>;

  /**
   * Trigger recalculation of build stats
   * (Usually automatic, but can be called manually)
   */
  async recalculate(): Promise<BuildStats>;

  /**
   * Get specific calculated stat by name
   * @param statName - Stat name (e.g., "TotalDPS", "Life")
   * @returns Stat value or undefined
   */
  async getStat(statName: string): Promise<number | undefined>;


  // === BUILD SERIALIZATION ===

  /**
   * Export build as XML
   * @returns PoB XML string
   */
  async exportToXML(): Promise<string>;

  /**
   * Get build metadata
   * @returns Character info, version, etc.
   */
  async getMetadata(): Promise<BuildMetadata>;


  // === CONFIGURATION ===

  /**
   * Set a config option (e.g., "conditionFullLife": true)
   * @param key - Config key
   * @param value - Config value
   */
  async setConfig(key: string, value: any): Promise<void>;

  /**
   * Get a config option
   * @param key - Config key
   * @returns Config value
   */
  async getConfig(key: string): Promise<any>;

  /**
   * Get all config options
   * @returns Config object
   */
  async getAllConfig(): Promise<Record<string, any>>;
}
```

---

## TypeScript Types

### Passive Tree Types

```typescript
interface PassiveNode {
  id: number;
  name: string;
  type: 'Keystone' | 'Notable' | 'Normal' | 'Mastery' | 'ClassStart' | 'AscendClassStart' | 'Socket';
  allocated: boolean;
  ascendancyName?: string;
  stats?: string[];  // Human-readable stat descriptions
}

interface NodeCounts {
  normal: number;        // Regular passive points
  ascendancy: number;    // Ascendancy points
  sockets: number;       // Jewel sockets
}
```

### Item Types

```typescript
interface Item {
  id: string;
  name: string;
  rarity: 'NORMAL' | 'MAGIC' | 'RARE' | 'UNIQUE' | 'RELIC';
  itemLevel?: number;
  quality?: number;
  sockets?: number;
  mods: string[];        // Explicit mods
  implicitMods: string[];
  enchantMods: string[];
  craftedMods: string[];
  rawText: string;       // Full PoB item text
}

type SlotName =
  | 'Weapon 1' | 'Weapon 2'
  | 'Helmet' | 'Body Armour' | 'Gloves' | 'Boots'
  | 'Amulet' | 'Belt'
  | 'Ring 1' | 'Ring 2' | 'Ring 3'
  | 'Flask 1' | 'Flask 2' | 'Flask 3' | 'Flask 4' | 'Flask 5';
```

### Skill/Gem Types

```typescript
interface GemSpec {
  name: string;          // Gem name (e.g., "Fireball")
  level?: number;        // 1-20+ (default: max)
  quality?: number;      // 0-20+ (default: 0)
  qualityType?: 'Default' | 'Alternate1' | 'Alternate2' | 'Alternate3';
  enabled?: boolean;     // Whether gem is enabled (default: true)
}

interface SocketGroupInput {
  label?: string;        // Display label
  enabled?: boolean;     // Whether group is enabled (default: true)
  slot?: SlotName;       // Item slot this comes from
  gems: GemSpec[];       // Array of gems in order
}

interface SocketGroup extends SocketGroupInput {
  id: string;            // Unique ID
  mainActiveSkill: number;  // Index of main active skill
}
```

### Build Stats Types

```typescript
interface BuildStats {
  // Defensive stats
  Life?: number;
  EnergyShield?: number;
  Mana?: number;
  Armour?: number;
  Evasion?: number;
  BlockChance?: number;
  SpellBlockChance?: number;

  // Resistances
  FireResist?: number;
  ColdResist?: number;
  LightningResist?: number;
  ChaosResist?: number;

  // Offensive stats
  TotalDPS?: number;
  CombinedDPS?: number;
  TotalDot?: number;
  AverageDamage?: number;
  AverageHit?: number;
  HitChance?: number;
  CritChance?: number;
  CritMultiplier?: number;

  // Attributes
  Str?: number;
  Dex?: number;
  Int?: number;

  // Speed
  Speed?: number;
  HitSpeed?: number;
  MoveSpeed?: number;

  // ... 100+ more stats available from calcsTab.mainOutput
  // Use [key: string]: number | undefined for flexibility
  [key: string]: number | undefined;
}

interface BuildMetadata {
  characterLevel: number;
  className: string;
  ascendancyName: string;
  targetVersion: string;  // PoE version (e.g., "3_25")
  bandit?: string;
  pantheonMajor?: string;
  pantheonMinor?: string;
}
```

---

## Usage Examples

### Example 1: Allocate a passive node

```typescript
const wrapper = buildCache.get(buildId);

// Find node by name
const node = await wrapper.findNode("Iron Will");
if (node && !node.allocated) {
  const newStats = await wrapper.allocateNode(node.id);
  console.log(`DPS increased to ${newStats.TotalDPS}`);
}
```

### Example 2: Replace an item

```typescript
// Parse new item from PoB text
const itemText = `
Rarity: UNIQUE
Abyssus
Ezomyte Burgonet
Adds 40 to 60 Physical Damage to Attacks
+150 to Armour
+(20-25)% to Critical Strike Multiplier
40% increased Attack Damage
100% increased Armour
40% to 50% increased Physical Damage taken
`;

// Add and equip the item
const itemId = await wrapper.addItem(itemText, false);
const newStats = await wrapper.equipItem(itemId, 'Helmet');
console.log(`Life: ${newStats.Life}, DPS: ${newStats.TotalDPS}`);
```

### Example 3: Modify skill setup

```typescript
// Create a 6-link skill setup
const socketGroupId = await wrapper.addSocketGroup({
  label: "Main Skill",
  enabled: true,
  slot: "Body Armour",
  gems: [
    { name: "Cyclone", level: 20, quality: 20 },
    { name: "Melee Physical Damage Support", level: 20 },
    { name: "Brutality Support", level: 20 },
    { name: "Impale Support", level: 20 },
    { name: "Fortify Support", level: 20 },
    { name: "Infused Channelling Support", level: 20 }
  ]
});

// Set as active skill for calculation
const newStats = await wrapper.setActiveSkill(socketGroupId, 0);
console.log(`Cyclone DPS: ${newStats.TotalDPS}`);
```

### Example 4: Compare before/after

```typescript
// Get current stats
const beforeStats = await wrapper.getBuildStats(['TotalDPS', 'Life']);

// Make a change
await wrapper.allocateNode(nodeId);

// Get new stats
const afterStats = await wrapper.getBuildStats(['TotalDPS', 'Life']);

// Calculate deltas
const dpsDelta = (afterStats.TotalDPS ?? 0) - (beforeStats.TotalDPS ?? 0);
const lifeDelta = (afterStats.Life ?? 0) - (beforeStats.Life ?? 0);

console.log(`DPS change: ${dpsDelta > 0 ? '+' : ''}${dpsDelta}`);
console.log(`Life change: ${lifeDelta > 0 ? '+' : ''}${lifeDelta}`);
```

---

## Implementation Notes

### Lua Bridge Pattern

All wrapper methods will follow this pattern:

```typescript
async allocateNode(nodeId: number): Promise<BuildStats> {
  // 1. Get node from Lua
  const luaCode = `
    local node = build.spec.nodes[${nodeId}]
    if node and not node.alloc then
      build.spec:AllocNode(node)
      build.buildFlag = true
      return true
    end
    return false
  `;

  const success = this.luaState.execute(luaCode);

  if (!success) {
    throw new Error(`Failed to allocate node ${nodeId}`);
  }

  // 2. Trigger recalculation
  await this.recalculate();

  // 3. Get updated stats
  return this.getBuildStats();
}

private async recalculate(): Promise<void> {
  const luaCode = `
    build.buildFlag = true
    build:OnFrame({})
  `;
  this.luaState.execute(luaCode);
}
```

### Error Handling

```typescript
class PobError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PobError';
  }
}

// Usage
if (!node) {
  throw new PobError(
    `Node not found: ${identifier}`,
    'NODE_NOT_FOUND',
    { identifier }
  );
}
```

### Stat Name Mapping

Create a mapping of common stat aliases to PoB internal names:

```typescript
const STAT_ALIASES: Record<string, string> = {
  'dps': 'TotalDPS',
  'life': 'Life',
  'es': 'EnergyShield',
  'armor': 'Armour',
  'evasion': 'Evasion',
  'crit': 'CritChance',
  'critMulti': 'CritMultiplier',
  // ... etc
};
```

---

## Testing Strategy

### Unit Tests

Test each wrapper method in isolation with mock Lua state:

```typescript
describe('PobBuildWrapper', () => {
  describe('allocateNode', () => {
    it('should allocate a node and return updated stats', async () => {
      const wrapper = createTestWrapper();
      const stats = await wrapper.allocateNode(30335);
      expect(stats.TotalDPS).toBeGreaterThan(0);
    });

    it('should throw error for invalid node ID', async () => {
      const wrapper = createTestWrapper();
      await expect(wrapper.allocateNode(999999))
        .rejects.toThrow(PobError);
    });
  });
});
```

### Integration Tests

Test with real PoB test builds:

```typescript
describe('Integration: Full build modification', () => {
  it('should load, modify, and export a build', async () => {
    const xml = loadTestBuild('OccVortex.xml');
    const buildId = await pobLoader.loadBuildFromXML(xml);
    const wrapper = buildCache.get(buildId);

    // Modify build
    await wrapper.allocateNode(30335);
    await wrapper.equipItem(itemId, 'Helmet');

    // Export and verify
    const exportedXML = await wrapper.exportToXML();
    expect(exportedXML).toContain('30335');
  });
});
```

---

## Next Steps

1. Implement `PobBuildWrapper` class with fengari Lua bridge
2. Add type definitions to TypeScript project
3. Create unit tests for each wrapper method
4. Test with real PoB builds from test suite
5. Integrate with MCP tools layer
6. Add comprehensive error handling
7. Document any PoB version compatibility issues

---

## References

- PoB modification research docs (POB_BUILD_MODIFICATION_GUIDE.md)
- PoB quick reference (POB_QUICK_REFERENCE.md)
- PoB advanced patterns (POB_ADVANCED_PATTERNS.md)
- fengari documentation: https://fengari.io/
