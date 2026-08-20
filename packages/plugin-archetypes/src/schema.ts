import { z } from 'zod';

/**
 * The Archetype Entry schema — the long-term contract of this package.
 *
 * This is deliberately more structured than "just docs" because it is designed to be a
 * *target* for future mining pipelines (poe.ninja ladder clustering, community-diagnosis
 * extraction, PoB-verified claims), not just a hand-written reference. Every field that
 * looks over-engineered for five hand-curated entries exists so a later pipeline can
 * populate/refine it programmatically:
 *   - `identitySignature.signals` is a flat, typed list specifically so a clustering
 *     pipeline can propose new signals (or reweight existing ones) without needing to
 *     understand prose.
 *   - `provenance` already distinguishes 'hand-curated' from future 'ninja-derived' |
 *     'community-mined' | 'pob-verified' so entries (or eventually individual signals)
 *     can carry mixed provenance without a schema migration.
 *   - `scalingVectors` / `deadStats` are separate arrays (not prose) so a PoB-verified
 *     pipeline can later attach confidence or measured deltas per mechanic.
 */

export const ProvenanceSchema = z.enum([
  'hand-curated',
  'ninja-derived',
  'community-mined',
  'pob-verified',
]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ── Identity signals ────────────────────────────────────────────────────────
//
// Every signal has a `weight` (relative contribution to confidence, not required to sum
// to 1 across an entry — the classifier normalizes) and `required` (true = this signal
// is load-bearing for the archetype's identity; missing it should gate confidence hard,
// not just nudge it down). `description` is a human-readable explanation of *why* this
// signal indicates the archetype — it flows through to identify_archetype's output so
// the LLM (and a human reading logs) can see the classifier's reasoning, not just a score.

const SignalBase = z.object({
  weight: z.number().min(0).max(1),
  required: z.boolean().default(false),
  description: z.string().min(1),
});

/**
 * Matches on the build's main skill, by name and/or by gem tag (e.g. PoB's Gems.lua
 * `tags` table — "fire", "physical", "aura", etc.). `namePatterns` are case-insensitive
 * substrings matched against the main skill's name (any pattern matches); `gemTags` are
 * tags that must ALL be present on the main skill's known tag set (AND). A signal may
 * specify one or both — namePatterns OR gemTags matching is sufficient for the signal
 * to match. namePatterns is the more precise/stable option; gemTags generalizes across
 * future skill gems that fit the same mechanical shape without naming them individually.
 */
const MainSkillSignal = SignalBase.extend({
  kind: z.literal('mainSkill'),
  namePatterns: z.array(z.string().min(1)).optional(),
  gemTags: z.array(z.string().min(1)).optional(),
});

/** Matches if any of the named keystones is allocated. */
const KeystoneSignal = SignalBase.extend({
  kind: z.literal('keystone'),
  keystoneNames: z.array(z.string().min(1)).min(1),
});

/** Matches if the build's ascendancy is one of the named ascendancies. */
const AscendancySignal = SignalBase.extend({
  kind: z.literal('ascendancy'),
  ascendancyNames: z.array(z.string().min(1)).min(1),
});

/**
 * Matches if any of the named unique items is equipped. Signature uniques are
 * deliberately an *optional* signal in the classifier note sense: a build that lacks
 * gear data entirely (or simply isn't wearing the unique) should never be scored as
 * "missing" this signal the way it would a missing required keystone — the classifier
 * treats matched uniqueItem signals as a confidence bonus on top of the required/
 * supporting score, never as a penalty when absent or unknown.
 */
const UniqueItemSignal = SignalBase.extend({
  kind: z.literal('uniqueItem'),
  itemNames: z.array(z.string().min(1)).min(1),
});

/** Matches if the build runs at least `minCount` reservation auras. */
const AuraCountSignal = SignalBase.extend({
  kind: z.literal('auraCount'),
  minCount: z.number().int().min(1),
});

/**
 * Matches a shape relationship between two stats (e.g. "energyShield >> life") or a
 * stat against an absolute threshold. `ratioAtLeast` requires `comparedToStat` and reads
 * as `profile.stats[stat] >= threshold * profile.stats[comparedToStat]`.
 */
const StatShapeSignal = SignalBase.extend({
  kind: z.literal('statShape'),
  stat: z.string().min(1),
  comparedToStat: z.string().min(1).optional(),
  op: z.enum(['gte', 'lte', 'ratioAtLeast']),
  threshold: z.number(),
});

// Cross-field checks (namePatterns/gemTags presence, ratioAtLeast needing comparedToStat) are
// applied via .superRefine AFTER the discriminated union is built, rather than .refine()-ing
// individual branches — z.discriminatedUnion requires each member to be a plain ZodObject, and
// wrapping a branch in .refine() turns it into a ZodEffects that discriminatedUnion rejects.
export const IdentitySignalSchema = z
  .discriminatedUnion('kind', [
    MainSkillSignal,
    KeystoneSignal,
    AscendancySignal,
    UniqueItemSignal,
    AuraCountSignal,
    StatShapeSignal,
  ])
  .superRefine((s, ctx) => {
    if (s.kind === 'mainSkill' && (s.namePatterns?.length ?? 0) === 0 && (s.gemTags?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'mainSkill signal requires at least one of namePatterns or gemTags',
      });
    }
    if (s.kind === 'statShape' && s.op === 'ratioAtLeast' && !s.comparedToStat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'statShape signal with op "ratioAtLeast" requires comparedToStat',
      });
    }
  });
