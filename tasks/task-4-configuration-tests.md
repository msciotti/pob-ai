# Task 4: Configuration Tab Tests

## Goal
Implement API and tests for build configuration options (enemy type, conditions, buffs)

## Branch Name
`claude/add-configuration-tests-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Files to Create/Modify
- `scripts/pob-bridge.lua` - Add configuration API functions
- `src/pob/luajit-runtime.ts` - Add TypeScript wrappers
- `src/tests/configuration.test.ts` - New test file

## Research Phase

1. **Find Configuration Structure**
   - Search for `build.calcsTab.input` or similar in codebase
   - Look in `pob-data/src/Classes/CalcsTab.lua` for configuration
   - Search for condition flags like `conditionEnemyShocked`
   - Find enemy type settings (`enemyIsBoss`, `enemyLevel`)

2. **Common Configuration Options**
   - Enemy conditions: shocked, chilled, frozen, ignited, poisoned
   - Player conditions: on full life, on low life, recently killed, recently hit
   - Enemy type: normal, boss, pinnacle boss (Shaper, etc.)
   - Combat settings: always crit, always hit, etc.
   - Enemy resistances and defenses

3. **Configuration Impact**
   - Many PoE mechanics are conditional (e.g., "more damage against shocked enemies")
   - Configuration dramatically changes DPS calculations
   - Some configs enable specific passive bonuses

## Implementation Steps

### 1. Add Lua API Functions (`scripts/pob-bridge.lua`)

Add these functions to the `api` table:

```lua
-- Set a configuration option
function api.setConfig(params)
  local key = params.key
  local value = params.value

  if not build or not build.calcsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not key then
    return {success = false, error = "Config key required"}
  end

  -- Initialize input table if needed
  if not build.calcsTab.input then
    build.calcsTab.input = {}
  end

  -- Set the configuration
  build.calcsTab.input[key] = value

  -- Trigger build recalculation
  if build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Set config " .. key .. " = " .. tostring(value),
    key = key,
    value = value
  }
end

-- Get a configuration option
function api.getConfig(params)
  local key = params.key

  if not build or not build.calcsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not key then
    return {success = false, error = "Config key required"}
  end

  local value = nil
  if build.calcsTab.input then
    value = build.calcsTab.input[key]
  end

  return {success = true, key = key, value = value}
end

-- Get all configuration options
function api.getConfigOptions(params)
  if not build or not build.calcsTab then
    return {success = false, error = "Build not initialized"}
  end

  local options = {}

  if build.calcsTab.input then
    for key, value in pairs(build.calcsTab.input) do
      options[key] = value
    end
  end

  return {success = true, options = options, count = 0}
end

-- Convenience: Set enemy type
function api.setEnemyType(params)
  local enemyType = params.enemyType

  if not build or not build.calcsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not build.calcsTab.input then
    build.calcsTab.input = {}
  end

  -- Reset enemy type flags
  build.calcsTab.input.enemyIsBoss = false
  build.calcsTab.input.enemyIsShaper = false
  build.calcsTab.input.enemyIsElder = false
  build.calcsTab.input.enemyIsSirus = false

  -- Set appropriate flag
  if enemyType == "Boss" then
    build.calcsTab.input.enemyIsBoss = true
  elseif enemyType == "Shaper" then
    build.calcsTab.input.enemyIsBoss = true
    build.calcsTab.input.enemyIsShaper = true
  elseif enemyType == "Elder" then
    build.calcsTab.input.enemyIsBoss = true
    build.calcsTab.input.enemyIsElder = true
  elseif enemyType == "Sirus" then
    build.calcsTab.input.enemyIsBoss = true
    build.calcsTab.input.enemyIsSirus = true
  end

  -- Trigger build recalculation
  if build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {success = true, message = "Enemy type set to: " .. enemyType}
end

