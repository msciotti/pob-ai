import { describe, it, expect } from 'vitest';
import { validRange } from 'semver';
import { loadArchetypeEntries } from '../data-loader.js';
import { ArchetypeEntrySchema } from '../schema.js';

describe('archetype data files', () => {
  const entries = loadArchetypeEntries();

  it('loads at least the five seed archetypes', () => {
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a unique slug', () => {
    const slugs = entries.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  for (const entry of loadArchetypeEntries()) {
    describe(entry.slug, () => {
      it('validates against ArchetypeEntrySchema', () => {
        const result = ArchetypeEntrySchema.safeParse(entry);
        expect(result.success, result.success ? undefined : JSON.stringify(result.error.issues, null, 2)).toBe(true);
      });

      it('has a valid semver range for patchValidity', () => {
        expect(validRange(entry.patchValidity)).not.toBeNull();
      });

      it('is hand-curated and reviewed against 3.29', () => {
        expect(entry.provenance).toBe('hand-curated');
        expect(entry.lastReviewedPatch).toBe('3.29');
      });

      it('has at least one required identity signal that is not a bonus-only uniqueItem', () => {
        // Matches the classifier's actual counting (classifier.ts scoreEntry): uniqueItem
        // signals are always bonus-only regardless of their `required` flag, so a "required"
        // uniqueItem alone would not give the classifier a real gate.
        expect(
          entry.identitySignature.signals.some((s) => s.required && s.kind !== 'uniqueItem')
        ).toBe(true);
      });

      it('every failureMode statCheck references a plausible PoB stat name', () => {
        for (const mode of entry.failureModes) {
          if (mode.statCheck) {
            expect(mode.statCheck.stat.length).toBeGreaterThan(0);
          }
        }
      });
    });
  }

  it('rejects an entry with an invalid slug', () => {
    const bad = {
      slug: 'Not Kebab Case',
      name: 'x',
      summary: 'x',
      identitySignature: { signals: [{ kind: 'keystone', weight: 1, required: true, keystoneNames: ['x'], description: 'x' }] },
      scalingVectors: [{ mechanic: 'x', explanation: 'x' }],
      deadStats: [],
      defensiveProfile: { layers: ['x'], characteristicWeaknesses: [] },
      failureModes: [{ symptom: 'x', diagnosis: 'x', fix: 'x' }],
      provenance: 'hand-curated',
      patchValidity: '3.29.x',
      lastReviewedPatch: '3.29',
    };
    expect(ArchetypeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a mainSkill signal with neither namePatterns nor gemTags', () => {
    const bad = {
      slug: 'test-entry',
      name: 'x',
      summary: 'x',
      identitySignature: { signals: [{ kind: 'mainSkill', weight: 1, required: true, description: 'x' }] },
      scalingVectors: [{ mechanic: 'x', explanation: 'x' }],
      deadStats: [],
      defensiveProfile: { layers: ['x'], characteristicWeaknesses: [] },
      failureModes: [{ symptom: 'x', diagnosis: 'x', fix: 'x' }],
      provenance: 'hand-curated',
      patchValidity: '3.29.x',
      lastReviewedPatch: '3.29',
    };
    expect(ArchetypeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an entry whose only required signal is a uniqueItem', () => {
    const bad = {
      slug: 'test-entry',
      name: 'x',
      summary: 'x',
      identitySignature: {
        signals: [
          { kind: 'uniqueItem', weight: 1, required: true, itemNames: ['Some Unique'], description: 'x' },
          { kind: 'keystone', weight: 0.5, required: false, keystoneNames: ['x'], description: 'x' },
        ],
      },
      scalingVectors: [{ mechanic: 'x', explanation: 'x' }],
      deadStats: [],
      defensiveProfile: { layers: ['x'], characteristicWeaknesses: [] },
      failureModes: [{ symptom: 'x', diagnosis: 'x', fix: 'x' }],
      provenance: 'hand-curated',
      patchValidity: '3.29.x',
      lastReviewedPatch: '3.29',
    };
    expect(ArchetypeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an entry with no required signal at all', () => {
    const bad = {
      slug: 'test-entry',
      name: 'x',
      summary: 'x',
      identitySignature: {
        signals: [{ kind: 'keystone', weight: 0.5, required: false, keystoneNames: ['x'], description: 'x' }],
      },
      scalingVectors: [{ mechanic: 'x', explanation: 'x' }],
      deadStats: [],
      defensiveProfile: { layers: ['x'], characteristicWeaknesses: [] },
      failureModes: [{ symptom: 'x', diagnosis: 'x', fix: 'x' }],
      provenance: 'hand-curated',
      patchValidity: '3.29.x',
      lastReviewedPatch: '3.29',
    };
    expect(ArchetypeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it('accepts future provenance values (ninja-derived, community-mined, pob-verified)', () => {
    const base = entries[0];
    for (const provenance of ['ninja-derived', 'community-mined', 'pob-verified'] as const) {
      const result = ArchetypeEntrySchema.safeParse({ ...base, provenance });
      expect(result.success).toBe(true);
    }
  });
});
