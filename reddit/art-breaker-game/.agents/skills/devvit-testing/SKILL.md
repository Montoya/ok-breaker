---
name: devvit-testing
description: "Plan or review Devvit Web testing across domain logic, @devvit/test, Redis, schedulers, permissions, concurrency, webviews, Reddit playtests, and launch readiness. Not for generic frontend testing."
---

# Devvit Testing

Test product invariants at the cheapest reliable layer, then verify platform behavior in a real Reddit surface.

## Build the test map

1. List the rules whose failure would corrupt data, permissions, user content, publication, payments, or competitive outcomes.
2. Separate pure domain behavior, Devvit capability integration, client behavior, and platform-host behavior.
3. Identify duplicate delivery, concurrency, retry, partial failure, deletion, and migration cases.
4. Map each case to unit tests, `@devvit/test`, browser tests, or real subreddit playtests.
5. Inspect installed package versions, `devvit.json`, test configuration, and generated types before writing capability tests.

Do not mock away the boundary being tested. Pure functions should stay platform-free; capability tests should exercise the same Redis, scheduler, media, Reddit, realtime, settings, or notification client calls used by production code.

## Route by test layer

- For `@devvit/test`, capability fixtures, Redis, schedulers, triggers, media, realtime, settings, Reddit mocks, and HTTP mocks, read [capability-harness.md](references/capability-harness.md).
- For duplicate requests, idempotency, transaction contention, stale clients, migrations, and invariant-focused scenarios, read [concurrency-and-recovery.md](references/concurrency-and-recovery.md).
- For inline and expanded webviews, logged-out flows, permissions, devices, performance, accessibility, app review, and launch checks, read [playtest-and-launch.md](references/playtest-and-launch.md).

## Test rules

- Assert observable state and durable invariants, not implementation wording or private helper calls.
- Use deterministic clocks, IDs, randomness, and fixtures when the rule depends on them.
- Give each capability test an isolated world; do not make order-dependent suites.
- Exercise permission denial as well as success, including direct calls to protected endpoints.
- Repeat triggers and mutations to prove idempotency.
- Verify cleanup from complete, partial, legacy, and already-deleted state.
- Keep real external side effects out of automated tests unless the test environment is explicitly intended for them.
- Record unsupported harness behavior and cover it in a real playtest instead of pretending the mock proves it.

## Verify

Run the repository's type checks, lint, unit and integration tests, and production build. Then playtest platform-dependent flows on Reddit. Report which claims were automated, manually observed, inferred, or left unverified.
