import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemPricer } from '../item-pricer.js';
import type { NinjaPriceCache } from '../ninja-prices.js';
import type { RawStashItem } from '../types.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<RawStashItem>): RawStashItem {
  return {
    id: 'test-id',
    name: '',
    typeLine: 'Test Item',
    baseType: 'Test Item',
    ilvl: 80,
    frameType: 0,
    ...overrides,
  };
}

/** Build a minimal NinjaPriceCache mock that returns a pre-populated map */
function makePriceCacheMock(entries: Record<string, number>): NinjaPriceCache {
  const map = new Map(
    Object.entries(entries).map(([k, v]) => [k, { name: k, chaosValue: v }])
  );
  return {
    getPriceMap: vi.fn().mockResolvedValue(map),
    getDivinePrice: vi.fn().mockResolvedValue(200),
  } as unknown as NinjaPriceCache;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('ItemPricer', () => {
  describe('Currency items', () => {
    it('multiplies chaos value by stack size', async () => {
      const cache = makePriceCacheMock({ 'divine orb': 200 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Divine Orb',
        stackSize: 5,
        frameType: 5,
        extended: { category: 'currency' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).not.toBeNull();
      expect(result!.chaosValue).toBe(1000); // 5 × 200
      expect(result!.category).toBe('Currency');
    });

    it('uses stack size 1 when stackSize is absent', async () => {
      const cache = makePriceCacheMock({ 'chaos orb': 1 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Chaos Orb',
        frameType: 5,
        extended: { category: 'currency' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.chaosValue).toBe(1);
    });

    it('returns null when currency is not in price map', async () => {
      const cache = makePriceCacheMock({});
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Some Unknown Currency',
        frameType: 5,
        extended: { category: 'currency' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).toBeNull();
    });
  });

  describe('Map items', () => {
    it('constructs correct lookup key for a normal map', async () => {
      const cache = makePriceCacheMock({ 'strand map t10': 50 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Strand Map',
        frameType: 0,
        extended: { category: 'maps' },
        properties: [{ name: 'Map Tier', values: [['10', 0]] }],
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).not.toBeNull();
      expect(result!.chaosValue).toBe(50);
    });

    it('prepends "Blighted " for blighted maps', async () => {
      const cache = makePriceCacheMock({ 'blighted strand map t10': 120 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Strand Map',
        frameType: 0,
        extended: { category: 'maps' },
        properties: [{ name: 'Map Tier', values: [['10', 0]] }],
        explicitMods: ['Blighted Map'],
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.chaosValue).toBe(120);
    });

    it('prepends "Blight-Ravaged " for blight-ravaged maps', async () => {
      const cache = makePriceCacheMock({ 'blight-ravaged strand map t10': 300 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Strand Map',
        frameType: 0,
        extended: { category: 'maps' },
        properties: [{ name: 'Map Tier', values: [['10', 0]] }],
        explicitMods: ['Blight-Ravaged Map'],
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.chaosValue).toBe(300);
    });

    it('returns null when Map Tier property is missing', async () => {
      const cache = makePriceCacheMock({ 'strand map t10': 50 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Strand Map',
        frameType: 0,
        extended: { category: 'maps' },
        // no properties — can't determine tier
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).toBeNull();
    });
  });

  describe('Unique items', () => {
    it('strips <<set:S>> prefix from name for lookup', async () => {
      const cache = makePriceCacheMock({ "kaom's heart": 500 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        name: "<<set:S>>Kaom's Heart",
        typeLine: 'Glorious Plate',
        frameType: 3,
        extended: { category: 'armour' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).not.toBeNull();
      expect(result!.chaosValue).toBe(500);
    });

    it('strips multiple format tags from name', async () => {
      const cache = makePriceCacheMock({ "atziri's acuity": 800 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        name: "<<set:M>><<set:S>>Atziri's Acuity",
        typeLine: 'Vaal Gauntlets',
        frameType: 3,
        extended: { category: 'armour' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.chaosValue).toBe(800);
    });

    it('returns null for unique not in any category', async () => {
      const cache = makePriceCacheMock({});
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        name: '<<set:S>>Unknown Unique',
        typeLine: 'Some Base',
        frameType: 3,
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).toBeNull();
    });
  });

  describe('Gem items', () => {
    it('uses typeLine (not name) as lookup key', async () => {
      const cache = makePriceCacheMock({ 'empower support': 250 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        name: '',
        typeLine: 'Empower Support',
        frameType: 4,
        extended: { category: 'gems' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).not.toBeNull();
      expect(result!.chaosValue).toBe(250);
      expect(result!.category).toBe('SkillGem');
    });

    it('detects gems by frameType 4 even without extended category', async () => {
      const cache = makePriceCacheMock({ 'fireball': 1 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Fireball',
        frameType: 4,
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.category).toBe('SkillGem');
    });
  });

  describe('Rare items', () => {
    it('returns null for rare items (frameType 2)', async () => {
      const cache = makePriceCacheMock({ 'anything': 9999 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        name: 'Dreadful Salvation',
        typeLine: 'Hubris Circlet',
        frameType: 2,
        extended: { category: 'armour' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).toBeNull();
    });

    it('returns null for magic items (frameType 1)', async () => {
      const cache = makePriceCacheMock({ 'anything': 9999 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'Heated Hubris Circlet of the Magus',
        frameType: 1,
        extended: { category: 'armour' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result).toBeNull();
    });
  });

  describe('Divination cards', () => {
    it('prices divination cards by typeLine', async () => {
      const cache = makePriceCacheMock({ 'the doctor': 4000 });
      const pricer = new ItemPricer(cache);

      const item = makeItem({
        typeLine: 'The Doctor',
        frameType: 6,
        extended: { category: 'cards' },
      });

      const result = await pricer.priceItem(item, 'Settlers');
      expect(result!.chaosValue).toBe(4000);
      expect(result!.category).toBe('DivinationCard');
    });
  });
});
