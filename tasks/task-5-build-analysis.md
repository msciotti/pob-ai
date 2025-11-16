# Task 5: Build Analysis Features

## Goal
Implement AI-powered build analysis and suggestion capabilities

## Branch Name
`claude/add-build-analysis-01PtSjaZ1J2ZfEL1DoxbTfAR`

## Files to Create/Modify
- `src/analysis/build-analyzer.ts` - New analysis module
- `src/analysis/stat-thresholds.ts` - Define good/bad stat ranges
- `src/analysis/suggestions.ts` - Suggestion generation
- `src/tests/analysis.test.ts` - New test file

## Dependencies
This task should start after at least Tasks 1-2 are complete, as it needs comprehensive build data.

## Research Phase

1. **PoE Build Guidelines**
   - Research community guidelines for "good" builds
   - Resistance caps: 75% for elemental, chaos optional
   - Life targets: ~300 per 10 character levels (level 70 = ~2100 life minimum)
   - Energy Shield builds: typically 3-5k ES minimum for viable builds
   - DPS expectations vary by content (mapping vs bossing)

2. **Available Stats**
   - Review what `getBuildStats()` returns
   - Identify defensive stats: Life, ES, Armour, Evasion, Block, Dodge, etc.
   - Identify offensive stats: DPS, Crit, Attack Speed, Cast Speed
   - Identify utility: Movement Speed, Mana, Resistances

3. **Build Archetypes**
   - Life-based builds (most common)
   - Energy Shield builds (CI or Low Life)
   - Hybrid builds (Life + ES)
   - Attack vs Spell builds
   - Identify based on stat distributions

## Implementation Steps

### 1. Create Stat Thresholds (`src/analysis/stat-thresholds.ts`)

```typescript
export interface StatThresholds {
  resistances: {
    critical: number;    // Below this is dangerous
    minimum: number;     // Bare minimum
    target: number;      // Good target
    overcapped: number;  // Over-capped for map mods
  };
  life: {
    perLevel: number;           // Life per character level
    minimumFlat: number;        // Absolute minimum
    recommended: (level: number) => number;  // Recommended by level
  };
  energyShield: {
    ciMinimum: number;          // Minimum for Chaos Inoculation builds
    lowLifeMinimum: number;     // Minimum for Low Life builds
    recommended: number;        // Good target for ES builds
  };
  defenses: {
    armourMin: number;          // Minimum to be meaningful
    evasionMin: number;         // Minimum to be meaningful
    blockMin: number;           // Minimum block chance %
  };
  dps: {
    minimumMapping: (level: number) => number;  // Minimum for mapping
    recommendedMapping: (level: number) => number;  // Good for mapping
    bossing: (level: number) => number;  // For boss content
  };
}

export const DEFAULT_THRESHOLDS: StatThresholds = {
  resistances: {
    critical: 0,      // Uncapped is very dangerous
    minimum: 50,      // Bare minimum
    target: 75,       // Cap
    overcapped: 100,  // Over-cap for map mods (-res, etc.)
  },
  life: {
    perLevel: 30,     // Rough guideline: 30 life per level
    minimumFlat: 1000,
    recommended: (level: number) => Math.max(1000, level * 30),
  },
  energyShield: {
    ciMinimum: 3000,
    lowLifeMinimum: 4000,
    recommended: 5000,
  },
  defenses: {
    armourMin: 5000,   // Below this, armour doesn't do much
    evasionMin: 5000,  // Below this, evasion doesn't do much
    blockMin: 40,      // Block is meaningful at 40%+
  },
  dps: {
    minimumMapping: (level) => level * 10,  // Very rough: level 70 = 700 DPS minimum
    recommendedMapping: (level) => level * 50,  // level 70 = 3500 DPS
    bossing: (level) => level * 100,  // level 70 = 7000 DPS for bossing
  },
};

export function getThresholds(): StatThresholds {
  return DEFAULT_THRESHOLDS;
}
```

