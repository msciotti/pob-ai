import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface TokenData {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  obtained_at?: number;
}

export const TOKEN_PATH = join(homedir(), '.config', 'poe-ai', 'tokens.json');

export async function readToken(): Promise<TokenData> {
  try {
    const raw = await readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(raw) as TokenData;
  } catch {
    throw new Error(
      'No OAuth token found. Run: node packages/plugin-wealth/scripts/oauth-login.mjs\n' +
      'You will need a client_id from https://www.pathofexile.com/developer/docs'
    );
  }
}

export async function writeToken(data: TokenData): Promise<void> {
  const dir = join(homedir(), '.config', 'poe-ai');
  await mkdir(dir, { recursive: true });
  const tmp = TOKEN_PATH + '.tmp';
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await (await import('node:fs/promises')).rename(tmp, TOKEN_PATH);
}
