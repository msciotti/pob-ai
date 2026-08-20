import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ArchetypeEntrySchema, type ArchetypeEntry } from './schema.js';

/**
 * Data files live at src/data/*.json (never compiled — read as plain JSON at runtime),
 * so this resolves the directory relative to the package root rather than __dirname,
 * the same way plugin-pob resolves its pob-data/ and scripts/ directories. That way it
 * works identically whether this module is running from src/ (vitest) or dist/ (built).
 */
function dataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageRoot = join(here, '..');
  return join(packageRoot, 'src', 'data');
}

let cached: ArchetypeEntry[] | undefined;

/** Loads and zod-validates every archetype JSON file. Throws with the offending file name on invalid data. */
export function loadArchetypeEntries(): ArchetypeEntry[] {
  if (cached) return cached;

  const dir = dataDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const entries: ArchetypeEntry[] = [];

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const result = ArchetypeEntrySchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Invalid archetype entry in ${file}: ${result.error.message}`);
    }
    entries.push(result.data);
  }

  cached = entries.sort((a, b) => a.slug.localeCompare(b.slug));
  return cached;
}

export function getArchetypeEntry(slug: string): ArchetypeEntry | undefined {
  return loadArchetypeEntries().find((e) => e.slug === slug);
}