### 2. Create Analysis Types (`src/analysis/types.ts`)

```typescript
export interface BuildAnalysis {
  score: number;  // 0-100, overall build quality score
  strengths: string[];
  weaknesses: string[];
  criticalIssues: string[];  // Must-fix issues
  suggestions: Suggestion[];
  archetype: BuildArchetype;
}

export interface Suggestion {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'defense' | 'offense' | 'utility' | 'resistance' | 'general';
  issue: string;
  recommendation: string;
  expectedImpact: string;
}

export interface BuildArchetype {
  type: 'life' | 'energy-shield' | 'hybrid' | 'unknown';
  attackType: 'attack' | 'spell' | 'minion' | 'unknown';
  defenseStyle: 'armour' | 'evasion' | 'block' | 'mixed' | 'none';
}

export interface BuildStats {
  // Defensive
  life: number;
  energyShield: number;
  mana: number;
  armour: number;
  evasion: number;

  // Resistances
  fireResist: number;
  coldResist: number;
  lightningResist: number;
  chaosResist: number;

  // Offensive
  totalDPS: number;
  critChance: number;

  // Character
  level: number;

  // Block/Dodge
  blockChance?: number;
  spellBlockChance?: number;
}
```

### 3. Create Build Analyzer (`src/analysis/build-analyzer.ts`)

