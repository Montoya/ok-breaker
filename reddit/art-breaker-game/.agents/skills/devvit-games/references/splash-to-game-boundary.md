# Splash-to-Game Boundary

## Choose the inline role

An inline entrypoint may be either a lightweight launch screen or the game itself. Do not assume that successful gameplay requires expanded mode. A complete inline game is appropriate when its interaction is quick and bounded, all important content fits, it loads promptly, and it preserves normal Reddit feed scrolling and gestures.

Use a separate game entrypoint when the experience needs more space, richer gestures, heavier code or media, a longer flow, or an interaction model that does not fit the inline surface reliably.

## Give a launch-only splash one job

When the project uses a distinct splash and game entrypoint, treat the splash as a lightweight invitation. It should establish identity, communicate the premise, and offer a clear launch action without becoming a smaller duplicate of the game.

In that architecture, keep game initialization, interactive rules, input, authoritative round creation, timers, scoring, and the core gameplay loop in the game entrypoint. Encountering or rendering the launch-only splash must not consume an attempt, start authoritative time, award progress, or require the user to understand controls intended for the game interface.

When the inline entrypoint is intentionally the complete game, these restrictions do not prevent Play or another explicit inline action from starting the round. The authoritative transition still must not occur merely because the post rendered.

## Use restrained attraction

A launch-only splash may use brief, lightweight animation to attract attention and communicate that the post is interactive. Keep it cheap to download and render, avoid continuous distraction, respect reduced motion, and do not require animation to understand the premise or launch action.

Prefer CSS or small existing assets over loading a game engine, large media, full font set, audio library, level catalog, or gameplay bundle solely for the splash. Audio should not autoplay.

## Defer work to the game

For a launch-only splash, load only what it needs to render and decide its immediate state. Defer gameplay code, protected player data, heavy assets, editor or results modules, deep histories, leaderboards, and other nonessential requests until the game interface needs them.

Do not fetch data in a launch-only splash merely because the game will eventually use it. First ask whether the splash itself needs the response. If the answer is no, let the game interface own the request. When the inline entrypoint is the game, instead split first-load data by the player's immediate next action.

## Handoff without duplicate fetching

A separate splash and game entrypoint are separate client documents and do not share in-memory application state. When the splash already needed a small piece of public or nonauthoritative data that the game also needs, write a minimal handoff immediately before launch.

Include a schema version, creation time, short expiry, post or entity scope, and only the fields safe for client storage. Validate it at runtime in the game interface. Render from a valid handoff when useful, then revalidate canonical data in the background when freshness matters.

Do not hand off identity proof, authorization, hidden game facts, authoritative timing, trusted score, secrets, or a large bootstrap payload. Fall back cleanly to the game endpoint when storage is missing, stale, malformed, or unavailable.

Avoid two opposite failures:

- fetching the same stable bootstrap data once in the splash and immediately again in the game; and
- turning the splash handoff into a broad cache that couples both entrypoints or delays launch.

## Launch behavior

Enter the main game only from the appropriate user action. Prevent repeated launch requests while the transition is pending and provide a recoverable state if launch fails. Starting the authoritative game round may be the same user action or a later action inside the game, depending on the product; define that boundary explicitly and do not let entrypoint navigation imply a server transition accidentally.

## Closing and reopening expanded mode

A user can close an expanded view at any time. Treat closure like an interruption, not a lifecycle step the game controls. Do not require a final client request, unload handler, animation completion, or orderly component teardown to preserve authoritative state.

Choose restore semantics deliberately for each kind of state:

- discard transient presentation state when restarting it is harmless;
- keep nonauthoritative convenience state in a small versioned, scoped, expiring client snapshot when restoring it materially improves the experience; and
- persist important progress, authoritative rounds, purchases, rewards, or competitive state on the server as part of the normal mutation that creates it.

On the next launch, validate any client snapshot and reconcile it with canonical server state. Define whether to resume, restart, show a completed result, or ask the user. Do not let an older local snapshot overwrite newer server state.

For timed games, closing the view must not pause or extend a server-authoritative deadline. For untimed experiences, decide explicitly whether partial progress autosaves, saves at checkpoints, requires a Save action, or is intentionally discarded, and communicate behavior that could surprise the user.

## Verify

For a separate launch flow, measure the splash independently from the game. Inspect its production HTML, JavaScript, CSS, fonts, images, and requests. Confirm that it loads without gameplay-only bundles, makes no premature authoritative mutation, preserves Reddit feed scrolling, respects reduced motion, and still launches when handoff storage fails.

For a full inline game, measure the complete inline bundle and first interaction instead. Verify that every state fits the inline height, the feed remains scrollable over the whole surface, controls use bounded gestures, and heavier secondary features do not inflate the first-load path unnecessarily.

Test valid, stale, malformed, wrong-entity, and absent handoffs. Confirm that a valid handoff prevents an avoidable duplicate request without allowing stale or untrusted data to overwrite newer canonical game state. Close the expanded view during loading, input, pending mutations, active timing, and completion, then reopen and verify the chosen restore behavior.
