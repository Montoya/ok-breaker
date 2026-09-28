---
name: devvit-games
description: "Build or review Devvit Web games with server-authoritative rounds, timers, scoring, rankings, replays, logged-out continuity, recovery, and accessible feedback. Use for game mechanics and integrity."
---

# Devvit Games

Build games whose client feels immediate while the server remains authoritative for competitive outcomes.

## Establish the game contract

Before implementation:

1. Define the round state machine and the exact event that starts play.
2. Decide whether the inline entrypoint is a lightweight launch screen or the game itself, and define the boundary accordingly.
3. Decide which facts are public, player-visible only after a transition, or permanently server-only.
4. Define the server-authoritative record, timing model, scoring rules, eligibility rules, and ranking tuple.
5. Separate competitive attempts from practice, replay, preview, tutorial, and spectator modes.
6. Decide how refresh, reconnect, backgrounding, user-initiated expanded-view closure, duplicate requests, and logged-out-to-logged-in transitions recover.
7. Identify every aggregate and index updated when a result becomes final.

Never accept client-calculated time, score, completion, identity, inventory, reward eligibility, or hidden-game facts as authoritative.

## Route by concern

- For choosing between a full inline game and a separate splash-to-game flow, including lightweight attraction, deferred loading, and state handoff, read [splash-to-game-boundary.md](references/splash-to-game-boundary.md).
- For round state, server clocks, hidden information, idempotency, replay, and recovery, read [authoritative-game-state.md](references/authoritative-game-state.md).
- For scoring, ranking, leaderboards, histories, and score graphs or distributions, read [scores-and-visualizations.md](references/scores-and-visualizations.md).
- For logged-out continuity, share deeplinks, recipient-specific landing UI, sound, and accessible feedback, read [sharing-and-player-experience.md](references/sharing-and-player-experience.md).

## Cross-game rules

- Make state transitions explicit and testable; reject commands that are invalid for the canonical state.
- Give retryable mutations stable request IDs or idempotent semantics.
- Return canonical next state from mutations so the client does not reconstruct outcomes or immediately refetch them.
- Keep irreversible result finalization atomic with eligibility, ranking, and aggregate updates, or make partial work detectable and repairable.
- Rate-limit high-frequency actions without making ordinary latency or retries corrupt play.
- Keep loading, reconnecting, ending, finalized, expired, and unrecoverable states distinct.
- Treat expanded views as interruptible: users can close them at any time, and important progress must not depend on an unload callback.
- Treat share data, local storage, URL state, and display caches as untrusted hints.
- Preserve game mechanics when reduced motion, muted sound, keyboard control, or assistive technology changes presentation.
- When the inline entrypoint is launch-only, keep it lightweight and move the core loop into the game entrypoint. A bounded, fast, gesture-compliant game may instead run directly inline.

## Verify

Test every state transition, invalid transition, duplicate command, boundary timestamp, concurrent finalization, refresh point, reconnect path, and eligibility mode. Confirm that hidden information never appears in client bundles, bootstrap payloads, share data, logs, or premature graphs.