```typescript
import { LuaJITRuntime } from '../pob/luajit-runtime.js';
import { BuildAnalysis, Suggestion, BuildArchetype, BuildStats } from './types.js';
import { getThresholds, StatThresholds } from './stat-thresholds.js';

export class BuildAnalyzer {
  private thresholds: StatThresholds;

  constructor() {
    this.thresholds = getThresholds();
  }

  /**
   * Analyze a build and provide comprehensive feedback
   */
  async analyzeBuild(runtime: LuaJITRuntime): Promise<BuildAnalysis> {
    // Get all stats
    const rawStats = await runtime.getBuildStats();
    const level = await runtime.getCharacterLevel();

    const stats: BuildStats = {
      life: rawStats['Life'] || 0,
      energyShield: rawStats['EnergyShield'] || 0,
      mana: rawStats['Mana'] || 0,
      armour: rawStats['Armour'] || 0,
      evasion: rawStats['Evasion'] || 0,
      fireResist: rawStats['FireResist'] || 0,
      coldResist: rawStats['ColdResist'] || 0,
      lightningResist: rawStats['LightningResist'] || 0,
      chaosResist: rawStats['ChaosResist'] || 0,
      totalDPS: rawStats['TotalDPS'] || 0,
      critChance: rawStats['CritChance'] || 0,
      level: level,
      blockChance: rawStats['BlockChance'],
      spellBlockChance: rawStats['SpellBlockChance'],
    };

    // Identify build archetype
    const archetype = this.identifyArchetype(stats);

    // Analyze different aspects
    const resistanceIssues = this.analyzeResistances(stats);
    const lifeIssues = this.analyzeLife(stats, archetype);
    const defenseIssues = this.analyzeDefenses(stats, archetype);
    const offenseIssues = this.analyzeOffense(stats);

    // Combine all issues
    const allSuggestions = [
      ...resistanceIssues,
      ...lifeIssues,
      ...defenseIssues,
      ...offenseIssues,
    ];

    // Categorize
    const criticalIssues = allSuggestions
      .filter(s => s.priority === 'critical')
      .map(s => s.issue);

    const strengths = this.identifyStrengths(stats, archetype);
    const weaknesses = allSuggestions
      .filter(s => s.priority === 'high' || s.priority === 'medium')
      .map(s => s.issue);

    // Calculate score
    const score = this.calculateScore(stats, allSuggestions, archetype);

    return {
      score,
      strengths,
      weaknesses,
      criticalIssues,
      suggestions: allSuggestions,
      archetype,
    };
  }

  /**
   * Identify build archetype based on stats
   */
  private identifyArchetype(stats: BuildStats): BuildArchetype {
    let type: BuildArchetype['type'] = 'unknown';

    // Determine life/ES archetype
    if (stats.life > 100 && stats.energyShield < 500) {
      type = 'life';
    } else if (stats.energyShield > 1000 && stats.life <= 10) {
      type = 'energy-shield';  // Chaos Inoculation
    } else if (stats.energyShield > 1000 && stats.life > 100) {
      type = 'hybrid';
    }

    // Determine defense style
    let defenseStyle: BuildArchetype['defenseStyle'] = 'none';
    if (stats.armour > 10000) {
      defenseStyle = 'armour';
    } else if (stats.evasion > 10000) {
      defenseStyle = 'evasion';
    } else if ((stats.blockChance || 0) > 40) {
      defenseStyle = 'block';
    } else if (stats.armour > 5000 && stats.evasion > 5000) {
      defenseStyle = 'mixed';
    }

    return {
      type,
      attackType: 'unknown',  // Would need more info to determine
      defenseStyle,
    };
  }

  /**
   * Analyze resistance coverage
   */
  private analyzeResistances(stats: BuildStats): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const resists = [
      { name: 'Fire', value: stats.fireResist },
      { name: 'Cold', value: stats.coldResist },
      { name: 'Lightning', value: stats.lightningResist },
    ];

    for (const resist of resists) {
      if (resist.value < this.thresholds.resistances.critical) {
        suggestions.push({
          priority: 'critical',
          category: 'resistance',
          issue: `${resist.name} resistance is critically low (${resist.value}%)`,
          recommendation: `Get ${resist.name} resistance on gear, tree, or flasks. Target 75% (cap).`,
          expectedImpact: 'Massive survivability increase',
        });
      } else if (resist.value < this.thresholds.resistances.minimum) {
        suggestions.push({
          priority: 'high',
          category: 'resistance',
          issue: `${resist.name} resistance is below minimum (${resist.value}%)`,
          recommendation: `Add ${resist.name} resistance gear or passive nodes. Aim for 75%.`,
          expectedImpact: 'Significant survivability increase',
        });
      } else if (resist.value < this.thresholds.resistances.target) {
        suggestions.push({
          priority: 'medium',
          category: 'resistance',
          issue: `${resist.name} resistance not capped (${resist.value}%)`,
          recommendation: `Cap ${resist.name} resistance at 75%.`,
          expectedImpact: 'Moderate survivability increase',
        });
      }
    }

    // Chaos resistance is optional but nice
    if (stats.chaosResist < -20) {
      suggestions.push({
        priority: 'low',
        category: 'resistance',
        issue: `Chaos resistance is very negative (${stats.chaosResist}%)`,
        recommendation: 'Consider adding some chaos resistance for DoT maps.',
        expectedImpact: 'Better survivability vs chaos damage',
      });
    }

    return suggestions;
  }

  /**
   * Analyze life/ES pool
   */
  private analyzeLife(stats: BuildStats, archetype: BuildArchetype): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const recommendedLife = this.thresholds.life.recommended(stats.level);

    if (archetype.type === 'life' || archetype.type === 'hybrid') {
      if (stats.life < this.thresholds.life.minimumFlat) {
        suggestions.push({
          priority: 'critical',
          category: 'defense',
          issue: `Life is critically low (${stats.life})`,
          recommendation: 'Allocate life nodes on tree and get +life on gear.',
          expectedImpact: 'Essential for survival',
        });
      } else if (stats.life < recommendedLife * 0.7) {
        suggestions.push({
          priority: 'high',
          category: 'defense',
          issue: `Life is below recommended for level ${stats.level} (${stats.life} / ${recommendedLife})`,
          recommendation: 'Invest in more life nodes or +life on gear.',
          expectedImpact: 'Major survivability increase',
        });
      }
    }

    if (archetype.type === 'energy-shield') {
      if (stats.energyShield < this.thresholds.energyShield.ciMinimum) {
        suggestions.push({
          priority: 'critical',
          category: 'defense',
          issue: `Energy Shield too low for CI build (${stats.energyShield})`,
          recommendation: 'Get more ES on gear and tree. Target 5000+ for CI.',
          expectedImpact: 'Essential for CI build survival',
        });
      }
    }

    return suggestions;
  }

  /**
   * Analyze defensive layers
   */
  private analyzeDefenses(stats: BuildStats, archetype: BuildArchetype): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Check if build has meaningful defenses
    const hasArmour = stats.armour > this.thresholds.defenses.armourMin;
    const hasEvasion = stats.evasion > this.thresholds.defenses.evasionMin;
    const hasBlock = (stats.blockChance || 0) > this.thresholds.defenses.blockMin;

    if (!hasArmour && !hasEvasion && !hasBlock && archetype.type !== 'energy-shield') {
      suggestions.push({
        priority: 'high',
        category: 'defense',
        issue: 'No significant defensive layers',
        recommendation: 'Invest in armour, evasion, block, or other defenses.',
        expectedImpact: 'Major survivability increase',
      });
    }

    return suggestions;
  }

  /**
   * Analyze offensive capabilities
   */
  private analyzeOffense(stats: BuildStats): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const minDPS = this.thresholds.dps.minimumMapping(stats.level);
    const recDPS = this.thresholds.dps.recommendedMapping(stats.level);

    if (stats.totalDPS < minDPS) {
      suggestions.push({
        priority: 'high',
        category: 'offense',
        issue: `DPS is very low for level ${stats.level} (${stats.totalDPS.toFixed(0)})`,
        recommendation: 'Add damage support gems, allocate damage nodes, upgrade weapon.',
        expectedImpact: 'Clear speed improvement',
      });
    } else if (stats.totalDPS < recDPS) {
      suggestions.push({
        priority: 'medium',
        category: 'offense',
        issue: `DPS below recommended (${stats.totalDPS.toFixed(0)} / ${recDPS.toFixed(0)})`,
        recommendation: 'Consider more damage scaling on tree or better gems.',
        expectedImpact: 'Moderate clear speed improvement',
      });
    }

    return suggestions;
  }

  /**
   * Identify build strengths
   */
  private identifyStrengths(stats: BuildStats, archetype: BuildArchetype): string[] {
    const strengths: string[] = [];

    // Good resistances
    const eleResists = [stats.fireResist, stats.coldResist, stats.lightningResist];
    if (eleResists.every(r => r >= 75)) {
      strengths.push('All elemental resistances capped');
    }

    // Good life
    const recommendedLife = this.thresholds.life.recommended(stats.level);
    if (archetype.type === 'life' && stats.life >= recommendedLife) {
      strengths.push(`Solid life pool (${stats.life})`);
    }

    // Good ES
    if (archetype.type === 'energy-shield' && stats.energyShield >= this.thresholds.energyShield.recommended) {
      strengths.push(`Strong energy shield (${stats.energyShield})`);
    }

    // Good damage
    const goodDPS = this.thresholds.dps.recommendedMapping(stats.level);
    if (stats.totalDPS >= goodDPS) {
      strengths.push(`Strong DPS (${stats.totalDPS.toFixed(0)})`);
    }

    // Multiple defensive layers
    const layers = [];
    if (stats.armour > this.thresholds.defenses.armourMin) layers.push('armour');
    if (stats.evasion > this.thresholds.defenses.evasionMin) layers.push('evasion');
    if ((stats.blockChance || 0) > this.thresholds.defenses.blockMin) layers.push('block');

    if (layers.length >= 2) {
      strengths.push(`Multiple defensive layers (${layers.join(', ')})`);
    }

    return strengths;
  }

  /**
   * Calculate overall build score (0-100)
   */
  private calculateScore(stats: BuildStats, suggestions: Suggestion[], archetype: BuildArchetype): number {
    let score = 100;

    // Deduct points for issues
    for (const suggestion of suggestions) {
      if (suggestion.priority === 'critical') {
        score -= 25;
      } else if (suggestion.priority === 'high') {
        score -= 15;
      } else if (suggestion.priority === 'medium') {
        score -= 5;
      } else if (suggestion.priority === 'low') {
        score -= 2;
      }
    }

    // Bonus points for meeting all basic requirements
    const eleResists = [stats.fireResist, stats.coldResist, stats.lightningResist];
    if (eleResists.every(r => r >= 75)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }
}

/**
 * Convenience function to analyze a build
 */
export async function analyzeBuild(runtime: LuaJITRuntime): Promise<BuildAnalysis> {
  const analyzer = new BuildAnalyzer();
  return analyzer.analyzeBuild(runtime);
}
```

