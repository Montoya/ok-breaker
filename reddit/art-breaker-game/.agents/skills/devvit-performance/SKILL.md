---
name: devvit-performance
description: "Diagnose and optimize Devvit Web performance across startup, assets, caching, pagination, Redis queries, bundles, and serverless paths. Use for latency, repeated fetching, or scaling work."
---

# Devvit Performance

Optimize perceived speed first, then reduce network, server, and Redis work without weakening correctness.

## Design for Devvit's Redis

Devvit provides a managed Redis database for server-side app state. Use its supported hashes, sorted sets, counters, expiration, and transactions as the primary persistence and query primitives when they fit the product. Verify the installed Devvit API and enable the Redis permission in `devvit.json`.

Redis data is namespaced per app installation and siloed by subreddit. Use stable, discoverable collection keys and explicit indexes because Devvit does not support a global key scan. Treat cross-community data, such as a global leaderboard across installations, as a separate architecture requiring shared storage.

## Start with evidence

1. Inspect `devvit.json`, the client entrypoints, the server bootstrap routes, and the installed Devvit versions.
2. Trace the exact interaction from the Reddit surface through client startup, RPC, Reddit APIs, Redis, and rendering.
3. Separate these costs before changing code:
   - entrypoint and asset download;
   - JavaScript parse and React mount;
   - server cold start;
   - Redis and Reddit API calls;
   - data transfer and rendering.
4. Record a baseline for cold open, warm open, background/resume, request count, response size, and repeated pagination.

Do not describe the server response as the whole loading cost. Expanded Devvit views are separate client documents and can pay bundle, boot, server, and data costs independently.

## Optimize in passes

Use this order unless measurements point elsewhere:

1. Make the first useful screen immediate with a validated preview-to-expanded handoff.
2. Choose pagination by measured data size. Fetch a small bounded collection once and paginate it locally; for a larger, changing, or unbounded collection, request pages on demand, cache them by every response-shaping parameter, and prefetch a small adjacent-page window. Keep cached page data independent of component mount state so returning to a page does not repeat the request.
3. Split endpoints so the first request returns only data needed for the first interaction.
4. Replace full scans with Redis indexes and fetch only the records needed for the current page. For a leaderboard, keep canonical records in a hash and ranking order in a Redis sorted set; page and rank from the sorted set, then batch-fetch only those records. Do not load a full hash and sort it in application code.
5. Budget the complete hosted client payload, including JavaScript, CSS, fonts, images, audio, source maps, and other static files. Compress and subset critical assets, defer noncritical ones at feature boundaries, and prefetch only likely next interactions after the first useful screen is ready. Verify the emitted bundle and asset graph because separate Devvit entrypoints can still share and eagerly preload a large chunk.

Read [startup-and-endpoints.md](references/startup-and-endpoints.md) for passes 1, 3, and 5. Read [client-caching.md](references/client-caching.md) for pass 2. Read [redis-indexes.md](references/redis-indexes.md) for pass 4.

## Preserve correctness

- Treat browser storage and cached client state as hints, never as authorization or canonical server state.
- Validate cache schemas, versions, entity IDs, and age before use.
- Render cached data immediately, then refresh in the background when freshness matters.
- Prevent an older response from overwriting a newer page, entity, or mutation result.
- Invalidate both stored values and in-flight requests after mutations.
- Keep indexes synchronized on create, replacement, deletion, and migration.
- Make migrations and lifecycle initialization idempotent.
- Keep sensitive or hidden state out of bootstrap and cache payloads; a smaller response must still enforce the product's disclosure boundaries.
- Measure transaction conflicts and retries on contested mutations instead of optimizing only read paths.

## Verify

- Test cache hit, expiry, malformed storage, wrong entity, request deduplication, stale response, invalidation, and mutation races.
- Test index ties, replacement, deletion, legacy reconciliation, empty pages, and page bounds.
- Run type checks, lint, unit tests, and a production build.
- Re-measure cold and warm flows. Report observed results separately from expected improvements.
- Instrument endpoint latency, transaction retries, scheduler or publication failures, cache effectiveness, and index-repair activity when those paths matter operationally.
