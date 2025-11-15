# Path of Building MCP Integration - Complete Analysis

This directory contains a comprehensive exploration of the Path of Building codebase, specifically focused on how to programmatically modify builds. These documents are critical for implementing the MCP (Model Context Protocol) integration.

## Documentation Files

### 1. POB_BUILD_MODIFICATION_GUIDE.md (28KB)
**The main comprehensive guide covering all build modification APIs**

Contains:
- Complete passive tree node allocation/deallocation patterns
- Item modification and equipment management
- Skill/gem configuration and socket group handling
- Build object structure and properties
- Recalculation and update trigger system
- Test examples and XML loading patterns
- TypeScript wrapper API recommendations

**Key Sections:**
- PassiveSpec: Node allocation (line 680), deallocation (line 712), counting (line 732)
- ItemsTab: Adding items (line 1403), equipping (line 1333), managing sets (line 1304)
- SkillsTab: Gem modification (line 598), socket group processing (line 1063)
- Build recalculation: OnFrame system (line 1147), output calculations (Calcs.lua line 73)

### 2. POB_ADVANCED_PATTERNS.md (16KB)
**Complete implementation examples and advanced usage patterns**

Contains:
- 13 complete code examples showing real-world workflows
- XML load/save patterns
- Performance optimization techniques
- Data access patterns and queries
- Error handling and validation patterns
- Helper utility functions
- Implementation checklist for TypeScript wrapper

**Key Examples:**
- Example 1: Complete passive tree workflow
- Example 2: Item creation and equipping
- Example 3: Skill setup with support gems
- Example 4: Batch build modifications
- Examples 5-6: XML serialization
- Examples 7-8: Performance optimization
- Examples 9-13: Queries and utilities

### 3. POB_QUICK_REFERENCE.md (12KB)
**Quick lookup reference for common operations**

Contains:
- File location index with line numbers
- Data structure schemas
- Item slot name constants
- Common workflow sequences
- Validation patterns
- Common query examples
- Constants and enums
- Performance tips

**Perfect for:**
- Quick lookups during implementation
- Finding specific file locations
- Understanding data structures at a glance
- Copy-paste workflow templates

## Repository Structure

```
Path of Building Community Edition
├── src/
│   ├── Modules/
│   │   ├── Build.lua                 # Main build manager
│   │   ├── Calcs.lua                 # Calculation system
│   │   ├── CalcSetup.lua            # Setup/environment
│   │   ├── CalcPerform.lua          # Performance calculations
│   │   ├── CalcOffence.lua          # Offence calculations
│   │   ├── CalcDefence.lua          # Defence calculations
│   │   └── ...
│   ├── Classes/
│   │   ├── PassiveSpec.lua           # Passive tree manager
│   │   ├── PassiveTree.lua           # Passive tree data
│   │   ├── Item.lua                  # Item class
│   │   ├── ItemsTab.lua              # Items management UI
│   │   ├── SkillsTab.lua             # Skills/gems management
│   │   ├── GemSelectControl.lua      # Gem selection UI
│   │   └── ...
│   └── TreeData/                     # Passive tree data by version
├── spec/
│   ├── System/
│   │   └── TestBuilds_spec.lua       # Build testing examples
│   └── TestBuilds/                   # Example builds
└── tests/
```

## Key Findings

### Passive Tree Management
- **Node Identifiers**: Numeric IDs (e.g., 30335, 33988, 47175)
- **Allocation Method**: `PassiveSpec:AllocNode(node)` allocates entire path
- **Deallocation Method**: `PassiveSpec:DeallocNode(node)` includes dependent nodes
- **Validation**: Check `node.path` length and `allocNodes` map
- **Recalculation**: Automatic when `buildFlag = true`

### Item Management
- **Slot Identifiers**: String names (e.g., "Helmet", "Weapon 1")
- **Storage**: `build.itemsTab.itemSets[id].items[slotName]`
- **Item Creation**: Parse from raw text with `Item:ParseRaw()`
- **Equipping**: `ItemsTab:EquipItemInSet(item, setId)`
- **Item Properties**: rarity, quality, level, mods, implicit mods, etc.

### Skill/Gem Configuration
- **Socket Groups**: Arrays of gem instances with label, slot, and source
- **Gem Properties**: nameSpec, gemId, skillId, level, quality, qualityId
- **Support Gems**: Additional gems in the gemList after main skill
- **Processing**: `SkillsTab:ProcessSocketGroup()` validates and updates
- **Quality Types**: "Default", "Alternate1", "Alternate2", "Alternate3"

### Build Recalculation
- **Trigger**: Set `build.buildFlag = true` after modifications
- **Automatic**: Next call to `build:OnFrame()` processes recalculation
- **Calculation**: `build.calcsTab:BuildOutput()` performs full calculation
- **Output**: `build.calcsTab.mainOutput` contains all calculated stats
- **Cache**: `wipeGlobalCache()` clears caches before recalculation

## Implementation Roadmap for MCP Wrapper

### Phase 1: Core API Exposure
- [ ] PassiveSpec class methods (allocate, deallocate, count)
- [ ] Build object access (spec, itemsTab, skillsTab, calcsTab)
- [ ] Output statistics access (mainOutput properties)
- [ ] Basic recalculation trigger

### Phase 2: Item System
- [ ] Item parsing from raw text
- [ ] Equipping items to slots
- [ ] Item property access
- [ ] Item set management

