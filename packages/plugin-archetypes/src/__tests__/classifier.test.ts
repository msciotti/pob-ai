import { describe, it, expect } from 'vitest';
import { classifyBuild, type BuildProfile } from '../classifier.js';
import { loadArchetypeEntries } from '../data-loader.js';

const entries = loadArchetypeEntries();

describe('classifyBuild', () => {
  it('identifies a clean Righteous Fire regen tank', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Righteous Fire', gemTags: ['area', 'fire', 'spell'] },
      keystones: [],
      ascendancy: 'Guardian',
      characterClass: 'Templar',
      auraCount: 1,
      equippedUniques: [],
      stats: { Life: 5200, EnergyShield: 150, FireResist: 76, TotalDPS: 250000 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches[0]?.slug).toBe('righteous-fire-regen-tank');
    expect(matches[0].confidence).toBeGreaterThan(0.6);
  });

  it('identifies a clean aura stacker', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Zealotry', gemTags: ['aura'] },
      keystones: [],
      ascendancy: 'Necromancer',
      auraCount: 9,
      equippedUniques: ['Ashes of the Stars'],
      stats: { Life: 3000 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches[0]?.slug).toBe('aura-stacker');
    expect(matches[0].confidence).toBeGreaterThan(0.6);
  });

  it('identifies a clean armour stacker', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Smite', gemTags: [] },
      keystones: ['Iron Reflexes'],
      ascendancy: 'Champion',
      auraCount: 1,
      equippedUniques: ["Doryani's Prototype"],
      stats: { Armour: 150000, PhysicalTakenHitMult: 0.05 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches[0]?.slug).toBe('armour-stacker');
    expect(matches[0].confidence).toBeGreaterThan(0.6);
  });

  it('identifies a clean phys DoT (bleed) build', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Lacerate', gemTags: ['area', 'attack', 'melee', 'physical'] },
      keystones: [],
      ascendancy: 'Gladiator',
      auraCount: 0,
      equippedUniques: [],
      stats: { BleedDPS: 500000, TotalDPS: 600000 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches[0]?.slug).toBe('phys-dot-bleed');
    expect(matches[0].confidence).toBeGreaterThan(0.6);
  });

  it('identifies a clean ignite elementalist', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Fireball', gemTags: ['area', 'fire', 'spell', 'projectile'] },
      keystones: [],
      ascendancy: 'Elementalist',
      auraCount: 1,
      equippedUniques: ['Pyre'],
      stats: { IgniteDPS: 300000, TotalDPS: 350000 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches[0]?.slug).toBe('ignite-elementalist');
    expect(matches[0].confidence).toBeGreaterThan(0.6);
  });

  it('returns multiple sensibly-ordered candidates for an ambiguous armour+aura hybrid', () => {
    // A real, common overlap: armour stackers often also run several reservation auras
    // (Determination, Grace, Discipline) to feed the armour stack — so a build with
    // Iron Reflexes + high Armour AND 6 auras should plausibly read as either shell.
    const profile: BuildProfile = {
      mainSkill: { name: 'Smite', gemTags: [] },
      keystones: ['Iron Reflexes'],
      ascendancy: 'Champion',
      auraCount: 6,
      equippedUniques: [],
      stats: { Armour: 40000 },
    };
    const matches = classifyBuild(profile, entries);
    const slugs = matches.map((m) => m.slug);

    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(slugs).toContain('armour-stacker');
    expect(slugs).toContain('aura-stacker');

    // Sensible ordering: strictly descending confidence, no ties resolved arbitrarily out of order.
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
    }
  });

  it('returns no (or only very low-confidence) matches for an out-of-scope build', () => {
    const profile: BuildProfile = {
      mainSkill: { name: 'Tornado Shot', gemTags: ['bow', 'attack', 'projectile'] },
      keystones: [],
      ascendancy: 'Deadeye',
      auraCount: 1,
      equippedUniques: [],
      stats: { Life: 4000, TotalDPS: 1000000, CritChance: 60 },
    };
    const matches = classifyBuild(profile, entries);
    expect(matches).toEqual([]);
  });

  it('never returns a single forced answer when profile data is entirely empty', () => {
    const matches = classifyBuild({}, entries);
    expect(matches).toEqual([]);
  });

  it('treats a missing equippedUniques the same as a confirmed-empty one (both are simply "no bonus")', () => {
    const base = { mainSkill: { name: 'Zealotry', gemTags: ['aura'] }, auraCount: 9 };
    const withNoUniquesConfirmed = classifyBuild({ ...base, equippedUniques: [] }, entries)[0];
    const withUniqueDataOmitted = classifyBuild(base, entries)[0];
    expect(withNoUniquesConfirmed.confidence).toBe(withUniqueDataOmitted.confidence);
  });

  it('gives a confidence bonus when a signature unique is matched, without gating on it being absent', () => {
    // Deliberately just past the required auraCount floor (5) with no other supporting
    // signals matched, so confidence is well under the 1.0 cap and the bonus is visible.
    const base = { mainSkill: { name: 'Unknown Skill', gemTags: [] }, auraCount: 5 };
    const withoutUnique = classifyBuild(base, entries)[0];
    const withUnique = classifyBuild({ ...base, equippedUniques: ['Ashes of the Stars'] }, entries)[0];
    expect(withUnique.confidence).toBeGreaterThan(withoutUnique.confidence);
  });
});
