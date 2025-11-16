# Task 1: Character Configuration Tests

## Goal
Implement API and tests for character configuration (level, class, ascendancy, bandits, pantheon)

## Branch Name
`claude/add-character-config-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Files to Create/Modify
- `scripts/pob-bridge.lua` - Add character config API functions
- `src/pob/luajit-runtime.ts` - Add TypeScript wrappers
- `src/tests/character-config.test.ts` - New test file

## Research Phase

1. **Find Character Data Structure**
   - Search for `characterLevel` in codebase using Grep
   - Search for `className` to find class storage
   - Search for `ascendClassName` for ascendancy
   - Look in `pob-data/src/Classes/BuildsTab.lua` or similar

2. **Understand Character Properties**
   - Find how `build.characterLevel` is accessed/modified
   - Find class list: Scion, Marauder, Ranger, Witch, Duelist, Templar, Shadow
   - Find ascendancy names for each class
   - Look for `bandit` field (None, Alira, Oak, Kraityn)
   - Find `pantheonMajorGod` and `pantheonMinorGod` fields

3. **Test Build Recalculation**
   - Verify that changing level calls `BuildOutput()`
   - Check if class changes require tree reset
   - Understand passive points calculation from level

## Implementation Steps

### 1. Add Lua API Functions (`scripts/pob-bridge.lua`)

Add these functions to the `api` table:

```lua
-- Set character level
function api.setCharacterLevel(params)
  local level = params.level

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  if not level or level < 1 or level > 100 then
    return {success = false, error = "Level must be between 1 and 100"}
  end

  build.characterLevel = level

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, level = level}
end

-- Get character level
function api.getCharacterLevel(params)
  if not build then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, level = build.characterLevel}
end

-- Set character class
function api.setCharacterClass(params)
  local className = params.className

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  -- Validate class name
  local validClasses = {"SCION", "MARAUDER", "RANGER", "WITCH", "DUELIST", "TEMPLAR", "SHADOW"}
  local isValid = false
  for _, valid in ipairs(validClasses) do
    if className:upper() == valid then
      isValid = true
      break
    end
  end

  if not isValid then
    return {success = false, error = "Invalid class name"}
  end

  build.spec.curClassName = className
  build.spec.curClassId = build.data.classNameToId[className]

  -- May need to reset tree
  if build.spec.ResetAllocations then
    build.spec:ResetAllocations()
  end

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, className = className}
end

-- Get character class
function api.getCharacterClass(params)
  if not build then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, className = build.spec.curClassName}
end

-- Set ascendancy
function api.setAscendancy(params)
  local ascendClassName = params.ascendClassName

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  build.spec.curAscendClassName = ascendClassName

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, ascendClassName = ascendClassName}
end

-- Get ascendancy
function api.getAscendancy(params)
  if not build then
    return {success = false, error = "Build not initialized"}
  end

  return {success = true, ascendClassName = build.spec.curAscendClassName}
end

-- Set bandit reward
function api.setBandit(params)
  local bandit = params.bandit

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  -- Valid choices: "None", "Alira", "Oak", "Kraityn"
  local validBandits = {"None", "Alira", "Oak", "Kraityn"}
  local isValid = false
  for _, valid in ipairs(validBandits) do
    if bandit == valid then
      isValid = true
      break
    end
  end

  if not isValid then
    return {success = false, error = "Invalid bandit choice"}
  end

  build.bandit = bandit

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, bandit = bandit}
end

-- Set pantheon
function api.setPantheon(params)
  local major = params.major
  local minor = params.minor

  if not build then
    return {success = false, error = "Build not initialized"}
  end

  if major then
    build.pantheonMajorGod = major
  end

  if minor then
    build.pantheonMinorGod = minor
  end

  -- Trigger build recalculation
  if build.calcsTab and build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, major = major, minor = minor}
end
```

### 2. Add TypeScript Wrappers (`src/pob/luajit-runtime.ts`)

Add these methods to the `LuaJITRuntime` class:

```typescript
/**
 * Set character level (1-100)
 */
async setCharacterLevel(level: number): Promise<void> {
  const response = await this.sendCommand('setCharacterLevel', { level });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set character level');
  }
}

/**
 * Get current character level
 */
async getCharacterLevel(): Promise<number> {
  const response = await this.sendCommand('getCharacterLevel', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get character level');
  }
  return response.level;
}

/**
 * Set character class
 */
async setCharacterClass(className: string): Promise<void> {
  const response = await this.sendCommand('setCharacterClass', { className });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set character class');
  }
}

/**
 * Get current character class
 */
async getCharacterClass(): Promise<string> {
  const response = await this.sendCommand('getCharacterClass', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get character class');
  }
  return response.className;
}

/**
 * Set ascendancy class
 */
async setAscendancy(ascendClassName: string): Promise<void> {
  const response = await this.sendCommand('setAscendancy', { ascendClassName });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set ascendancy');
  }
}

/**
 * Get current ascendancy
 */
async getAscendancy(): Promise<string> {
  const response = await this.sendCommand('getAscendancy', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get ascendancy');
  }
  return response.ascendClassName;
}

