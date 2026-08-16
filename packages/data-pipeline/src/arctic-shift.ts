import type { RawPost, RawComment } from './types.js';

const BASE = 'https://arctic-shift.photon-reddit.com/api';
const DELAY_MS = 2500; // stay well under rate limit

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function fetchPosts(opts: {
  subreddit: string;
  before?: number;
  limit?: number;
}): Promise<RawPost[]> {
  await sleep(DELAY_MS);
  const params = new URLSearchParams({
    subreddit: opts.subreddit,
    limit: String(opts.limit ?? 100),
    ...(opts.before ? { before: String(opts.before) } : {}),
  });
  const res = await fetch(`${BASE}/posts/search?${params}`);
  if (!res.ok) {
    throw new Error(`Arctic Shift posts HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json() as { data: RawPost[] | null; error?: string };
  if (data.error) throw new Error(`Arctic Shift posts error: ${data.error}`);
  return data.data ?? [];
}

export async function fetchComments(postId: string, limit = 100): Promise<RawComment[]> {
  await sleep(DELAY_MS);
  const params = new URLSearchParams({ link_id: postId, limit: String(limit) });
  const res = await fetch(`${BASE}/comments/search?${params}`);
  // 422 = post not yet indexed in Arctic Shift — treat as no comments
  if (res.status === 422) return [];
  if (!res.ok) {
    throw new Error(`Arctic Shift comments HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json() as { data: RawComment[] | null; error?: string };
  if (data.error) throw new Error(`Arctic Shift comments error: ${data.error}`);
  return data.data ?? [];
}
