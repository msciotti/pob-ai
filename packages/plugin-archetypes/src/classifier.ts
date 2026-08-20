import type { ArchetypeEntry, IdentitySignal } from './schema.js';
import { tagsForGem } from './gem-knowledge.js';

/**
 * Plain, PoB-agnostic description of a build. This is intentionally a subset of what
 * PoB *could* expose — see pob-adapter.ts for what the v1 adapter can actually fill in
 * from the current bridge, and what it must leave undefined.
 */
export interface BuildProfile {
  mainSkill?: {
    name: string;
    /** Known gem tags for this skill, if available (see gem-knowledge.ts). */
    gemTags?: string[];
  } | null;
  keystones?: string[];
  ascendancy?: string | null;
  characterClass?: string | null;
  /** Count of active reservation auras (+1 per Blasphemy-linked curse). Undefined = unknown, not zero. */
  auraCount?: number;
  /** Names of equipped unique items, if known. Undefined = unknown (never treated as "no uniques"). */
  equippedUniques?: string[];
  /** Key PoB calc stats, e.g. Life, EnergyShield, Armour, TotalDPS, ChaosResist. */
  stats?: Record<string, number>;
}

export interface ArchetypeMatch {
  slug: string;
  name: string;
  confidence: number; // 0–1
  matchedSignals: string[];
  missingSignals: string[];
}

/** Matches at or below this confidence are dropped entirely — "no known archetype" is a valid, honest result. */
const CONFIDENCE_FLOOR = 0.15;

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function equalsCaseInsensitive(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function describeSignal(signal: IdentitySignal): string {
  switch (signal.kind) {
    case 'mainSkill': {
      const parts: string[] = [];
      if (signal.namePatterns?.length) parts.push(`main skill matches [${signal.namePatterns.join(', ')}]`);
      if (signal.gemTags?.length) parts.push(`main skill has tags [${signal.gemTags.join(', ')}]`);
      return parts.join(' or ');
    }
    case 'keystone':
      return `keystone [${signal.keystoneNames.join(', ')}]`;
    case 'ascendancy':
      return `ascendancy [${signal.ascendancyNames.join(', ')}]`;
    case 'uniqueItem':
      return `unique item [${signal.itemNames.join(', ')}]`;
    case 'auraCount':
      return `${signal.minCount}+ auras`;
    case 'statShape':
      return signal.op === 'ratioAtLeast'
        ? `${signal.stat} >= ${signal.threshold}x ${signal.comparedToStat}`
        : `${signal.stat} ${signal.op === 'gte' ? '>=' : '<='} ${signal.threshold}`;
  }
}

/** Evaluates a single signal against a build profile. Returns undefined if there isn't enough data to decide. */
function evaluateSignal(signal: IdentitySignal, profile: BuildProfile): boolean | undefined {
  switch (signal.kind) {
    case 'mainSkill': {
      if (!profile.mainSkill) return undefined;
      const byName =
        signal.namePatterns?.some((p) => includesCaseInsensitive(profile.mainSkill!.name, p)) ?? false;
      const knownTags = profile.mainSkill.gemTags ?? tagsForGem(profile.mainSkill.name);
      const byTag = signal.gemTags?.every((t) => knownTags.includes(t)) ?? false;
      return byName || byTag;
    }
    case 'keystone': {
      if (!profile.keystones) return undefined;
      return signal.keystoneNames.some((name) => profile.keystones!.some((k) => equalsCaseInsensitive(k, name)));
    }
    case 'ascendancy': {
      if (!profile.ascendancy) return undefined;
      return signal.ascendancyNames.some((name) => equalsCaseInsensitive(profile.ascendancy!, name));
    }
    case 'uniqueItem': {
      if (!profile.equippedUniques) return undefined;
      return signal.itemNames.some((name) => profile.equippedUniques!.some((u) => equalsCaseInsensitive(u, name)));
    }
    case 'auraCount': {
      if (profile.auraCount === undefined) return undefined;
      return profile.auraCount >= signal.minCount;
    }
    case 'statShape': {
      const stats = profile.stats;
      if (!stats || !(signal.stat in stats)) return undefined;
      const value = stats[signal.stat];
      if (signal.op === 'gte') return value >= signal.threshold;
      if (signal.op === 'lte') return value <= signal.threshold;
      // ratioAtLeast
      if (!signal.comparedToStat || !(signal.comparedToStat in stats)) return undefined;
      return value >= signal.threshold * stats[signal.comparedToStat];
    }
  }
}

/**
 * Scores one archetype entry against a build profile.
 *
 * Required signals gate confidence: `requiredScore` is the weighted fraction of required
 * signals that matched, and the final confidence is `requiredScore * (0.6 + 0.4 *
 * supportingScore)` — missing required signals hurt proportionally to their weight, and
 * even a perfect supporting score can't push confidence past what the required signals
 * allow. Entries with no required signals fall back to the supporting score alone.
 * uniqueItem signals never gate or penalize — they only add a bonus when matched
 * (signature uniques are optional evidence, not identity-defining).
 */
function scoreEntry(entry: ArchetypeEntry, profile: BuildProfile): ArchetypeMatch {
  const matchedSignals: string[] = [];
  const missingSignals: string[] = [];

  let requiredTotal = 0;
  let requiredMatched = 0;
  let supportingTotal = 0;
  let supportingMatched = 0;
  let bonus = 0;

  for (const signal of entry.identitySignature.signals) {
    const matched = evaluateSignal(signal, profile);
    const label = describeSignal(signal);

    if (signal.kind === 'uniqueItem') {
      if (matched) {
        bonus += signal.weight;
        matchedSignals.push(label);
      }
      // Unmatched or undecidable uniqueItem signals are silently skipped — optional evidence.
      continue;
    }

    if (signal.required) {
      requiredTotal += signal.weight;
      if (matched) {
        requiredMatched += signal.weight;
        matchedSignals.push(label);
      } else {
        missingSignals.push(label);
      }
    } else {
      supportingTotal += signal.weight;
      if (matched) {
        supportingMatched += signal.weight;
        matchedSignals.push(label);
      } else {
        missingSignals.push(label);
      }
    }
  }

  const requiredScore = requiredTotal > 0 ? requiredMatched / requiredTotal : 1;
  const supportingScore = supportingTotal > 0 ? supportingMatched / supportingTotal : 0;

  let confidence =
    requiredTotal > 0 ? requiredScore * (0.6 + 0.4 * supportingScore) : supportingScore;
  confidence = Math.min(1, confidence + bonus * 0.15);

  return {
    slug: entry.slug,
    name: entry.name,
    confidence,
    matchedSignals,
    missingSignals,
  };
}

/**
 * Pure, deterministic classifier — no PoB dependency, no I/O. Ranks every known
 * archetype against the given build profile and returns matches above the confidence
 * floor, sorted descending. An empty array is a valid, honest result: "no known
 * archetype fits this build well" — the classifier never forces a single answer.
 */
export function classifyBuild(profile: BuildProfile, entries: ArchetypeEntry[]): ArchetypeMatch[] {
  return entries
    .map((entry) => scoreEntry(entry, profile))
    .filter((match) => match.confidence > CONFIDENCE_FLOOR)
    .sort((a, b) => b.confidence - a.confidence);
}