### Phase 3: Skill System
- [ ] Socket group management
- [ ] Gem addition/removal
- [ ] Gem property modification
- [ ] Support gem configuration

### Phase 4: Advanced Features
- [ ] XML import/export
- [ ] Batch operations
- [ ] Error handling/validation
- [ ] Performance optimizations
- [ ] State management (undo/redo)

## Common Implementation Patterns

### Access Pattern
```typescript
// Access passive tree
build.spec.nodes[nodeId]              // Get node object
build.spec.allocNodes[nodeId]         // Check if allocated

// Access items
build.itemsTab.itemSets[setId]        // Get item set
itemSet.items[slotName]               // Get item in slot

// Access skills
build.skillsTab.socketGroupList[0]    // Get first socket group
socketGroup.gemList[0]                // Get first gem
```

### Modification Pattern
```typescript
// 1. Make changes
build.spec.allocNodes[nodeId] = node  // Store allocation
itemSet.items[slot] = item            // Equip item
socketGroup.gemList.push(gem)         // Add gem

// 2. Set modification flags
build.spec.modFlag = true             // Mark modified
build.buildFlag = true                // Trigger rebuild

// 3. Calculate
build:OnFrame({})                      // Process changes
output = build.calcsTab.mainOutput    // Get results
```

### Batch Operation Pattern
```typescript
// Disable auto-recalc
originalFlag = build.buildFlag
build.buildFlag = false

// Make multiple changes
for change in changes:
    applyChange(change)

// Single recalculation
build.buildFlag = true
build:OnFrame({})
```

## Critical Classes & Files

### Most Important Files
1. **Modules/Build.lua** - Main build object and recalculation system
2. **Classes/PassiveSpec.lua** - Passive tree node management
3. **Classes/ItemsTab.lua** - Item management interface
4. **Classes/SkillsTab.lua** - Skill/gem management interface
5. **Classes/Item.lua** - Item parsing and properties
6. **Modules/Calcs.lua** - Calculation engine

### Key Methods by Frequency of Use
1. `PassiveSpec:AllocNode()` - Allocate passive tree nodes
2. `ItemsTab:EquipItemInSet()` - Equip items
3. `Build:OnFrame()` - Trigger recalculation
4. `SkillsTab:ProcessSocketGroup()` - Process gem changes
5. `PassiveSpec:CountAllocNodes()` - Get point usage

## Testing & Validation

### Example Test Build
The repository includes example builds in `spec/TestBuilds/3.13/` that demonstrate:
- Complete build XML structure
- Passive tree node allocation
- Item and gem configuration
- Skill setup with multiple gems
- Config settings and ui state

### Testing Approach
1. Load test build from XML
2. Modify specific aspects (items, skills, passives)
3. Verify output values match expectations
4. Use `CountAllocNodes()` to verify point usage

## Performance Considerations

1. **Batch Operations**: Group modifications before setting buildFlag
2. **Cache Nodes**: Store node references instead of repeated lookups
3. **Avoid Validation Loops**: Check conditions once, not per item
4. **Output Caching**: Don't recalculate values in mainOutput
5. **Undo State**: Call AddUndoState() once per batch, not per change

## Special Topics

### Node Path Connectivity
- Each node has a `path` array from class start
- Path contains all intermediate nodes to allocate
- Allocating a node allocates all path nodes automatically
- Check `#node.path > 0` to validate path exists

### Mastery Nodes
- Special node type for selecting passive effects
- Store selection in `masterySelections[nodeId] = effectId`
- Can be deallocated without dependent node check
- Displayed with selectable options

### Cluster Jewels
- Create dynamic subgraphs from jewel properties
- Stored in `spec.subGraphs[subgraphId]`
- Nodes within have special handling
- Allocated via `spec.allocExtendedNodes`

### Timeless Jewels
- Modify passive nodes with permanent changes
- Store overrides in `spec.hashOverrides[nodeId]`
- Can replace node properties (name, description, effects)
- Persist through respec operations

## Resources

### Primary Source
- GitHub: https://github.com/PathOfBuildingCommunity/PathOfBuilding
- License: GPL-3.0
- Language: Lua (game logic), C++ (window framework)

### Related Documentation
- Path of Exile Wiki: https://pathofexile.fandom.com
- Passive Tree API: Referenced in passive tree JSON exports
- Gem Data: Embedded in PoB's data files

### File Sizes & Statistics
- Total analysis: 2,073 lines across 3 documents
- Code examples: 40+ complete Lua/TypeScript snippets
- Methods documented: 50+ key functions
- Data structures: 15+ detailed schemas

## Next Steps

1. **Review** the complete guide and advanced patterns
2. **Implement** core PassiveSpec and ItemsTab wrappers
3. **Test** with example builds from spec/TestBuilds/
4. **Expand** with SkillsTab and advanced features
5. **Optimize** performance for batch operations
6. **Document** TypeScript API with JSDoc

## Quick Navigation

- **For implementation details**: See POB_BUILD_MODIFICATION_GUIDE.md
- **For code examples**: See POB_ADVANCED_PATTERNS.md
- **For quick lookup**: See POB_QUICK_REFERENCE.md
- **For file locations**: See POB_QUICK_REFERENCE.md line numbers table

---

Generated: November 13, 2025
Source: PathOfBuildingCommunity/PathOfBuilding repository analysis
Analysis Scope: Very Thorough - All core build modification APIs documented
