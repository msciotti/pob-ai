import { appendFileSync } from 'fs';
import type { DatasetRecord } from './types.js';

/**
 * Appends DatasetRecord objects to a JSONL file (one JSON object per line).
 * Uses synchronous append so writes are never interleaved and order is preserved.
 */
export class DatasetWriter {
  constructor(private outputPath: string) {}

  write(record: DatasetRecord): void {
    appendFileSync(this.outputPath, JSON.stringify(record) + '\n', 'utf8');
  }
}