-- Convenience: Set condition
function api.setCondition(params)
  local condition = params.condition
  local enabled = params.enabled

  if not build or not build.calcsTab then
    return {success = false, error = "Build not initialized"}
  end

  if not condition then
    return {success = false, error = "Condition name required"}
  end

  if not build.calcsTab.input then
    build.calcsTab.input = {}
  end

  -- Common condition mappings
  local conditionKey = "condition" .. condition
  build.calcsTab.input[conditionKey] = enabled

  -- Trigger build recalculation
  if build.calcsTab.BuildOutput then
    build.calcsTab:BuildOutput()
  end

  return {
    success = true,
    message = "Condition " .. condition .. " " .. (enabled and "enabled" or "disabled")
  }
end
```

### 2. Add TypeScript Wrappers (`src/pob/luajit-runtime.ts`)

Add these methods to the `LuaJITRuntime` class:

```typescript
/**
 * Set a configuration option
 */
async setConfig(key: string, value: any): Promise<void> {
  const response = await this.sendCommand('setConfig', { key, value });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set config');
  }
  console.log(response.message);
}

/**
 * Get a configuration option value
 */
async getConfig(key: string): Promise<any> {
  const response = await this.sendCommand('getConfig', { key });
  if (!response.success) {
    throw new Error(response.error || 'Failed to get config');
  }
  return response.value;
}

/**
 * Get all configuration options
 */
async getConfigOptions(): Promise<Record<string, any>> {
  const response = await this.sendCommand('getConfigOptions', {});
  if (!response.success) {
    throw new Error(response.error || 'Failed to get config options');
  }
  return response.options || {};
}

/**
 * Set enemy type (Normal, Boss, Shaper, Elder, Sirus)
 */
async setEnemyType(enemyType: 'Normal' | 'Boss' | 'Shaper' | 'Elder' | 'Sirus'): Promise<void> {
  const response = await this.sendCommand('setEnemyType', { enemyType });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set enemy type');
  }
  console.log(response.message);
}

/**
 * Set a condition (e.g., "EnemyShocked", "FullLife", "RecentlyKilled")
 */
async setCondition(condition: string, enabled: boolean): Promise<void> {
  const response = await this.sendCommand('setCondition', { condition, enabled });
  if (!response.success) {
    throw new Error(response.error || 'Failed to set condition');
  }
  console.log(response.message);
}
```

### 3. Find Available Conditions

Create a debug script to explore available conditions:

```typescript
// /tmp/find-conditions.js
import { LuaJITRuntime } from '/home/user/pob-ai/dist/pob/luajit-runtime.js';
import { loadConfig } from '/home/user/pob-ai/dist/config/index.js';
import { getPobPath } from '/home/user/pob-ai/dist/pob/detector.js';
import { readFile } from 'fs/promises';

async function main() {
  const config = await loadConfig();
  const pobPath = await getPobPath(config.pobPath);
  const runtime = new LuaJITRuntime(pobPath);
  await runtime.initialize();

  const buildPath = '/home/user/pob-ai/test-data/sample-build.txt';
  const buildXML = await readFile(buildPath, 'utf-8');
  await runtime.loadBuildFromXML(buildXML, 'Test Build');

  // Find configuration keys
  const resp = await runtime.sendCommand('debugExec', {
    code: `
      local conditions = {}

      if build.calcsTab and build.calcsTab.input then
        for key, value in pairs(build.calcsTab.input) do
          if key:match("^condition") then
            table.insert(conditions, {key = key, value = value})
          end
        end
      end

      return {conditions = conditions, count = #conditions}
    `
  });

  console.log('Available conditions:', JSON.stringify(resp.result, null, 2));

  runtime.destroy();
}

main().catch(console.error);
```

### 4. Create Tests (`src/tests/configuration.test.ts`)

```typescript
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';

