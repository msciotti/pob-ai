import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { readFile as ReadFile } from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const EMPTY_DIR = join(__dirname, 'fixtures-missing');

const ORIGINAL_ENV = process.env.POE_AI_REPOE_DIR;

// vi.spyOn can't redefine ESM named exports directly ("Module namespace is not
// configurable"), so wrap fs/promises.readFile with vi.fn at mock-factory time
// instead -- this still delegates to the real implementation.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

beforeEach(async () => {
  vi.resetModules();
  const fsp = await import('fs/promises');
  (fsp.readFile as unknown as ReturnType<typeof vi.fn<typeof ReadFile>>).mockClear();
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.POE_AI_REPOE_DIR;
  } else {
    process.env.POE_AI_REPOE_DIR = ORIGINAL_ENV;
  }
});

describe('resolveDataDir', () => {
  it('defaults to <repo root>/repoe-data when POE_AI_REPOE_DIR is unset', async () => {
    delete process.env.POE_AI_REPOE_DIR;
    const { resolveDataDir } = await import('../paths.js');
    const dir = resolveDataDir();
    expect(dir.endsWith(join('repoe-data'))).toBe(true);
    expect(dir).not.toContain('__tests__');
  });

  it('honours the POE_AI_REPOE_DIR env var override', async () => {
    process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
    const { resolveDataDir } = await import('../paths.js');
    expect(resolveDataDir()).toBe(FIXTURES_DIR);
  });
});

describe('missing data directory', () => {
  it('throws a clear error telling the user to run pnpm download-repoe', async () => {
    process.env.POE_AI_REPOE_DIR = EMPTY_DIR;
    const { getMods } = await import('../loaders.js');
    await expect(getMods()).rejects.toThrow(/pnpm download-repoe/);
  });
});

describe('version parsing', () => {
  it('reads and trims version.txt', async () => {
    process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
    const { getGameDataVersion } = await import('../loaders.js');
    await expect(getGameDataVersion()).resolves.toBe('3.29.3.1.4');
  });
});

describe('loader memoization', () => {
  it('reads the underlying file only once across repeated calls', async () => {
    process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
    const { readFile } = await import('fs/promises');
    const { getMods } = await import('../loaders.js');

    const first = await getMods();
    const second = await getMods();

    expect(second).toBe(first); // same cached object, not just deep-equal
    const modsReads = (readFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => String(call[0]).endsWith('mods.min.json')
    );
    expect(modsReads).toHaveLength(1);
  });

  it('does not cache a failed load, so a later call can retry', async () => {
    process.env.POE_AI_REPOE_DIR = EMPTY_DIR;
    const { getMods } = await import('../loaders.js');
    await expect(getMods()).rejects.toThrow();

    // Fix the env var to point at real fixtures and retry -- should succeed,
    // proving the earlier failure wasn't memoized.
    process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
    await expect(getMods()).resolves.toHaveProperty('Strength1');
  });
});

describe('loaders parse fixture data', () => {
  beforeEach(() => {
    process.env.POE_AI_REPOE_DIR = FIXTURES_DIR;
  });

  it('getMods returns parsed mod entries', async () => {
    const { getMods } = await import('../loaders.js');
    const mods = await getMods();
    expect(mods.Strength1).toMatchObject({
      name: 'of the Brute',
      generation_type: 'suffix',
      required_level: 1,
    });
    expect(mods.Strength1.spawn_weights).toContainEqual({ tag: 'ring', weight: 1000 });
  });

  it('getModTypes returns parsed mod type entries', async () => {
    const { getModTypes } = await import('../loaders.js');
    const modTypes = await getModTypes();
    expect(modTypes.IncreasedLife).toEqual({ sell_price_types: ['Medium'] });
  });

  it('getTags returns the flat tag list', async () => {
    const { getTags } = await import('../loaders.js');
    const tags = await getTags();
    expect(tags).toContain('ring');
  });

  it('getFossils returns parsed fossil entries', async () => {
    const { getFossils } = await import('../loaders.js');
    const fossils = await getFossils();
    const scorched = fossils['Metadata/Items/Currency/CurrencyDelveCraftingFire'];
    expect(scorched.name).toBe('Scorched Fossil');
    expect(scorched.positive_mod_weights).toContainEqual({ tag: 'fire', weight: 1000 });
  });

  it('getEssences returns parsed essence entries', async () => {
    const { getEssences } = await import('../loaders.js');
    const essences = await getEssences();
    const hatred1 = essences['Metadata/Items/Currency/CurrencyEssenceHatred1'];
    expect(hatred1.name).toBe('Whispering Essence of Hatred');
    expect(hatred1.mods.Amulet).toBe('ColdDamagePercentEssence1');
  });

  it('getBaseItems returns parsed base item entries', async () => {
    const { getBaseItems } = await import('../loaders.js');
    const baseItems = await getBaseItems();
    const ring = baseItems['Metadata/Items/Rings/Ring1'];
    expect(ring.item_class).toBe('Ring');
    expect(ring.tags).toContain('ring');
  });

  it('getItemClasses returns parsed item class entries', async () => {
    const { getItemClasses } = await import('../loaders.js');
    const itemClasses = await getItemClasses();
    expect(itemClasses.Ring.name).toBe('Rings');
  });

  it('getCraftingBenchOptions returns the flat bench option array', async () => {
    const { getCraftingBenchOptions } = await import('../loaders.js');
    const options = await getCraftingBenchOptions();
    expect(options).toHaveLength(1);
    expect(options[0].master).toBe('Jun, Veiled Master');
  });
});
