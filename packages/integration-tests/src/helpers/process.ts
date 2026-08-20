/**
 * Low-level subprocess spawning shared by the e2e suites — used where we need raw
 * access to a server subprocess's stdio streams (e.g. to read the actual bound
 * HTTP port back out of stderr, or to assert stdout only ever carries JSON-RPC).
 * The stdio *protocol* tests mostly go through the official SDK's
 * StdioClientTransport instead, which spawns its own subprocess.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface SpawnedProcess {
  child: ChildProcessWithoutNullStreams;
  /** Raw stdout, as it arrived — one entry per 'data' event, un-split. */
  stdoutChunks: string[];
  /** stderr, split into complete lines as they arrive. */
  stderrLines: string[];
  /** Poll stderr lines until one matches `matcher`, returning the match. */
  waitForStderr(matcher: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  /** Wait for the process to exit, returning its exit code (null if killed by signal). */
  waitForExit(timeoutMs?: number): Promise<number | null>;
  kill(): Promise<void>;
}

export function spawnNode(
  scriptPath: string,
  options: { env?: NodeJS.ProcessEnv; args?: string[] } = {},
): SpawnedProcess {
  const child = spawn(process.execPath, [scriptPath, ...(options.args ?? [])], {
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutChunks: string[] = [];
  const stderrLines: string[] = [];
  let stderrBuf = '';

  child.stdout.on('data', (chunk: Buffer) => {
    stdoutChunks.push(chunk.toString('utf8'));
  });

  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    let idx: number;
    while ((idx = stderrBuf.indexOf('\n')) !== -1) {
      stderrLines.push(stderrBuf.slice(0, idx));
      stderrBuf = stderrBuf.slice(idx + 1);
    }
  });

  async function waitForStderr(matcher: RegExp, timeoutMs = 10_000): Promise<RegExpMatchArray> {
    const start = Date.now();
    for (;;) {
      for (const line of stderrLines) {
        const m = line.match(matcher);
        if (m) return m;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `Process exited (code=${child.exitCode}, signal=${child.signalCode}) before stderr matched ${matcher}.\n` +
            `Captured stderr:\n${stderrLines.join('\n')}`,
        );
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Timed out after ${timeoutMs}ms waiting for stderr to match ${matcher}.\nCaptured stderr:\n${stderrLines.join('\n')}`,
        );
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  function waitForExit(timeoutMs = 10_000): Promise<number | null> {
    return new Promise((resolve, reject) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve(child.exitCode);
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for process to exit`));
      }, timeoutMs);
      child.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  async function kill(): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  return { child, stdoutChunks, stderrLines, waitForStderr, waitForExit, kill };
}