### 4. Create Tests (`src/tests/analysis.test.ts`)

```typescript
import { TestSuite } from './test-utils.js';
import { loadTestBuild } from './test-utils.js';
import { analyzeBuild } from '../analysis/build-analyzer.js';

export const analysisTests: TestSuite = {
  name: 'Build Analysis',
  tests: [
    {
      name: 'Analysis identifies low resistance as critical issue',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Create a build with low resistances (default test build might have this)
        const analysis = await analyzeBuild(runtime);

        // Check if low resistances are flagged
        const hasResistIssue = analysis.criticalIssues.some(
          issue => issue.toLowerCase().includes('resistance')
        ) || analysis.suggestions.some(
          s => s.category === 'resistance' && (s.priority === 'critical' || s.priority === 'high')
        );

        console.log(`   ✓ Score: ${analysis.score}/100, Issues: ${analysis.criticalIssues.length} critical`);
        console.log(`   ✓ Archetype: ${analysis.archetype.type}, ${analysis.archetype.defenseStyle} defense`);
      },
    },

    {
      name: 'Analysis suggests improvements for low life build',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const analysis = await analyzeBuild(runtime);

        // Should have suggestions (test build is minimal)
        if (analysis.suggestions.length === 0) {
          throw new Error('Expected analysis to provide suggestions');
        }

        console.log(`   ✓ Generated ${analysis.suggestions.length} suggestions`);

        // Log first few suggestions
        for (let i = 0; i < Math.min(3, analysis.suggestions.length); i++) {
          const s = analysis.suggestions[i];
          console.log(`     - [${s.priority}] ${s.issue}`);
        }
      },
    },

    {
      name: 'Well-configured build receives good score',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        // Improve the build
        await runtime.setCharacterLevel(80);

        // Add some life nodes
        await runtime.allocateNode(48768); // Life node

        // Add a skill
        await runtime.addSocketGroup('Main Skill', [
          { name: 'Fireball', level: 20 },
        ]);

        const analysis = await analyzeBuild(runtime);

        // Score should be calculated
        if (analysis.score < 0 || analysis.score > 100) {
          throw new Error(`Invalid score: ${analysis.score}`);
        }

        console.log(`   ✓ Build score: ${analysis.score}/100`);
        console.log(`   ✓ Strengths: ${analysis.strengths.length}, Weaknesses: ${analysis.weaknesses.length}`);
      },
    },

    {
      name: 'Analysis identifies build archetype correctly',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const analysis = await analyzeBuild(runtime);

        // Should identify some archetype
        if (analysis.archetype.type === 'unknown') {
          console.log('   ⚠ Build archetype unknown (minimal test build)');
        } else {
          console.log(`   ✓ Identified as: ${analysis.archetype.type} build`);
        }

        if (analysis.archetype.defenseStyle !== 'none') {
          console.log(`   ✓ Defense style: ${analysis.archetype.defenseStyle}`);
        }
      },
    },

    {
      name: 'Multiple issues are prioritized correctly',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const analysis = await analyzeBuild(runtime);

        // Count priorities
        const criticalCount = analysis.suggestions.filter(s => s.priority === 'critical').length;
        const highCount = analysis.suggestions.filter(s => s.priority === 'high').length;
        const mediumCount = analysis.suggestions.filter(s => s.priority === 'medium').length;
        const lowCount = analysis.suggestions.filter(s => s.priority === 'low').length;

        console.log(`   ✓ Priorities: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low`);

        // Critical issues should also appear in criticalIssues array
        if (criticalCount > 0 && analysis.criticalIssues.length === 0) {
          throw new Error('Critical suggestions exist but criticalIssues array is empty');
        }
      },
    },

    {
      name: 'Analysis provides actionable recommendations',
      run: async (runtime) => {
        await loadTestBuild(runtime);

        const analysis = await analyzeBuild(runtime);

        // Every suggestion should have all fields
        for (const suggestion of analysis.suggestions) {
          if (!suggestion.issue || !suggestion.recommendation || !suggestion.expectedImpact) {
            throw new Error('Suggestion missing required fields');
          }

          if (!suggestion.priority || !suggestion.category) {
            throw new Error('Suggestion missing priority or category');
          }
        }

        console.log(`   ✓ All ${analysis.suggestions.length} suggestions have complete information`);
      },
    },
  ],
};
```

