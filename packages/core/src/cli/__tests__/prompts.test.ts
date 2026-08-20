import { describe, expect, it } from 'vitest';
import { Readable, Writable } from 'stream';
import { promptMultiSelect, promptText } from '../prompts.js';

function fakeIO(inputLines: string[]) {
  const input = Readable.from(inputLines.map((l) => `${l}\n`));
  const written: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      written.push(chunk.toString());
      cb();
    },
  });
  return { io: { input, output }, written };
}

describe('promptText', () => {
  it('returns the typed answer', async () => {
    const { io } = fakeIO(['Allflame']);
    expect(await promptText(io, 'League?', 'Standard')).toBe('Allflame');
  });

  it('falls back to the default on an empty answer', async () => {
    const { io } = fakeIO(['']);
    expect(await promptText(io, 'League?', 'Standard')).toBe('Standard');
  });

  it('writes the question with the default shown', async () => {
    const { io, written } = fakeIO(['']);
    await promptText(io, 'League?', 'Standard');
    expect(written.join('')).toContain('League? [Standard]:');
  });
});

describe('promptMultiSelect', () => {
  const options = ['pob', 'wiki', 'ninja'];

  it('parses a comma-separated selection into 0-based indices', async () => {
    const { io } = fakeIO(['1,3']);
    expect(await promptMultiSelect(io, 'Pick:', options, [])).toEqual([0, 2]);
  });

  it('falls back to the preselected indices on an empty answer', async () => {
    const { io } = fakeIO(['']);
    expect(await promptMultiSelect(io, 'Pick:', options, [0, 1])).toEqual([0, 1]);
  });

  it('ignores out-of-range and non-numeric tokens', async () => {
    const { io } = fakeIO(['1, banana, 99, 2']);
    expect(await promptMultiSelect(io, 'Pick:', options, [])).toEqual([0, 1]);
  });

  it('deduplicates repeated selections', async () => {
    const { io } = fakeIO(['1,1,2']);
    expect(await promptMultiSelect(io, 'Pick:', options, [])).toEqual([0, 1]);
  });

  it('lists each option with a preselected marker', async () => {
    const { io, written } = fakeIO(['']);
    await promptMultiSelect(io, 'Pick:', options, [1]);
    const text = written.join('');
    expect(text).toContain('[ ] 1. pob');
    expect(text).toContain('[*] 2. wiki');
    expect(text).toContain('[ ] 3. ninja');
  });
});
