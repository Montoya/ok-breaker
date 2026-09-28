# Playtest and Launch Verification

## Capability spike

Before building deeply around a platform-dependent assumption, create the smallest real Devvit path that proves it in the intended subreddit and surface. Useful spikes include identity, moderator authorization, Redis transactions, scheduler execution, custom-post creation, user actions, triggers, media, inline input, expanded entrypoints, and share data.

Record what was tested, on which Reddit client, with which app version and permission state. Keep spike code only when it becomes a maintained test or diagnostic.

## Webview matrix

Test every supported major state, not only initial load, across:

- inline `REGULAR` and `TALL` posts at narrow and wide widths;
- surrounding feed scrolling over every inline region;
- expanded mobile and desktop when the app uses them;
- loading, empty, permission-denied, retry, and restored states;
- software keyboard appearance and dismissal;
- backgrounding, returning, refresh, and reconnect;
- closing and reopening expanded mode during every meaningful state;
- pointer, touch, and keyboard input;
- reduced motion, muted sound, and visibility changes;
- long text, zoomed text, screen readers, and focus traversal; and
- slow or failed network paths.

Standalone browser tests are useful for layout and logic but do not prove Reddit feed gestures, client effects, safe areas, attribution, login return behavior, or native-app webview behavior.

## Splash-to-main transition

First determine whether inline is a launch-only splash or the complete bounded experience. For a launch-only splash, inspect it as its own performance and behavior boundary. Confirm that it contains only lightweight presentation, restrained optional animation, and the launch interaction—not the core gameplay or main app flow. Rendering it must not create an attempt, start a timer, award progress, or perform another premature authoritative mutation.

Verify that gameplay-only code, heavy assets, and main-interface data are deferred. When the splash hands already-fetched data to the main entrypoint, test valid, stale, malformed, wrong-entity, unavailable-storage, and newer-server-state cases. Confirm that a valid handoff avoids duplicate fetching and that every invalid handoff falls back without blocking launch.

For a complete inline game, instead verify every gameplay state within the inline height and feed context, measure its full initial payload and first interaction, and confirm that normal wheel and touch scrolling pass through the entire post. Do not fail an inline implementation merely because it does not transition to expanded mode.

Close expanded mode during initial loading, partially entered input, pending mutations, active play, transitions, and completed states. Reopen from the splash and verify the product's declared behavior for each state: discard, restore a client snapshot, reconcile with the server, resume, restart, or show a canonical completion. Confirm that important state survives even when no unload or cleanup callback runs, and that stale local state cannot overwrite a newer server record.

## Identity and permissions

Exercise logged-out, logged-in, moderator, nonmoderator, deleted, and inaccessible Reddit objects. Invoke protected endpoints directly as an unauthorized user; hidden controls are not a permission test.

Playtest user-authored posts, comments, and subscriptions with the actual approval and permission state intended for launch. Confirm attribution and cancellation rather than inferring success from local state.

## Sharing and navigation

Test the share sheet on supported clients, a direct post link, a shared link with valid data, tampered or unknown share data, and the fallback UI without data. Verify that recipient UI resolves canonical state and does not grant authority from the payload.

On desktop, test sharing as a logged-out user from expanded mode. Confirm that the expanded layer exits so Reddit's sign-in modal is visible and usable, that the original trusted event reaches `exitExpandedMode()`, and that pending share context survives the transition without recording a share prematurely. Also confirm that the workaround does not close inline or mobile surfaces unnecessarily.

Test navigation to posts and comments on the Reddit clients the app supports, including failure and inaccessible-content behavior. Keep the current screen recoverable when navigation or a client effect does not complete.

## Performance

Measure production output and real hosted behavior. Record first useful render, cold and warm requests, server latency, response sizes, entrypoint assets, repeated navigation, and the slowest critical interaction. Use Lighthouse where it represents the inline document, but also measure inside Reddit on representative mobile hardware and connections.

## Launch readiness

Before publishing:

- validate `devvit.json` against its schema and inspect the production bundle;
- run type checks, lint, automated tests, and a production build;
- verify install, upgrade, scheduled, and deletion handlers against production-like state;
- confirm user-content reporting/removal and supported post/comment deletion behavior;
- verify app icon, share preview, fallback text, permissions, and declared capabilities;
- provide a non-template README that explains the app, configuration, deployment, operation, and support path; and
- playtest the uploaded build in a dedicated test subreddit before app review.

Separate launch blockers from optional improvements, and preserve evidence for platform-dependent checks that cannot be automated.
