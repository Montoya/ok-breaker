# Identity, Sign-In, and Permissions

## Sign-in handoff

When a guest starts an action that requires Reddit identity:

1. Serialize the smallest safe pending intent or draft to browser storage before invoking the login flow.
2. Version and timestamp it, scope it to the post/entity, and validate it on restoration.
3. After the app returns or reloads, obtain identity from the server and then offer or perform the intended next step.
4. Clear the intent after success, explicit cancellation, expiry, or an entity mismatch.

Use local persistence for user experience continuity, not authentication. Never accept a stored username, role, ownership flag, or completed mutation as proof.

Choose storage deliberately: session storage for one-tab transient flows; local storage for reload or entrypoint transitions that must survive longer. Avoid storing sensitive data.

## Server-verifiable guest claims

When a logged-out user completes work that must become authoritative after sign-in, do not treat a locally restored result as proof. Keep the canonical result or progress on the server and return an opaque one-time claim ID and secret. Store only the claim credential plus the minimum display summary on the client.

Version and expire claims. Scope each claim to the installation, post or entity, and completed operation. Preserve the original timestamps and ordering facts so claiming later cannot improve a competitive or first-come result.

After login:

1. Resolve the account only from Devvit request context.
2. Validate the claim secret, expiry, entity mapping, completion state, and unclaimed status.
3. Define the conflict rule when the account already owns an equivalent canonical record.
4. Consume or resolve the claim atomically with the canonical account write and derived-index updates.
5. Return a terminal or retryable outcome explicitly. Clear the local credential only after a terminal acknowledgement.

Repeated claims by the same account should return the original outcome; another account must not be able to reuse a consumed claim. Recalculate server aggregates from canonical facts rather than importing client-computed totals. Treat this as best-effort continuity because browser storage can be cleared and does not move across browsers or devices.

## User actions

User-authored posts, comments, and subscriptions require declared `asUser` permissions and must be executed in real time from a qualifying user interaction. Keep the RPC/mutation directly connected to the click or submit action. Do not move it into a scheduler, install trigger, background refresh, or delayed publication queue and still expect it to act as the user.

Show the user what will happen before the action. Handle cancellation and platform errors without marking the local operation complete.

## Moderator features

- Authorize moderator routes on the server using the current Reddit context.
- Check again on each externally callable admin query or mutation.
- Do not accept a client boolean or rely on a hidden admin button.
- Fetch moderator status only when the user opens an admin/editor surface if it is not needed during ordinary play.
- Avoid repeated checks inside nested service functions after one authoritative entrypoint has established the invariant.
- Configure moderator-only menu items where appropriate, but keep the server check because menu visibility is not security.

Keep app-authored and moderator-authored publication paths distinct so attribution and permissions remain clear.
