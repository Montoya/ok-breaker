---
name: devvit-features
description: "Build or review Devvit Web features involving Reddit identity, permissions, leaderboards, sharing, user content, publication, subscriptions, and app lifecycle. Use for feature work in Devvit apps."
---

# Devvit Features

Build Reddit-native features with explicit identity, permission, lifecycle, and data-integrity boundaries.

## Establish the platform contract

Before implementation:

1. Inspect `devvit.json`, installed Devvit package versions, server context, and generated/local types.
2. Identify which operation runs as the app and which must run as the current user.
3. Identify the direct user action that authorizes any user-authored Reddit content or subscription.
4. Define canonical Redis records, ordered indexes, reverse references, and deletion behavior.
5. Verify volatile API names and permission strings against the installed version and official Devvit documentation.

Never trust client-provided user IDs, moderator flags, score authority, or ownership. Derive identity and authorization on the server.

## Route by feature

- For sign-in restoration, server-verifiable guest claims, user actions, subscriptions, and moderator access, read [identity-and-permissions.md](references/identity-and-permissions.md).
- For best-score leaderboards, rank, percentile, graphs, and pagination, read [leaderboards-and-pagination.md](references/leaderboards-and-pagination.md).
- For app icons, Open Graph share images, share deeplinks and landing UI, user posts, and nested comments beneath a stickied app comment, read [reddit-content-and-sharing.md](references/reddit-content-and-sharing.md).
- For user submissions, edit windows, duplicate and rate controls, moderation, reporting, and removal, read [user-generated-content.md](references/user-generated-content.md).
- For install/upgrade, scheduled publication, immutable revisions, reverse references, and post or comment deletion handlers, read [lifecycle-and-deletion.md](references/lifecycle-and-deletion.md).

## Cross-feature rules

- Validate all RPC inputs and clamp bounds server-side.
- Keep protected server checks at every externally callable protected route; hiding UI is not authorization.
- Make mutations idempotent or give them idempotency keys when retries can duplicate content, consume a claim, award a result, or advance a lifecycle.
- Store Reddit IDs and reverse mappings needed to reconcile edits and deletion events.
- Return the next-needed canonical state from mutations to avoid immediate redundant reads.
- Keep client pagination caches parameter-aware and invalidate them after affected mutations.
- Separate public data, authenticated private data, and moderator-only data into appropriately lean endpoints.
- Provide explicit loading, empty, permission-denied, cancellation, and retry states.

## Verify

Use unit tests for ranking and graph math, integration tests for permission boundaries and Redis cleanup, and real Devvit playtests for login, sharing, subscription, and user-authored Reddit actions. Test duplicate requests and repeated lifecycle/deletion events.
