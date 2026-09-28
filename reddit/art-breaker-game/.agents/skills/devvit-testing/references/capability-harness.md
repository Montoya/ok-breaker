# Devvit Capability Harness

## Use the installed test surface

Inspect the installed `@devvit/test`, Devvit capability packages, test runner, and project configuration. Import the production capability clients inside the code under test and let the Devvit harness replace their backing plugins with isolated stateful mocks.

Keep request parsing, authentication context, repository operations, and response serialization in the exercised path when those boundaries matter. Use pure unit tests for calculations and schemas that do not need Devvit context.

## Redis

Test canonical records and every index they update. Cover missing keys, malformed legacy values, expirations, page bounds, ties, replacement, deletion, and reconciliation markers.

Exercise the production `watch`/`multi`/`exec` transaction flow for read-check-write invariants. Assert the complete postcondition across canonical records, indexes, counters, and reverse references. Add explicit contention tests when two requests can target the same logical entity.

## Scheduler

Scheduled jobs do not need wall-clock waiting in the harness. Assert that the correct named job, data, and intended time were registered or cancelled, then invoke the job handler directly with deterministic input to test its behavior.

Test repeated sweeps, late invocation, missing data, overlapping manual and scheduled actions, and a previous partial failure. A scheduler test that only confirms registration does not prove publication or cleanup behavior.

## Reddit, settings, media, realtime, and notifications

Seed only the Reddit objects and permissions required by the scenario. Test logged-out, ordinary-user, moderator, missing-object, deleted-object, and capability-error paths where relevant.

For capabilities whose harness records calls rather than performing the real effect, assert both the durable local state and the recorded intent. Do not claim that a mock proves real attribution, UI presentation, media rendering, notification delivery, or client behavior.

## HTTP

Mock external HTTP at the network boundary. Cover status failures, invalid bodies, timeouts or rejected promises, response size limits relevant to the app, and retry behavior. Never make a routine test depend on a live third-party service.

## Triggers

Call trigger handlers with representative typed payloads. Deliver the same event repeatedly and in plausible unexpected order. Verify narrowly scoped cleanup, missing reverse mappings, deleted canonical records, and legacy state.