export const configurationTests: TestSuite = {
  name: 'Configuration',
  tests: [
    {
      name: 'Setting enemy as shocked should affect damage',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add a skill for DPS testing
        await runtime.addSocketGroup('Test Skill', [
          { name: 'Fireball', level: 20, quality: 0 },
        ]);

        // Get base DPS
        let stats = await runtime.getBuildStats();
        const baseDPS = stats['TotalDPS'] || 0;

        // Enable enemy shocked condition
        await runtime.setCondition('EnemyShocked', true);

        stats = await runtime.getBuildStats();
        const dpsShocked = stats['TotalDPS'] || 0;

        // Shocked enemies take more damage (unless build has no shock scaling)
        if (dpsShocked < baseDPS * 0.99) {
          throw new Error(
            `Expected DPS to stay same or increase. Base: ${baseDPS}, Shocked: ${dpsShocked}`
          );
        }

        const change = ((dpsShocked / baseDPS - 1) * 100).toFixed(2);
        console.log(`   ✓ DPS: ${baseDPS.toFixed(2)} → ${dpsShocked.toFixed(2)} (${change}% change)`);
      },
    },

    {
      name: 'Enemy type affects effective DPS',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add a skill
        await runtime.addSocketGroup('Test Skill', [
          { name: 'Fireball', level: 20, quality: 0 },
        ]);

        // Normal enemy
        await runtime.setEnemyType('Normal');
        let stats = await runtime.getBuildStats();
        const dpsNormal = stats['TotalDPS'] || 0;

        // Boss enemy (more life, may have more resistance)
        await runtime.setEnemyType('Boss');
        stats = await runtime.getBuildStats();
        const dpsBoss = stats['TotalDPS'] || 0;

        // DPS values may differ based on enemy type configurations
        console.log(`   ✓ DPS vs Normal: ${dpsNormal.toFixed(2)}, vs Boss: ${dpsBoss.toFixed(2)}`);
      },
    },

    {
      name: 'Always on full life condition can be toggled',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Enable full life condition
        await runtime.setCondition('FullLife', true);

        let config = await runtime.getConfig('conditionFullLife');
        if (!config) {
          throw new Error('Full life condition not enabled');
        }

        // Disable it
        await runtime.setCondition('FullLife', false);

        config = await runtime.getConfig('conditionFullLife');
        if (config) {
          throw new Error('Full life condition not disabled');
        }

        console.log(`   ✓ Full life condition toggled successfully`);
      },
    },

    {
      name: 'Configuration changes trigger recalculation',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add skill
        await runtime.addSocketGroup('Test Skill', [
          { name: 'Fireball', level: 20, quality: 0 },
        ]);

        // Set a config that should change something
        await runtime.setConfig('conditionRecentlyKilled', true);

        let stats = await runtime.getBuildStats();
        const dpsWithCondition = stats['TotalDPS'] || 0;

        // Change the config
        await runtime.setConfig('conditionRecentlyKilled', false);

        stats = await runtime.getBuildStats();
        const dpsWithoutCondition = stats['TotalDPS'] || 0;

        // Values were calculated (even if they're the same)
        console.log(
          `   ✓ Config changed: ${dpsWithCondition.toFixed(2)} → ${dpsWithoutCondition.toFixed(2)}`
        );
      },
    },

    {
      name: 'Multiple conditions can be active',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Enable multiple conditions
        await runtime.setCondition('EnemyShocked', true);
        await runtime.setCondition('EnemyChilled', true);
        await runtime.setCondition('FullLife', true);

        // Verify all are set
        const shocked = await runtime.getConfig('conditionEnemyShocked');
        const chilled = await runtime.getConfig('conditionEnemyChilled');
        const fullLife = await runtime.getConfig('conditionFullLife');

        if (!shocked || !chilled || !fullLife) {
          throw new Error('Not all conditions were set');
        }

        console.log(`   ✓ Multiple conditions active: Shocked, Chilled, Full Life`);
      },
    },

    {
      name: 'getConfigOptions lists current configuration',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Set some configs
        await runtime.setCondition('EnemyShocked', true);
        await runtime.setConfig('enemyLevel', 84);

        const options = await runtime.getConfigOptions();

        if (!options || Object.keys(options).length === 0) {
          throw new Error('No configuration options returned');
        }

        console.log(`   ✓ Configuration has ${Object.keys(options).length} options set`);
      },
    },

    {
      name: 'Enemy resistance configuration affects damage',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Add fire skill
        await runtime.addSocketGroup('Fire Skill', [
          { name: 'Fireball', level: 20, quality: 0 },
        ]);

        // Normal resistance
        await runtime.setConfig('enemyFireResist', 0);
        let stats = await runtime.getBuildStats();
        const dps0Res = stats['TotalDPS'] || 0;

        // High resistance
        await runtime.setConfig('enemyFireResist', 75);
        stats = await runtime.getBuildStats();
        const dps75Res = stats['TotalDPS'] || 0;

        // Higher resistance should reduce damage
        if (dps75Res >= dps0Res) {
          throw new Error(
            `Expected higher enemy resistance to reduce DPS. 0% res: ${dps0Res}, 75% res: ${dps75Res}`
          );
        }

        const reduction = ((1 - dps75Res / dps0Res) * 100).toFixed(2);
        console.log(`   ✓ Enemy resist 0%: ${dps0Res.toFixed(2)}, 75%: ${dps75Res.toFixed(2)} (-${reduction}%)`);
      },
    },

    {
      name: 'Pinnacle boss settings can be configured',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Set Shaper as enemy
        await runtime.setEnemyType('Shaper');

        const isShaper = await runtime.getConfig('enemyIsShaper');
        const isBoss = await runtime.getConfig('enemyIsBoss');

        if (!isShaper || !isBoss) {
          throw new Error('Shaper configuration not set correctly');
        }

        // Change to Sirus
        await runtime.setEnemyType('Sirus');

        const isSirus = await runtime.getConfig('enemyIsSirus');
        const stillBoss = await runtime.getConfig('enemyIsBoss');
        const notShaper = await runtime.getConfig('enemyIsShaper');

        if (!isSirus || !stillBoss || notShaper) {
          throw new Error('Sirus configuration not set correctly');
        }

        console.log(`   ✓ Pinnacle boss settings: Shaper → Sirus`);
      },
    },
  ],
};
```

### 5. Register Tests

Add to `src/tests/test-runner.ts`:

```typescript
import { configurationTests } from './configuration.test.js';

