# API Reference

## LuaJITRuntime

The `LuaJITRuntime` class provides a TypeScript interface to Path of Building's calculation engine running in a LuaJIT subprocess.

**Import:**
```typescript
import { LuaJITRuntime } from './pob/luajit-runtime';
```

**Initialization:**
```typescript
const runtime = new LuaJITRuntime('/path/to/pob');
await runtime.initialize();

// ... use runtime methods ...

runtime.destroy(); // Clean up when done
```

---

## Build Operations

### `initialize(): Promise<void>`

Spawns the LuaJIT subprocess and loads Path of Building.

**Throws:** Error if LuaJIT not found or PoB fails to load

**Example:**
```typescript
await runtime.initialize();
```

---

### `newBuild(): Promise<void>`

Creates a new empty build.

**Example:**
```typescript
await runtime.newBuild();
```

---

### `loadBuildFromXML(xml: string, buildName?: string): Promise<void>`

Loads a build from XML string.

**Parameters:**
- `xml` - Full XML build string
- `buildName` - Optional name (default: "Imported Build")

**Example:**
```typescript
const xml = await fetch('https://pastebin.com/raw/uCLE0msa').then(r => r.text());
await runtime.loadBuildFromXML(xml, 'My Build');
```

---

### `importFromCode(code: string, buildName?: string): Promise<void>`

Loads a build from pastebin code (decompresses automatically).

**Parameters:**
- `code` - Pastebin code string
- `buildName` - Optional name (default: "Imported Build")

**Example:**
```typescript
await runtime.importFromCode(pastebinCode, 'Test Build');
```

---

### `getBuildStats(): Promise<Record<string, number>>`

Returns all calculated build stats (500+ possible stats).

**Returns:** Object with stat names as keys, numbers as values

**Common Stats:**
- **Offense:** `TotalDPS`, `AverageDamage`, `CritChance`, `CritMultiplier`
- **Defense:** `Life`, `EnergyShield`, `Armor`, `Evasion`
- **Resistances:** `FireResist`, `ColdResist`, `LightningResist`, `ChaosResist`
- **Attributes:** `Str`, `Dex`, `Int`

**Example:**
```typescript
const stats = await runtime.getBuildStats();
console.log(`DPS: ${stats.TotalDPS}`);
console.log(`Life: ${stats.Life}`);
console.log(`Crit: ${stats.CritChance}%`);
```

---

## Passive Tree Operations

### `allocatePassive(nodeName: string, autoPath?: boolean): Promise<void>`

Allocates a passive tree node by name.

**Parameters:**
- `nodeName` - Display name of the node (case-sensitive)
- `autoPath` - Automatically allocate path nodes (default: true)

**Throws:** Error if node not found or unreachable

**Example:**
```typescript
await runtime.allocatePassive('Resolute Technique');
await runtime.allocatePassive('Constitution', true); // with auto-pathing
```

---

### `getNodeInfo(nodeName: string): Promise<NodeInfo>`

Gets detailed information about a specific passive node.

**Returns:**
```typescript
{
  id: string;           // Numeric node ID
  name: string;         // Display name
  type: string;         // "Keystone", "Notable", "Normal", "Mastery", "ClassStart"
  isKeystone: boolean;
  isNotable: boolean;
  isJewelSocket: boolean;
  allocated: boolean;   // Currently allocated?
  hasPath: boolean;     // Can be pathed to?
  pathLength: number;   // Number of nodes to reach
}
```

**Example:**
```typescript
const node = await runtime.getNodeInfo('Resolute Technique');
console.log(`${node.name} is ${node.pathLength} nodes away`);
```

---

### `getAllocatedNodes(): Promise<Array<AllocatedNode>>`

Returns list of all currently allocated passive nodes.

**Returns:**
```typescript
Array<{
  id: string;
  name: string;
  type: string; // "Keystone", "Notable", "Normal", etc.
}>
```

**Example:**
```typescript
const nodes = await runtime.getAllocatedNodes();
console.log(`Allocated ${nodes.length} nodes`);
```

---

### `findPathToNode(nodeName: string): Promise<PathInfo>`

Finds the shortest path to a passive node.

**Returns:**
```typescript
{
  hasPath: boolean;
  pathLength: number;
  path: Array<{
    id: string;
    name: string;
    allocated: boolean;
  }>;
}
```

**Example:**
```typescript
const path = await runtime.findPathToNode('Resolute Technique');
if (path.hasPath) {
  console.log(`Path length: ${path.pathLength}`);
  console.log(`Nodes: ${path.path.map(n => n.name).join(' → ')}`);
}
```

---

### `rebuildPaths(): Promise<void>`

Rebuilds pathfinding data after manual tree modifications.

**Example:**
```typescript
await runtime.rebuildPaths();
```

---

## Item Operations

### `equipItem(itemText: string, slotName: string): Promise<void>`

Equips an item in a specific slot.

**Parameters:**
- `itemText` - Item text in PoB format
- `slotName` - Slot name: `"Weapon 1"`, `"Weapon 2"`, `"Helmet"`, `"Body Armour"`, `"Gloves"`, `"Boots"`, `"Amulet"`, `"Ring 1"`, `"Ring 2"`, `"Belt"`, `"Flask 1-5"`

**Example:**
```typescript
const item = `Rarity: UNIQUE
Kaom's Heart
Glorious Plate
Quality: 20
Sockets:
Implicits: 0
+500 to maximum Life
+40% to Fire Resistance`;

await runtime.equipItem(item, 'Body Armour');
```

---

