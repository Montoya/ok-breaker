# Authoritative Game State

## Model rounds explicitly

Use a finite set of named states rather than inferring game state from scattered booleans. A typical game may distinguish loading, ready, starting, active, ending, finalized, practice, and error states, but choose states that express the actual rules.

For each state, define:

- canonical server fields;
- client-visible fields;
- accepted commands;
- transition preconditions;
- side effects that occur exactly once; and
- recovery behavior after refresh or retry.

The client may optimistically animate a confirmed outcome, but it must not create an authoritative transition by animation, timer tick, route change, or component mount.

## Start and resume

Start play through an explicit user action when the product requires deliberate readiness. The start mutation should create a new round or return the existing in-progress or finalized round idempotently. Begin competitive client behavior only after the server returns the canonical round and timing data.

On reload, reconnect, or reopening after the user closes expanded mode, resume the same round from server state when the product defines continuity. Do not grant a new attempt or extend a deadline because client memory was lost. Keep enough canonical data to distinguish never started, active, finalizing, finalized, and expired rounds.

Do not depend on `beforeunload`, `unload`, a beacon, or component cleanup to save important state or notify the server that the expanded view closed. Persist important transitions when they occur. Treat a final close-time signal, if observed, as a best-effort hint only.

## Server-authoritative time

Persist server timestamps such as `startedAt` and `deadlineAt`. Render a smooth client countdown from the deadline, but validate every time-sensitive command against server time. Interval ticks, animation frames, device clocks, visibility changes, and client pause state are presentation inputs, not elapsed-time authority.

Define boundary semantics precisely: whether a command arriving exactly at the deadline is accepted, how network latency is treated, and which server timestamp determines completion. Test just-before, exact-boundary, and just-after cases.

## Commands, duplication, and concurrency

Give high-value or retryable commands a request ID scoped to the player and round. Record or derive an idempotent outcome so retrying the same command cannot award twice, spend twice, advance twice, or create duplicate content.

For rapid actions, distinguish intentional sequential commands from duplicate delivery. Serialize only where rules require ordering; otherwise use atomic Redis operations or transactions around the smallest correctness boundary. If transactions can conflict, use bounded retries and return a recoverable result when contention persists.

Finalization must be exactly-once from the product's perspective. A repeated solve, timeout, disconnect handler, or scheduler callback should return the canonical finalized result rather than recomputing a different one.

## Hidden information

Classify information before designing endpoints. Do not send hidden answers, unrevealed objects, random seeds that expose future outcomes, moderator-only configuration, or server validation rules merely to simplify client rendering.

Return opaque IDs and the minimum display state needed for the current transition. Reveal canonical information only when the authoritative state permits it. Check production bundles, bootstrap JSON, network responses, browser storage, share payloads, and logs for accidental disclosure.

## Competitive and noncompetitive modes

Represent competitive, practice, replay, tutorial, and spectator sessions separately when their persistence or eligibility differs. Do not let a practice result overwrite a ranked result or enter competitive histories and aggregates accidentally.

Define whether the canonical competitive record is first, best, latest, or one record per run. Enforce that rule on the server and make the UI state it accurately.

## Finalization and repair

List every canonical record, index, aggregate, reward, and notification affected by finalization. Update them within one transaction when feasible. When an external side effect cannot participate in the transaction, persist a durable state or outbox marker so retries reuse the same logical result.

Provide a bounded reconciliation path for derived rankings and aggregates. Repair from canonical result records; never treat a leaderboard, counter, or client history as the sole source of truth.