export type IdentitySignal = z.infer<typeof IdentitySignalSchema>;

// ── Scaling model ────────────────────────────────────────────────────────────

export const ScalingVectorSchema = z.object({
  mechanic: z.string().min(1).describe('e.g. "Gem levels", "Damage over Time multiplier"'),
  explanation: z.string().min(1),
});
export type ScalingVector = z.infer<typeof ScalingVectorSchema>;

/** An investment that looks intuitive but does nothing for this shell — the best diagnostic tool. */
export const DeadStatSchema = z.object({
  stat: z.string().min(1).describe('e.g. "Attack Speed", "Critical Strike Chance"'),
  reason: z.string().min(1),
});
export type DeadStat = z.infer<typeof DeadStatSchema>;

// ── Defensive profile ────────────────────────────────────────────────────────

export const DefensiveProfileSchema = z.object({
  layers: z.array(z.string().min(1)).min(1),
  characteristicWeaknesses: z.array(z.string().min(1)),
});
export type DefensiveProfile = z.infer<typeof DefensiveProfileSchema>;

// ── Failure modes ────────────────────────────────────────────────────────────

/**
 * An optional structured check lets identify_archetype evaluate the symptom against the
 * build's *actual* stats where it's stat-detectable (e.g. "chaos resistance is negative"),
 * instead of only ever printing the checklist as static prose.
 */
const StatCheckSchema = z.object({
  stat: z.string().min(1),
  op: z.enum(['lt', 'lte', 'gt', 'gte']),
  threshold: z.number(),
});

export const FailureModeSchema = z.object({
  symptom: z.string().min(1).describe('Phrased as a stat pattern where possible, e.g. "TotalDPS fine but dies to DoTs; low chaos res"'),
  diagnosis: z.string().min(1),
  fix: z.string().min(1),
  statCheck: StatCheckSchema.optional(),
});
export type FailureMode = z.infer<typeof FailureModeSchema>;

// ── Top-level entry ──────────────────────────────────────────────────────────

export const ArchetypeEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  name: z.string().min(1),
  summary: z.string().min(1),

  identitySignature: z.object({
    signals: z.array(IdentitySignalSchema).min(1),
  }),

  scalingVectors: z.array(ScalingVectorSchema).min(1),
  deadStats: z.array(DeadStatSchema),

  defensiveProfile: DefensiveProfileSchema,

  failureModes: z.array(FailureModeSchema).min(1),

  provenance: ProvenanceSchema,
  /** Semver range this entry is believed valid for, e.g. "3.29.x" or ">=3.25.0 <3.30.0" */
  patchValidity: z.string().min(1),
  /** Patch this entry was last hand-reviewed against, e.g. "3.29" */
  lastReviewedPatch: z.string().min(1),
});
export type ArchetypeEntry = z.infer<typeof ArchetypeEntrySchema>;
