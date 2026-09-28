# Redis Indexes for Devvit

Devvit provides a managed Redis database for server-side app state. Its API supports a useful subset of Redis, including hashes, sorted sets, counters, expiration, and transactions. Optimize schemas around those supported primitives rather than treating Redis as a JSON blob store.

Each app installation has a separate Redis namespace siloed by subreddit, and Devvit cannot list every key in an installation. Use stable collection keys and maintain the indexes and reverse mappings needed to find data again. A cross-community or global leaderboard needs an explicitly shared service instead of assuming one Redis namespace spans installations.

## Fetch the page, not the collection

Do not use `hGetAll` followed by application sorting and slicing for a paginated hot path. Keep an ordered index, select the current ID range first, then fetch only those records with `hMGet` or equivalent batched reads.

Typical split:

- hash: canonical records keyed by ID;
- sorted set: order/rank index;
- reverse hashes: post, comment, or owner IDs back to the canonical entity;
- marker key: completion of a lazy legacy-index reconciliation.

## Leaderboard ordering

Use the numeric sorted-set score for the primary metric and encode deterministic tie-break data into the member when the Redis API cannot express compound sorting directly. Include a stable unique ID last.

For score descending, elapsed time ascending, and achieved time ascending, normalize and bound each component, make the member preserve secondary order, remove the previous member on replacement, and retain the canonical record separately. Document the encoding and test its numeric bounds.

## Rank and percentile

Use sorted-set rank operations instead of loading every score. Define percentile semantics before coding. A useful definition is the percentage of players with a strictly lower primary score; ties then share the same percentile even if deterministic tie-breakers give them distinct displayed ranks.

Compute displayed rank from the exact indexed member. Compute the strict-lower count from the first member at or above the primary score, not from the user's tie-broken rank.

## Migration and deletion

For legacy hashes without an index, reconcile once behind a durable marker. Treat the marker as valid only if all required writes completed.

On deletion, remove canonical records, sorted-set members, readiness markers when the whole entity is removed, and reverse references and pagination indexes. Make cleanup idempotent so repeated Devvit deletion events are harmless.

## Transaction contention

Use transactions for read-check-write invariants and multi-record updates that must remain consistent, not as a default wrapper around every Redis call. Keep the watched set and transaction body small, release or discard a transaction on every early exit, and use bounded retries for expected conflicts.

Measure conflict rate and retry latency on hot entities. If one key becomes a contention point, consider whether a single-command atomic primitive, partitioned ownership, durable claim, or asynchronous derived update can preserve the invariant with less contention. When the retry budget is exhausted, return an explicit recoverable outcome rather than pretending the mutation succeeded.