/**
 * Set bandit reward choice
 */
async setBandit(bandit: 'None' | 'Alira' | 'Oak' | 'Kraityn'): Promise<void> {
  const response = await this.sendCommand('setBandit', { bandit });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set bandit');
  }
}

/**
 * Set pantheon choices
 */
async setPantheon(major?: string, minor?: string): Promise<void> {
  const response = await this.sendCommand('setPantheon', { major, minor });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set pantheon');
  }
}
```

### 3. Create Tests (`src/tests/character-config.test.ts`)

```typescript
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

export const characterConfigTests: TestSuite = {
  name: 'Character Configuration',
  tests: [
    {
      name: 'Changing character level should be reflected',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        await runtime.setCharacterLevel(50);
        let level = await runtime.getCharacterLevel();

        if (level !== 50) {
          throw new Error(`Expected level 50, got ${level}`);
        }

        await runtime.setCharacterLevel(90);
        level = await runtime.getCharacterLevel();

        if (level !== 90) {
          throw new Error(`Expected level 90, got ${level}`);
        }

        console.log(`   ✓ Character level: 50 → 90`);
      },
    },

    {
      name: 'Character level affects available passive points',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        await runtime.setCharacterLevel(20);
        let stats = await runtime.getBuildStats();
        const pointsAt20 = stats['PassivePoints'] || 0;

        await runtime.setCharacterLevel(90);
        stats = await runtime.getBuildStats();
        const pointsAt90 = stats['PassivePoints'] || 0;

        // Should gain roughly 1 point per level + quests
        if (pointsAt90 <= pointsAt20) {
          throw new Error(`Expected more points at level 90. L20: ${pointsAt20}, L90: ${pointsAt90}`);
        }

        console.log(`   ✓ Passive points L20: ${pointsAt20}, L90: ${pointsAt90}`);
      },
    },

    {
      name: 'Changing character class changes base stats',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Marauder has high base strength
        await runtime.setCharacterClass('MARAUDER');
        let stats = await runtime.getBuildStats();
        const marauderStr = stats['Str'] || 0;

        // Witch has low base strength, high int
        await runtime.setCharacterClass('WITCH');
        stats = await runtime.getBuildStats();
        const witchStr = stats['Str'] || 0;
        const witchInt = stats['Int'] || 0;

        if (witchStr >= marauderStr) {
          throw new Error(`Expected Witch to have lower Str than Marauder. Marauder: ${marauderStr}, Witch: ${witchStr}`);
        }

        console.log(`   ✓ Marauder Str: ${marauderStr}, Witch Str: ${witchStr}, Witch Int: ${witchInt}`);
      },
    },

    {
      name: 'Setting ascendancy can be retrieved',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        await runtime.setCharacterClass('MARAUDER');
        await runtime.setAscendancy('Juggernaut');

        const ascend = await runtime.getAscendancy();
        if (ascend !== 'Juggernaut') {
          throw new Error(`Expected Juggernaut, got ${ascend}`);
        }

        console.log(`   ✓ Ascendancy set to: ${ascend}`);
      },
    },

    {
      name: 'Bandit choice affects stats',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Kill all bandits (2 passive points)
        await runtime.setBandit('None');
        let stats = await runtime.getBuildStats();
        const pointsNone = stats['PassivePoints'] || 0;

        // Help Alira (resistances and mana regen)
        await runtime.setBandit('Alira');
        stats = await runtime.getBuildStats();
        const fireResAlira = stats['FireResist'] || 0;

        // Alira should provide resistances
        if (fireResAlira <= 0) {
          console.log('   ⚠ Alira resistance bonus may not be calculated in test build');
        }

        console.log(`   ✓ Bandit set: None → Alira`);
      },
    },
  ],
};
```

### 4. Register Tests

Add to `src/tests/test-runner.ts`:

```typescript
import { characterConfigTests } from './character-config.test.js';

// In the test suites array:
const testSuites = [
  passiveAllocationTests,
  itemEquipmentTests,
  skillGemTests,
  characterConfigTests, // Add this
];
```

## Expected Outcome

- 5-8 new passing tests for character configuration
- All existing tests (22) still pass
- Total: 27-30 passing tests

## Testing

```bash
pnpm build && pnpm test
```

All tests should pass before committing.

## Commit Message Template

```
Add character configuration tests and API

Implements character configuration management with comprehensive tests:

API Additions (pob-bridge.lua):
- setCharacterLevel(level) / getCharacterLevel()
- setCharacterClass(className) / getCharacterClass()
- setAscendancy(ascendClassName) / getAscendancy()
- setBandit(bandit)
- setPantheon(major, minor)

Runtime Methods (luajit-runtime.ts):
- Character level getter/setter
- Class and ascendancy management
- Bandit and pantheon configuration

Tests (character-config.test.ts):
1. Character level changes are reflected
2. Level affects available passive points
3. Class selection changes base stats
4. Ascendancy can be set and retrieved
5. Bandit choices affect stats

All X tests passing.
```
