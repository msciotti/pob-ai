/**
 * poewiki-relay — Cloudflare Worker that forwards MediaWiki API requests to
 * poewiki.net.
 *
 * Why this exists: poewiki.net's Cloudflare protection returns 403 to requests
 * from datacenter IP ranges, so plugin-wiki is unusable from cloud hosts.
 * Workers egress from Cloudflare's own network, which is not blocked. Responses
 * are cached at the edge so a relay puts LESS load on poewiki.net than direct
 * traffic would.
 *
 * Deploy:  npx wrangler deploy   (from this directory; free plan is plenty)
 * Then set on the machine running poe-ai:
 *   POE_WIKI_API_URL=https://poewiki-relay.<your-subdomain>.workers.dev/api.php
 */

const UPSTREAM = 'https://www.poewiki.net/api.php';
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const USER_AGENT = 'poe-ai-relay/1.0 (+https://github.com/msciotti/pob-ai)';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (url.pathname !== '/api.php') {
      return new Response('Not found — this relay only serves /api.php', { status: 404 });
    }

    const upstreamUrl = UPSTREAM + url.search;
    const cache = caches.default;
    const cacheKey = new Request(upstreamUrl, { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    const response = new Response(upstream.body, upstream);
    if (upstream.ok) {
      response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  },
};
