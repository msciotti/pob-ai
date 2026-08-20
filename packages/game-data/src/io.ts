import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDataDir, RepoeDataNotFoundError } from './paths.js';

/** Read a RePoE data file as raw text. Throws RepoeDataNotFoundError if missing. */
export async function readDataFile(filename: string): Promise<string> {
  const dataDir = resolveDataDir();
  const filePath = join(dataDir, filename);
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RepoeDataNotFoundError(dataDir, filename);
    }
    throw err;
  }
}

/** Read and parse a RePoE data file as JSON. Throws RepoeDataNotFoundError if missing. */
export async function readDataJson<T>(filename: string): Promise<T> {
  const raw = await readDataFile(filename);
  return JSON.parse(raw) as T;
}
