import type { Cache } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Date.now() + ttlMs
}

export class TtlCache implements Cache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;
  private readonly maxSize: number;

  constructor(options: { defaultTtlMs?: number; maxSize?: number } = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 30 * 60 * 1000; // 30 min default
    this.maxSize = options.maxSize ?? 1000;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.store.size >= this.maxSize) {
      // Prefer evicting an already-expired entry; fall back to FIFO (oldest insertion).
      const now = Date.now();
      let evictKey: string | undefined;
      for (const [k, entry] of this.store) {
        if (now > entry.expiresAt) { evictKey = k; break; }
        if (evictKey === undefined) evictKey = k; // track FIFO fallback
      }
      if (evictKey !== undefined) this.store.delete(evictKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
