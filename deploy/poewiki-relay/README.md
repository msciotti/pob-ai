# poewiki-relay

A minimal Cloudflare Worker that forwards `wiki_lookup` API calls to
poewiki.net. Needed when poe-ai runs on a cloud/datacenter host (DigitalOcean,
AWS, etc.) — poewiki.net's Cloudflare protection returns **403** to datacenter
IP ranges, so direct lookups fail there. Workers egress from Cloudflare's own
network, which is not blocked.

The relay caches successful responses at the edge for 6 hours, so it generates
*less* poewiki.net traffic than direct polite usage, and it identifies itself
with a `poe-ai-relay` User-Agent pointing at this repo.

## Deploy (one time, ~5 minutes)

Requires a free Cloudflare account.

```bash
cd deploy/poewiki-relay
npx wrangler login     # opens a browser to authorize
npx wrangler deploy    # prints your worker URL
```

## Configure poe-ai

On the machine running the MCP server:

```bash
export POE_WIKI_API_URL="https://poewiki-relay.<your-subdomain>.workers.dev/api.php"
```

That's the only variable you need — `POE_WIKI_BASE_URL` can stay unset, since
it's only used to build human-clickable page links in tool output, and humans
aren't blocked.

## Notes

- The relay only serves `GET /api.php`; everything else 404s. It carries no
  secrets and needs no configuration.
- Free-plan limits (100k requests/day) are far beyond what any agent generates,
  especially with plugin-wiki's own response caching in front of it.
- Run your own relay rather than sharing one: quotas stay yours, and poewiki
  sees distributed, cached, identified traffic instead of one hot origin.
