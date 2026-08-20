/**
 * Minimal readline-based prompts for `poe-ai init`. Deliberately not pulling
 * in an interactive-prompt dependency (inquirer/enquirer/prompts) — this
 * whole feature exists to cut install footprint, so a ~40-line readline
 * wrapper is the better fit than a new dependency tree for two prompt shapes.
 */
import { createInterface } from 'readline/promises';

export interface PromptIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

async function ask(io: PromptIO, question: string): Promise<string> {
  const rl = createInterface({ input: io.input, output: io.output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Free-text prompt with a default value shown in the prompt text. */
export async function promptText(io: PromptIO, question: string, defaultValue: string): Promise<string> {
  const answer = await ask(io, `${question} [${defaultValue}]: `);
  return answer || defaultValue;
}

/**
 * Presents a numbered list and accepts a comma-separated list of indices
 * (1-based) to select, e.g. "1,3,4". An empty answer accepts
 * `preselectedIndices` as-is.
 */
export async function promptMultiSelect(
  io: PromptIO,
  question: string,
  options: string[],
  preselectedIndices: number[]
): Promise<number[]> {
  io.output.write(`${question}\n`);
  options.forEach((option, i) => {
    const mark = preselectedIndices.includes(i) ? '*' : ' ';
    io.output.write(`  [${mark}] ${i + 1}. ${option}\n`);
  });
  const defaultDescription =
    preselectedIndices.length > 0 ? preselectedIndices.map((i) => i + 1).join(',') : '(none)';
  const answer = await ask(io, `Select by number, comma-separated [${defaultDescription}]: `);

  if (!answer) return preselectedIndices;

  const chosen = answer
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length)
    .map((n) => n - 1);

  return [...new Set(chosen)];
}
