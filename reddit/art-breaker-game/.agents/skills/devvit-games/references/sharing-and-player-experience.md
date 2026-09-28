# Sharing and Player Experience

## Logged-out continuity

Use browser storage for display continuity, not competitive authority. Version and timestamp stored state, scope it to the post and game entity, validate it on read, cap its size, and handle unavailable or cleared storage honestly.

When a logged-out result or progress must become authoritative after sign-in, keep the canonical record on the server and issue an opaque, one-time, expiring claim credential. After login, resolve the account from server context, validate and consume the claim atomically, preserve the original result ordering, and define conflicts with an existing account result. Never import client-computed totals or identity.

## Share data and recipient UI

Use `showShareSheet()` for the standard post-sharing flow. Attach a compact payload only when the recipient should see a meaningful landing variation, such as an invitation, challenge, selected level, shared creation, or result context. Read it with `getShareData()` when the shared link opens.

Treat share data as an untrusted deep-link parameter:

- keep it at or below 1024 characters and include a small schema version and intent discriminator;
- validate its schema, allowed values, lengths, and referenced entity IDs;
- never use it as identity, authorization, proof of score, ownership, payment, or reward eligibility;
- do not include secrets, hidden game data, raw user-generated content, or sensitive identifiers;
- resolve canonical entities and public display facts on the server when needed;
- ignore malformed, expired, unsupported, or mismatched payloads safely; and
- provide the normal post UI when no valid share data exists.

The payload may select or decorate recipient-facing UI, but it must not bypass the normal game state machine. Keep the variation bounded: show the shared context, then lead into the canonical post experience. Avoid constructing custom Reddit share URLs when the share sheet already carries the post and payload.

Test direct opens, valid shared opens, tampered JSON, unknown versions, oversize data, deleted entities, logged-out recipients, already-completed recipients, and links opened after the underlying state changed.

On desktop, a logged-out share initiated from expanded mode can place Reddit's sign-in modal behind the expanded webview. As part of that trusted share action, preserve the pending share intent and call `exitExpandedMode()` with the original click event so the sign-in UI is reachable. After the user returns, re-resolve identity and canonical game state before resuming or offering the share again.

## Sound and lifecycle

Start audio only after user interaction. Provide an obvious mute control, persist the preference at the appropriate viewer scope, and suspend or mute sound when the app is no longer visible. Do not let backgrounding pause authoritative game time.

Use sound to reinforce visible state, never as the sole feedback. Avoid announcing rapid timer ticks or score animation frames to assistive technology. Expose the final value promptly and announce only meaningful time thresholds or state changes.

## Motion and focus

Reduced motion should change presentation rather than rules or authoritative timing. Keep focus on a useful control after transitions and overlays, preserve keyboard operation, and ensure reconnecting or restoring state does not unexpectedly discard input unless the canonical state makes it invalid.
