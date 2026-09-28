# Client Caching and Pagination

## Choose the pagination model

For a small, bounded dataset, fetch the collection once and paginate, filter, or sort it on the client. This avoids repeated server round trips and can make navigation immediate. Confirm that the complete response has an acceptable transfer, parse, render, and memory cost, and that its freshness requirements permit one snapshot.

For a larger, changing, viewer-dependent, or unbounded dataset, paginate on the server. Request the current page or cursor only when needed, retain each loaded result in a parameter-aware cache, and prefetch a small valid neighborhood such as the previous and next pages. Do not prefetch the whole collection through many nominally paginated requests.

Base the choice on measured bytes, record complexity, update frequency, server work, and device memory rather than a fixed item-count threshold. Revisit the decision as the dataset grows.

## Cache keys

Include every parameter that can change the response: entity ID, filter, sort order, page or cursor, page size, and viewer-dependent scope. Never let one user's private result satisfy another user's request.

Use intentionally different TTLs. Stable discovery content can usually live longer than a fast-changing leaderboard.

## Cache behavior

A reusable query cache should support:

- synchronous reads that report fresh versus stale;
- explicit writes;
- one in-flight promise per key;
- invalidation by exact key or predicate;
- a generation/version guard so a pre-mutation request cannot repopulate invalidated data.

Place shared query data above individual page components or in a cache whose lifetime spans navigation. Unmounting and remounting a page should not by itself trigger another network request.

For navigation:

1. Show a cached page immediately.
2. Revalidate stale entries without blanking the existing page.
3. Fetch missing pages with a localized loader.
4. Prefetch valid adjacent pages after the current page resolves.
5. Ignore a response if the active request target has since changed.

Prefetch only a small neighborhood. Respect network cost and server limits.

Keeping previously visited page components mounted can preserve expensive render state, scroll position, form input, or canvas state. Use a bounded mounted-page window and make inactive pages hidden and noninteractive. Do not keep an unbounded feed mounted, and do not rely on mounting alone to prevent requests; the cache should retain fetched data even when a page must unmount.

## Avoid repeated requests

- Build one canonical cache key from every response-shaping input, including entity, filter, sort, page or cursor, page size, and viewer scope.
- Read the cache before starting a request. Return fresh data immediately and use stale-while-revalidate when the product can tolerate it.
- Store one in-flight promise per key so concurrent components and prefetches share the same request.
- Keep the cache outside short-lived route and page components so navigation does not erase it.
- Let mutations return useful canonical next state and seed affected cache entries from that response instead of immediately refetching them.
- Invalidate narrowly after mutations; do not clear unrelated entities, filters, or pages.
- Use a generation guard or request token so a response started before invalidation cannot restore stale data.
- Ignore a completed response when the active entity, page, filter, or viewer has changed.
- Give different data classes intentional TTLs instead of refetching everything on every mount or caching everything indefinitely.
- Persist only safe data that benefits from surviving a document reload, with schema version, entity scope, viewer scope when needed, and expiry validation.

## Pagination contracts

Clamp page numbers and page sizes on the server. Return normalized page metadata so the client does not guess. Cursor pagination is preferable for unbounded changing feeds; bounded page pagination is appropriate for a capped leaderboard or small catalog.

Tests should cover forward/back navigation, stale-while-revalidate, adjacent prefetch, concurrent identical calls, out-of-order responses, and mutation during a request.
