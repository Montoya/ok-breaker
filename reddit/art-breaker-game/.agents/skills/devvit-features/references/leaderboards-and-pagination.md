# Leaderboards, Graphs, and Pagination

## Score model

Define whether the canonical record is first, best-ever, latest, or one entry per run. For replaceable records, compare the full ordering tuple before replacement. A common tuple is score descending, elapsed time ascending, achieved timestamp ascending, then stable user ID.

Validate scores against server-known game rules where possible. At minimum, validate types, ranges, board existence, and completion state. Never trust a client-supplied username or user ID.

## Sorted leaderboard

Store canonical per-user records in a hash and maintain a sorted-set rank index. Fetch the requested range from the sorted set, then batch-fetch only those records. Remove the previous member when replacing a user's best.

Define rank and percentile separately. A deterministic tie-break can give tied users distinct displayed ranks, while percentile can count only strictly lower primary scores so tied scores share a percentile.

Cap public leaderboard size and page size. Keep that cap separate from the current user's exact rank: absence from a top-N result does not imply rank N+1. Query the ordered index for the user's canonical member when an exact rank is needed. Return current page, total pages, total eligible players, current user's rank/result, and percentile when the UI needs them.

## Score graphs

State what the graph represents: all runs, each user's best, a time window, or a current board. Prefer server-produced aggregate bins when raw records are unnecessary.

- Choose stable bin boundaries so refreshes do not make the chart jump.
- Return counts plus the current user's bucket/score when useful.
- Preserve zero-count bins for a consistent axis.
- Bound the number of bins and avoid returning usernames or raw histories without a product need.
- Test empty, one-player, all-tied, outlier, and maximum-size distributions.

Before exposing a graph, consider whether its bin count, labels, boundaries, or viewer marker reveal protected game structure or private population data. Delay or reshape the response when the visualization would disclose information unavailable in the current product state.

## Pagination

Use bounded page pagination for a capped leaderboard and cursor pagination for an unbounded changing feed. Clamp all inputs server-side.

On the client, cache by entity, filter, sort, and page/cursor. Show cached pages immediately, revalidate stale data, prefetch adjacent pages, and reject out-of-order responses. Invalidate affected pages after score or moderation mutations.
