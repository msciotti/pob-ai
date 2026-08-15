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
    const existing = this.requestQueues.get(host) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.requestQueues.set(host, existing.then(() => {
      resolve();
      return new Promise<void>((r) => setTimeout(r, this.minIntervalMs));
    }));
    return existing.then(() => next);
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
