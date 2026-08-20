import { readDataFile, readDataJson } from './io.js';
import type {
  RePoEBaseItems,
  RePoECraftingBenchOptions,
  RePoEEssences,
  RePoEFossils,
  RePoEItemClasses,
  RePoEModTypes,
  RePoEMods,
  RePoETags,
} from './types.js';

/**
 * Wrap an async loader so its result is fetched and parsed at most once per
 * process. A failed load is not cached -- the next call retries from scratch
 * (e.g. after the user runs `pnpm download-repoe` mid-session).
 */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = load().catch((err) => {
        cached = undefined;
        throw err;
      });
    }
    return cached;
  };
}

export const getMods = memoize(() => readDataJson<RePoEMods>('mods.min.json'));
export const getModTypes = memoize(() => readDataJson<RePoEModTypes>('mod_types.min.json'));
export const getTags = memoize(() => readDataJson<RePoETags>('tags.min.json'));
export const getFossils = memoize(() => readDataJson<RePoEFossils>('fossils.min.json'));
export const getEssences = memoize(() => readDataJson<RePoEEssences>('essences.min.json'));
export const getBaseItems = memoize(() => readDataJson<RePoEBaseItems>('base_items.min.json'));
export const getItemClasses = memoize(() => readDataJson<RePoEItemClasses>('item_classes.min.json'));
export const getCraftingBenchOptions = memoize(() =>
  readDataJson<RePoECraftingBenchOptions>('crafting_bench_options.min.json')
);

/** The PoE patch version this data was exported from, e.g. "3.29.3.1.4". */
export const getGameDataVersion = memoize(async () => (await readDataFile('version.txt')).trim());