### `unequipItem(slotName: string): Promise<void>`

Removes item from a slot.

**Example:**
```typescript
await runtime.unequipItem('Weapon 1');
```

---

### `getEquippedItems(): Promise<Array<EquippedItem>>`

Returns all currently equipped items.

**Returns:**
```typescript
Array<{
  slot: string;
  itemId: number;
  name: string;
  rarity: string; // "NORMAL", "MAGIC", "RARE", "UNIQUE"
}>
```

**Example:**
```typescript
const items = await runtime.getEquippedItems();
items.forEach(item => {
  console.log(`${item.slot}: ${item.name} (${item.rarity})`);
});
```

---

## Skill Gem Operations

### `addSocketGroup(label: string, gems: Gem[], slot?: string): Promise<void>`

Adds a socket group with gems.

**Parameters:**
- `label` - Name for the socket group
- `gems` - Array of gem definitions
- `slot` - Optional item slot (e.g., "Weapon 1")

**Gem Definition:**
```typescript
{
  name: string;      // Gem name
  level?: number;    // Gem level (default: 20)
  quality?: number;  // Quality % (default: 0)
  enabled?: boolean; // Active? (default: true)
}
```

**Example:**
```typescript
await runtime.addSocketGroup('Main Skill', [
  { name: 'Fireball', level: 20, quality: 20 },
  { name: 'Greater Multiple Projectiles Support', level: 20 },
  { name: 'Spell Echo Support', level: 20 },
  { name: 'Elemental Focus Support', level: 20 }
], 'Weapon 1');
```

---

### `clearSocketGroups(): Promise<void>`

Removes all socket groups.

**Example:**
```typescript
await runtime.clearSocketGroups();
```

---

### `getSocketGroups(): Promise<Array<SocketGroup>>`

Returns all socket groups and their gems.

**Returns:**
```typescript
Array<{
  index: number;
  label: string;
  enabled: boolean;
  slot?: string;
  gemCount: number;
  gems: Array<{
    name: string;
    level: number;
    quality: number;
    enabled: boolean;
  }>;
}>
```

**Example:**
```typescript
const groups = await runtime.getSocketGroups();
groups.forEach(group => {
  console.log(`${group.label}: ${group.gemCount} gems`);
});
```

---

## Jewel Operations

### `socketJewel(nodeId: number, itemText: string): Promise<JewelInfo>`

Sockets a jewel into an allocated jewel socket node.

**Parameters:**
- `nodeId` - Numeric ID of jewel socket node
- `itemText` - Jewel item text in PoB format

**Returns:**
```typescript
{
  jewelId: number;
  jewelName: string;
}
```

**Example:**
```typescript
const jewel = `Rarity: RARE
Viridian Jewel
+15% to Global Critical Strike Multiplier
+8% to Fire Damage over Time Multiplier`;

const result = await runtime.socketJewel(36634, jewel);
console.log(`Socketed ${result.jewelName}`);
```

---

### `unsocketJewel(nodeId: number): Promise<void>`

Removes a jewel from a socket node.

**Example:**
```typescript
await runtime.unsocketJewel(36634);
```

---

### `getSocketedJewels(): Promise<Array<SocketedJewel>>`

Returns all currently socketed jewels.

**Returns:**
```typescript
Array<{
  nodeId: number;
  nodeName: string;
  jewelId: number;
  jewelName: string;
}>
```

**Example:**
```typescript
const jewels = await runtime.getSocketedJewels();
console.log(`${jewels.length} jewels socketed`);
```

---

### `getAvailableJewelSockets(): Promise<Array<JewelSocket>>`

Returns all allocated jewel socket nodes.

**Returns:**
```typescript
Array<{
  nodeId: number;
  nodeName: string;
  hasJewel: boolean;
}>
```

**Example:**
```typescript
const sockets = await runtime.getAvailableJewelSockets();
const empty = sockets.filter(s => !s.hasJewel);
console.log(`${empty.length} empty jewel sockets`);
```

---

## Lifecycle

### `destroy(): void`

Cleans up the LuaJIT subprocess and releases resources.

**Example:**
```typescript
runtime.destroy();
```

---

## Error Handling

All async methods throw descriptive errors on failure:

```typescript
try {
  await runtime.allocatePassive('Invalid Node Name');
} catch (error) {
  console.error(error.message);
  // "Node 'Invalid Node Name' not found in passive tree"
}
```

**Common Errors:**
- Node not found
- Node unreachable (no path)
- No build loaded
- Invalid item format
- Subprocess crashed

---

## Complete Example

```typescript
import { LuaJITRuntime } from './pob/luajit-runtime';

async function analyzeBuild() {
  const runtime = new LuaJITRuntime('/path/to/pob');

  try {
    // Initialize
    await runtime.initialize();

    // Load build
    const code = '..pastebin code..';
    await runtime.importFromCode(code, 'Test Build');

    // Get initial stats
    let stats = await runtime.getBuildStats();
    console.log(`Initial Crit: ${stats.CritChance}%`);

    // Allocate keystone
    await runtime.allocatePassive('Resolute Technique');

    // Get updated stats
    stats = await runtime.getBuildStats();
    console.log(`Final Crit: ${stats.CritChance}%`); // 0%

  } finally {
    runtime.destroy();
  }
}
```

---

## Notes

- **Stateless:** Each runtime instance is independent
- **Thread-safe:** One build per runtime instance
- **Performance:** Build load ~200-500ms, calculations ~50-100ms
- **Memory:** Each runtime uses ~50-100MB RAM
