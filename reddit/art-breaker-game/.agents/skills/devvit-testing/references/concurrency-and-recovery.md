# Concurrency and Recovery Testing

## Start from invariants

Write down the postcondition before constructing the race. Examples include one canonical result per eligibility key, one published post per release claim, one reward redemption, one response per user/entity, or synchronized canonical and ordered indexes.

Assert the invariant after all competing operations settle. Do not require one specific winner unless the product defines deterministic priority.

## Duplicate delivery

Run the same request ID concurrently and sequentially. Repeat start, submit, finalize, publish, claim, delete, and trigger operations where applicable. The result should be one logical mutation plus stable responses or an explicit already-completed outcome.

Also send different request IDs for the same protected resource. Idempotency-key handling alone does not enforce uniqueness rules.

## Transaction contention

Force two callers to read the same prior state before either commits when the harness permits it. Verify bounded retry behavior, correct cleanup on early exit, and an honest recoverable failure when contention exceeds the retry budget.

Keep transaction tests focused on the smallest atomic boundary. Separately test external effects that happen after commit and the durable markers used to resume them.

## Stale and reordered clients

Resolve requests out of order. Confirm that an older load cannot overwrite a newer entity, page, permission result, or mutation response. Start a read, perform a mutation and invalidation, then resolve the old read to ensure it cannot repopulate stale cache state.

Test clients resuming from old browser storage, an earlier schema version, a deleted post, an expired claim, or a changed canonical record. Local state should be validated and reconciled rather than trusted.

## Partial failure and repair

Create fixtures missing one index, reverse mapping, aggregate, marker, or external-effect result. Verify that ordinary reads do not silently perform an unbounded migration. Exercise explicit repair or bounded lazy reconciliation and prove that running it twice is harmless.

For multi-stage operations, fail after each durable step. A retry should continue the same logical operation rather than produce a second external object or different outcome.

## Time boundaries

Use a controlled clock. Test immediately before, exactly at, and immediately after deadlines, expirations, edit windows, release times, and retention cutoffs. Include timezone and daylight-saving transitions when users configure local civil times.
