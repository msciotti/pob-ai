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
      // Evict oldest entry
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
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