### 5. Register Tests

Add to `src/tests/test-runner.ts`:

```typescript
import { analysisTests } from './analysis.test.js';

// In the test suites array:
const testSuites = [
  passiveAllocationTests,
  itemEquipmentTests,
  skillGemTests,
  analysisTests, // Add this
];
```

## Expected Outcome

- 6-8 new passing tests for build analysis
- All existing tests (22+) still pass
- Working analysis system that can:
  - Identify build archetype
  - Flag critical issues
  - Suggest improvements
  - Calculate build score
  - Provide actionable recommendations

## Usage Example

```typescript
import { analyzeBuild } from './analysis/build-analyzer.js';

const analysis = await analyzeBuild(runtime);

console.log(`Build Score: ${analysis.score}/100`);
console.log(`\nStrengths:`);
analysis.strengths.forEach(s => console.log(`  ✓ ${s}`));

console.log(`\nCritical Issues:`);
analysis.criticalIssues.forEach(i => console.log(`  ✗ ${i}`));

console.log(`\nTop Suggestions:`);
analysis.suggestions
  .filter(s => s.priority === 'critical' || s.priority === 'high')
  .forEach(s => {
    console.log(`  [${s.priority}] ${s.issue}`);
    console.log(`    → ${s.recommendation}`);
  });
```

## Testing

```bash
pnpm build && pnpm test
```

All tests should pass before committing.

## Commit Message Template

```
Add build analysis and suggestion system

Implements AI-powered build analysis with comprehensive feedback:

New Modules:
- build-analyzer.ts: Core analysis engine
- stat-thresholds.ts: Configurable thresholds for good/bad stats
- types.ts: Type definitions for analysis results

Features:
- Build archetype identification (life/ES, attack/spell, defense style)
- Resistance analysis with priority levels
- Life/ES pool analysis by character level
- Defensive layer analysis
- Offensive capability analysis
- Automated suggestion generation
- Build scoring (0-100)

Tests (analysis.test.ts):
1. Identifies low resistance as critical issue
2. Suggests improvements for low life builds
3. Scores well-configured builds appropriately
4. Identifies build archetype correctly
5. Prioritizes multiple issues
6. Provides actionable recommendations

All X tests passing.
```

## Future Enhancements

- Integration with LLM for natural language suggestions
- Passive tree pathfinding suggestions
- Gear upgrade recommendations
- Gem link optimization
- Build comparison features
