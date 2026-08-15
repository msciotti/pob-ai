import type { Logger } from './types.js';

export class ConsoleLogger implements Logger {
  constructor(private readonly prefix: string = '[poe-ai]') {}

  info(msg: string, ...args: unknown[]): void {
    console.error(`${this.prefix} [INFO] ${msg}`, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    console.error(`${this.prefix} [WARN] ${msg}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    console.error(`${this.prefix} [ERROR] ${msg}`, ...args);
  }

  debug(msg: string, ...args: unknown[]): void {
    if (process.env.POE_AI_DEBUG) {
      console.error(`${this.prefix} [DEBUG] ${msg}`, ...args);
    }
  }
}
