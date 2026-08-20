import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDataDir, RepoeDataNotFoundError } from './paths.js';

/** Read a RePoE data file as raw text. Throws RepoeDataNotFoundError if missing. */
export async function readDataFile(filename: string): Promise<string> {
  const dataDir = resolveDataDir();
  const filePath = join(dataDir, filename);
  if (!existsSync(filePath)) {
    throw new RepoeDataNotFoundError(dataDir, filename);
  }
  return readFile(filePath, 'utf-8');
}

/** Read and parse a RePoE data file as JSON. Throws RepoeDataNotFoundError if missing. */
export async function readDataJson<T>(filename: string): Promise<T> {
  const raw = await readDataFile(filename);
  return JSON.parse(raw) as T;
}
