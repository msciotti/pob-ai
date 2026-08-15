import axios, { type AxiosInstance } from 'axios';
import type { HttpClient, HttpRequestOptions } from './types.js';

export class RateLimitedHttpClient implements HttpClient {
  private client: AxiosInstance;
  private requestQueues = new Map<string, Promise<void>>();
  private readonly minIntervalMs: number;

  constructor(options: { minIntervalMs?: number; timeoutMs?: number } = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1000; // 1 req/sec per host default
    this.client = axios.create({
      timeout: options.timeoutMs ?? 10_000,
    });
  }

  private getHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  private async throttle(host: string): Promise<void> {
    // Chain a delay slot onto the existing queue so callers are serialized
    // and each waits for the full minIntervalMs before proceeding.
    const slot = (this.requestQueues.get(host) ?? Promise.resolve()).then(
      () => new Promise<void>((r) => setTimeout(r, this.minIntervalMs)),
    );
    this.requestQueues.set(host, slot);
    // Clean up the entry once this slot settles so the Map doesn't grow unboundedly.
    slot.then(() => {
      if (this.requestQueues.get(host) === slot) this.requestQueues.delete(host);
    });
    return slot;
  }

  async get<T = unknown>(url: string, options: HttpRequestOptions = {}): Promise<T> {
    await this.throttle(this.getHost(url));
    const response = await this.client.get<T>(url, {
      params: options.params,
      headers: options.headers,
      timeout: options.timeoutMs,
    });
    return response.data;
  }

  async post<T = unknown>(url: string, body: unknown, options: HttpRequestOptions = {}): Promise<T> {
    await this.throttle(this.getHost(url));
    const response = await this.client.post<T>(url, body, {
      params: options.params,
      headers: options.headers,
      timeout: options.timeoutMs,
    });
    return response.data;
  }
}