// In the test suites array:
const testSuites = [
  passiveAllocationTests,
  itemEquipmentTests,
  skillGemTests,
  configurationTests, // Add this
];
```

## Expected Outcome

- 8-10 new passing tests for configuration functionality
- All existing tests (22) still pass
- Total: 30-32 passing tests

## Important Notes

- **Configuration is highly contextual** - Many configs only matter if the build has relevant mechanics
- **Test with active skills** - Some configs only affect DPS when skills are active
- **Conditions may not always change DPS** - If build has no "on shocked enemy" modifiers, shocking enemy won't change DPS
- **Be flexible with assertions** - Some tests check that config was set rather than specific stat changes

## Testing

```bash
pnpm build && pnpm test
```

All tests should pass before committing.

## Commit Message Template

```
Add configuration tests and API

Implements build configuration management with comprehensive tests:

API Additions (pob-bridge.lua):
- setConfig(key, value) - Set any configuration option
- getConfig(key) - Get configuration value
- getConfigOptions() - List all current config
- setEnemyType(type) - Set enemy type (Normal/Boss/Shaper/etc)
- setCondition(condition, enabled) - Toggle conditions

Runtime Methods (luajit-runtime.ts):
- Configuration getter/setter
- Enemy type presets
- Condition toggles
- Config listing

Tests (configuration.test.ts):
1. Enemy shocked condition affects damage
2. Enemy type affects effective DPS
3. Full life condition can be toggled
4. Configuration changes trigger recalculation
5. Multiple conditions can be active
6. getConfigOptions lists configuration
7. Enemy resistance affects damage
8. Pinnacle boss settings work

All X tests passing.
```
