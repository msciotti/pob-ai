#!/usr/bin/env node
/**
 * GGG OAuth 2.0 login with PKCE for poe-ai.
 * Usage: POE_CLIENT_ID=your_client_id node scripts/oauth-login.mjs
 *
 * Register your app at: https://www.pathofexile.com/developer/docs
 * Set redirect URI to: http://localhost:10666/callback
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';

const CLIENT_ID = process.env.POE_CLIENT_ID;
if (!CLIENT_ID) {
  console.error('❌ POE_CLIENT_ID env var is required.');
  console.error('   Register your app at https://www.pathofexile.com/developer/docs');
  console.error('   Then run: POE_CLIENT_ID=your_id node scripts/oauth-login.mjs');
  process.exit(1);
}

const TOKEN_PATH = join(homedir(), '.config', 'poe-ai', 'tokens.json');
const PORT = 10666;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = 'account:stashes';

// ── PKCE ────────────────────────────────────────────────────────────────────

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const codeVerifier = base64url(randomBytes(32));
const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
const state = randomBytes(16).toString('hex');

// ── Build auth URL ───────────────────────────────────────────────────────────

const authParams = new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  scope: SCOPE,
  state,
  redirect_uri: REDIRECT_URI,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});

const authUrl = `https://www.pathofexile.com/oauth/authorize?${authParams}`;

// ── Open browser ─────────────────────────────────────────────────────────────

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

// ── Token exchange ───────────────────────────────────────────────────────────

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const res = await fetch('https://www.pathofexile.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

// ── Save token ───────────────────────────────────────────────────────────────

async function saveToken(data) {
  const dir = join(homedir(), '.config', 'poe-ai');
  await mkdir(dir, { recursive: true });
  const tokenData = { ...data, obtained_at: Date.now() };
  const tmp = TOKEN_PATH + '.tmp';
  await writeFile(tmp, JSON.stringify(tokenData, null, 2), 'utf-8');
  const { rename } = await import('node:fs/promises');
  await rename(tmp, TOKEN_PATH);
  console.log(`\n✅ Token saved to ${TOKEN_PATH}`);
}

// ── HTTP callback server ─────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authorization failed: ${error}</h2><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`OAuth error: ${error} — ${url.searchParams.get('error_description') ?? ''}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h2>State mismatch — possible CSRF. Try again.</h2>');
        server.close();
        reject(new Error('State mismatch'));
        return;
      }

      try {
        const tokenData = await exchangeCode(code);
        await saveToken(tokenData);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>✅ Authenticated!</h2><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(tokenData);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
        server.close();
        reject(err);
      }
    });

    // 5-minute timeout
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for OAuth callback'));
    }, 5 * 60 * 1000);

    server.listen(PORT, () => {
      clearTimeout; // will be cleared when server closes naturally
      console.log(`\n🔐 GGG OAuth Login`);
      console.log(`\n   Opening browser for authorization...`);
      console.log(`   If browser doesn't open, visit:\n   ${authUrl}\n`);
      openBrowser(authUrl);
    });

    server.on('close', () => clearTimeout(timeout));
    server.on('error', reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const tokenData = await startServer();
  console.log(`\n   Scope: ${tokenData.scope}`);
  console.log(`   Expires in: ${tokenData.expires_in}s`);
  console.log('\n   Run the smoke test:');
  console.log('   node packages/plugin-wealth/scripts/test-stash-value.mjs Allflame\n');
}

main().catch(e => { console.error(`\n❌ ${e.message}`); process.exit(1); });
