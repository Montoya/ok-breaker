# Art Breaker product and implementation plan

## Product vision

Art Breaker is a community-authored brick breaker game for Reddit. Every custom post is both a piece of pixel art and a replayable level. Anyone can draw a board from a constrained palette, publish it as a Reddit post attributed to them, and challenge the community to find the highest-scoring way to clear it.

The game should feel immediate and legible like an early arcade game, but not unfinished: crisp motion, expressive brick destruction, layered chiptune sound, satisfying combo feedback, and small moments of celebration should give it personality without compromising the clean retro presentation.

The long-term loop is:

1. See an Art Breaker board in the Reddit feed.
2. Tap **Play** to open the level in expanded mode, then press once to launch.
3. Replay the same deterministic level to improve its high score.
4. Tap **Create** to open a blank 18 × 16 editor.
5. Draw with twelve colors, publish the board, and receive a new Reddit post attributed to the creator.
6. Other Redditors play, compare scores, comment, and create more art.

After installation, the app creates one seed post: a completely filled 16 × 14 playable area rendered as horizontal rainbow stripes. From that point forward, the visible catalog is community driven.

## Product principles

- **Art is the level.** The post preview should foreground the board rather than surrounding it with application chrome.
- **One tap to understand.** Play and Create are the only primary actions on a board post.
- **Same board, same challenge.** Layout, power-up placement, initial conditions, and scoring rules must be deterministic for a given ruleset version.
- **Replay rewards mastery.** Exponentially compounding combo scoring creates meaningful routing and paddle-placement decisions.
- **Retro, not crude.** Use a limited palette, pixel-aligned geometry, monospace/pixel typography, synthesized chiptune audio, and restrained glow/animation.
- **Mobile first.** The authoritative interaction target is Reddit's expanded mobile view; desktop should preserve the same logical playfield rather than changing the game.
- **Fast and small.** Feed previews must load quickly, and the expanded experience should avoid unnecessary runtime weight.
- **Version the rules.** Old posts must remain playable and comparable after physics or scoring changes.

## Experience architecture

### Inline Reddit post

Each level post shows:

- the full board preview;
- the title/creator information supplied by Reddit;
- a primary **Play** button;
- a secondary **Create** button;
- optionally, compact level statistics such as clears, plays, or the top score once those features exist.

The inline view should not capture scrolling gestures. Both buttons open user-initiated expanded mode, which Reddit identifies as the appropriate surface for games and rich touch interaction.

### Expanded Play view

- Render the selected board, paddle, and ball immediately in a frozen ready state.
- Show **Press to play** on touch-first devices and **Click to play** on mouse-first devices.
- The first press initializes audio and begins the deterministic run.
- Show score, combo, remaining bricks, pause/sound controls, and the board creator without shrinking the playfield.
- On loss, show score, best score for this board, and **Play again**.
- On clear, show score, best score, clear time, and **Play again**.
- A replay resets every gameplay variable and preserves only the per-board best score and preferences.

### Expanded Create view

- Start with a blank 18 × 16 grid.
- Rows 0–1 and columns 0 and 17 are permanently empty safe margins. The drawable art region is therefore 16 columns × 14 rows.
- Provide twelve visible color swatches, including white, with a clearly indicated selection.
- Tap/click an empty cell to paint it with the selected color.
- Tap/click a cell already painted with the selected color to erase it.
- Painting a cell with a different selected color recolors it.
- Support pointer dragging for quick drawing, Undo, Redo, Clear, and Preview.
- Disable publishing for an empty board.
- Before publishing, show an accurate playable preview and run canonical duplicate detection.
- A successful prototype post is stored only on the device. The Reddit build submits a custom post on behalf of the user after explicit confirmation.

### Duplicate response

When an identical board already exists, reject publishing and display:

> This board is identical to one that already exists. [Play it here.]

The link targets the canonical existing Reddit post. A duplicate is based on exact cell colors and positions, not visual similarity, rotation, reflection, title, or creator.

## Board specification

### Canonical representation

- `formatVersion`: board serialization version.
- `rulesetVersion`: physics/scoring/power-up rules used by the post.
- `columns`: always 18 for version 1.
- `rows`: always 16 for version 1.
- `cells`: row-major array of 288 values; `0` is empty and `1..12` are palette indices.
- `boardHash`: SHA-256 of a canonical byte/string encoding containing the format version, dimensions, and cells.
- Reddit record: post ID, author ID/name, creation timestamp, board hash, ruleset version, and optional derived statistics.

Validate on both client and server:

- exactly 18 × 16 cells;
- top two rows empty;
- first and last columns empty;
- palette values limited to `0..12`;
- at least one brick;
- payload size and schema version accepted;
- hash recomputed server-side rather than trusted from the client.

Use a unique server-side index/claim for `(formatVersion, boardHash)` so two simultaneous submissions cannot both publish. Reserve the hash, submit the Reddit post, then attach its post ID; release or reconcile abandoned reservations after a failed submission.

### Version 1 palette

Use a fixed, high-contrast retro palette with stable numeric IDs. The prototype palette is:

1. red
2. orange
3. yellow
4. lime
5. green
6. cyan
7. blue
8. violet
9. magenta
10. pink
11. gray
12. white

The exact hex values can be tuned before the schema is frozen, but IDs and values must never change for already-published boards. Empty cells use the dark playfield and are not a thirteenth color.

### Seed board

- The seed uses every drawable cell: columns 1–16 and rows 2–15.
- Its art dimensions are 16 wide × 14 high inside the 18 × 16 board envelope.
- Rows cycle through the twelve-color palette to form horizontal rainbow stripes.
- An idempotent `onAppInstall` routine creates it once per subreddit and stores the resulting post ID.
- `onAppUpgrade` must not recreate it.

## Deterministic gameplay

### Run seed

Derive a run seed from `rulesetVersion + boardHash`. Do not use the current time or `Math.random()` for anything that affects the result. The seed controls:

- which bricks contain power-ups;
- power-up types;
- initial horizontal ball direction, if it is not fixed by the ruleset;
- any future deterministic gameplay variation.

Cosmetic particles, pitch variation, and screen shake may use nondeterministic randomness because they cannot affect score or physics.

### Power-up plan

- Generate and store an immutable power-up assignment when the level loads.
- A power-up is bound to a cell index, so it drops whenever that brick is destroyed, independent of destruction order.
- Use a seeded PRNG with a documented algorithm; changing it requires a new ruleset version.
- Guarantee reasonable distribution for eligible boards rather than relying only on independent probability. Version 1 should target approximately one power-up per 24 bricks, guarantee at least one on sufficiently large boards, avoid stacking all placements in one region, and cap the total.
- The initial two types are **Laser** (temporary paired shots) and **Safety Line** (one saved miss).
- Power-ups should never be visible in the board preview.
- Every player receives the same placements and types for the same post and ruleset.

The exact rate, guarantees, and Laser duration are tuning parameters to validate through playtests before freezing ruleset version 1.

### Physics and simulation

- Use a logical 400-pixel-wide playfield and scale it uniformly for display.
- Use a fixed simulation step (target 120 Hz) with an accumulator and a maximum catch-up window. Rendering stays on `requestAnimationFrame`.
- Express velocity in logical pixels per second, never pixels per rendered frame.
- Convert pointer coordinates through the actual canvas/SVG transform; pointer position and paddle center must agree at every scale and aspect ratio.
- Use Pointer Events for mouse, pen, and touch, plus keyboard controls for accessibility and desktop testing.
- Only bounce from the paddle while the ball is moving downward.
- Normalize the initial direction so its vector magnitude equals the configured initial speed.
- When a speed threshold is crossed, immediately rescale the active velocity vector.
- Resolve at most one brick contact per collision sub-step, or use swept collision detection with deterministic tie-breaking.
- Separate collision/state logic from rendering so it can be unit tested without a browser.
- Pause simulation on visibility loss. Decide before launch whether elapsed clear time pauses as well; the recommended rule is that it does.

### Scoring

Provisional version 1 model:

- A combo is the number of bricks destroyed since the most recent paddle contact.
- Each destroyed brick, including one destroyed by a Laser, advances the combo.
- Paddle contact banks the run but resets the combo to zero.
- Safety Line contact does not reset the combo because the paddle was not touched.
- Brick points use `round(100 × 1.15^comboBeforeHit)`.
- Display the current combo and the points awarded for high-value hits.
- Do not cap combo growth in the first tuning prototype; use safe integer handling and compact score formatting in the UI.
- Wall, paddle, power-up, and clear events do not directly grant points.
- Best score is per `boardHash + rulesetVersion`, and it updates after both wins and losses.

This intentionally permits very large scores. Before freezing the ruleset, simulate full-board upper bounds, confirm storage/leaderboard numeric limits, and playtest whether Laser bricks should share the same combo multiplier.

### Run integrity and leaderboards

Local best scores are sufficient for the prototype. A public Reddit leaderboard needs server verification before scores are treated as competitive. Options, in increasing strength:

1. client-submitted final score with sanity checks;
2. compact event transcript replayed by the server;
3. deterministic input log replayed by the server.

Plan for option 2: upload brick-hit order, paddle contacts, power-up pickups, and timing summary; recompute score and reject impossible sequences. Do not promise cheat-proof scores, but make casual tampering inconvenient.

## Visual, motion, and audio direction

### Visual system

- Dark charcoal background, off-white interface text, and saturated brick colors.
- Pixel-aligned rectangles, one-pixel highlights/shadows, square or lightly clipped corners, and minimal borders.
- Monospace/pixel display face with a system monospace fallback; keep body labels readable at mobile sizes.
- Use CSS/Canvas effects rather than representational image assets for the playfield.
- Keep controls visually quiet until needed so the artwork dominates.

### Motion and feedback

- Brick hit: one-frame flash, tiny scale/pop, 4–8 pixel particles, and floating points on valuable hits.
- Combo milestones: progressively stronger color pulse, short label, and richer sound every 5 or 10 bricks.
- Paddle hit: subtle squash/stretch and a brief contact spark.
- Power-up reveal/pickup: recognizable fall animation, color trail, and labeled pickup toast.
- Laser: muzzle flash and a short bright trail.
- Safety Line: scan-in animation, low shimmer, and satisfying shatter on use.
- Win: compact cascade across remaining effects followed by a score count-up.
- Loss: brief desaturation/low shake, never a long blocking animation.
- Respect `prefers-reduced-motion`; keep gameplay state identical when effects are reduced.

### Chiptune audio

- Generate audio with Web Audio oscillators and noise so the style is cohesive and assets remain small.
- Initialize/resume audio only after a user gesture.
- Add distinct cues for launch, wall, paddle position, brick color/pitch, combo milestone, power-up drop, pickup, Laser, Safety Line, loss, clear, editor paint/erase, and successful post.
- Use short gain envelopes to avoid clicks, cap simultaneous voices, and provide a persistent mute control.
- Cosmetic pitch variation must not feed back into gameplay state.

## Target dimensions and responsive behavior

- Authoritative logical game width: **400 px**.
- Prototype logical game height: **700 px**, with a 400 × 700 Canvas and HUD overlaid within that surface.
- At 393 CSS pixels (iPhone 16-class width), scale uniformly to fit width; do not crop or independently stretch axes.
- Keep the 18-column brick grid 360 logical pixels wide with 20-pixel cells and 20-pixel outer margins.
- The 16-row board occupies 320 logical pixels. Place it high enough to preserve two empty top rows and leave a readable lower play area.
- Anchor the board at the same logical `(x, y)` coordinates in the inline preview, expanded ready state, and active game so entering Play never makes the artwork jump.
- Desktop may display the surface at 400 logical/CSS pixels or an integer-friendly larger scale, but physics and visible world bounds remain identical.
- Use `100dvh` with safe-area insets for the expanded shell, but treat Reddit's simulator and real iOS/Android devices as the source of truth before finalizing 700 px.
- Inline post height is separately configured using Reddit custom post styles (`REGULAR` or `TALL`) and should show the complete art preview plus the two actions without pretending to be the playable surface.

Device validation matrix:

- iPhone 16-class Reddit app expanded view;
- one smaller iPhone viewport;
- one current Android viewport;
- desktop Reddit expanded modal at narrow and wide windows;
- 60, 90, 120, and 144 Hz displays/simulations;
- touch, mouse, and keyboard input;
- reduced-motion and muted-audio preferences.

## Reddit implementation architecture

Use current **Devvit Web**, not legacy Blocks. Reddit's current model supports normal web stacks, client/server endpoints, Redis, and standard libraries including React and Phaser. Define HTML entry points for inline and expanded experiences in `devvit.json`; legacy splash parameters and Blocks UI are being removed/deprecated.

Recommended production stack:

- TypeScript + React for inline post, HUD, editor, dialogs, and accessibility.
- A focused custom Canvas 2D game engine for deterministic physics and effects.
- Hono server endpoints in the Devvit server environment.
- Redis for board hashes, post mappings, installation state, and leaderboard records.
- Shared TypeScript package for board schema, hashing input, ruleset constants, PRNG, and scoring.

Why not Phaser initially: Art Breaker's core simulation is small, deterministic, and highly specialized. A custom Canvas loop keeps the bundle smaller and makes collision/scoring replay easier to own and test. Reconsider Phaser if scene management, animation tooling, asset pipelines, or multiple game modes grow enough to offset the runtime and integration cost.

Planned entry points:

- `inline`: board preview with Play and Create.
- `play`: expanded frozen game surface for the post's board.
- `create`: expanded blank editor.

Planned server responsibilities:

- install trigger creates the idempotent seed post;
- board lookup by Reddit post ID;
- schema validation and canonical SHA-256 hashing;
- atomic duplicate reservation and lookup;
- `submitCustomPost()` using `runAs: 'USER'` and required `userGeneratedContent` metadata;
- author and post mapping persistence;
- score validation and leaderboard writes;
- deletion/reconciliation handling for removed Reddit posts;
- basic rate limiting and abuse controls.

Important platform constraints:

- Expanded mode must be initiated by the user.
- Publishing on behalf of the user requires the `SUBMIT_POST` user-action permission, explicit user intent, UGC metadata, and Reddit app review. During unapproved playtesting, attribution behavior differs.
- The twelve-color grid is constrained UGC, which is safer than free-form content, but the app still requires moderation, deletion, and intellectual-property consideration.
- Characters such as Pikachu or Mickey Mouse are examples of what users might draw, not bundled/promoted app artwork. Do not ship trademarked seed art or imply endorsement.
- Add text fallbacks and accessible labels for custom posts.

Current Reddit references:

- [Devvit Web overview](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview)
- [View modes and entry points](https://developers.reddit.com/docs/0.13/capabilities/server/launch_screen_and_entry_points/view_modes_entry_points)
- [Creating a custom post](https://developers.reddit.com/docs/capabilities/creating_custom_post)
- [User Actions](https://developers.reddit.com/docs/capabilities/server/userActions)
- [Devvit Web configuration](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_configuration)
- [Reddit developer guidelines](https://developers.reddit.com/docs/guidelines)

Recheck these docs and the current simulator immediately before production implementation because Devvit APIs and review requirements change.

## Prototype scope

The local `prototype/` is intentionally framework-free and has no Reddit API calls. It should demonstrate:

- a 400-pixel inline-style seed post preview;
- Play and Create routes/views;
- a frozen game ready state;
- fixed-step Canvas gameplay with correct coordinate scaling;
- combo scoring, deterministic power-ups, Laser, and Safety Line;
- per-board local high scores;
- chiptune effects, particles, shake, and reduced-motion behavior;
- a 12-color 18 × 16 editor with protected margins;
- click/tap toggle, drag painting, undo, redo, clear, and preview;
- local duplicate detection with the required linked message;
- local-only simulated publishing and reopening of the created board.

The prototype is a feel/sizing tool, not production architecture. Its serialization and rules should inform the shared TypeScript model, but production code should not blindly copy browser-storage or single-file assumptions.

## Prototype defects to eliminate

All issues found in the original `index.html` prototype are required regression cases:

- Convert pointer coordinates through the rendered playfield transform instead of assuming 400 CSS pixels.
- Make ball, bullet, and power-up movement independent of display refresh rate.
- Clean projectiles and effects safely before board rebuild; replay must never remove an already-detached node.
- Normalize initial velocity so the configured speed is the actual vector magnitude.
- Apply speed increases to the active ball immediately.
- Resolve brick contacts deterministically and prevent one sampled position from removing multiple adjacent bricks accidentally.
- Remove the undeclared `hitBrick` global and use strict/module-safe code.
- Never splice forward through arrays during iteration; use filtering or reverse traversal.
- Complete win state before any final-brick power-up creation and play the same win sequence whether the ball or Laser destroys the last brick.
- Update per-board high score after wins and losses.
- Add semantic buttons, keyboard controls, visible focus, zoom support, and reduced-motion support.
- Replace fixed header sizing and incorrect viewport subtraction with a safe-area-aware responsive shell.
- Remove dead/incorrect Safety Line positioning state and define its one-hit behavior explicitly.
- Guard audio creation/resume failures and use gain envelopes.

## Testing strategy

### Unit tests

- canonical serialization and hash stability;
- margin/palette/schema rejection;
- seeded PRNG and power-up plan snapshots;
- scoring progression and numeric upper bounds;
- initial velocity magnitude and speed thresholds;
- paddle angle mapping;
- wall, paddle, brick-corner, adjacent-brick, Laser, and Safety Line collisions;
- identical outcomes at different render frame rates;
- win by ball and win by Laser;
- replay with active bullets/power-ups;
- duplicate reservation races.

### Integration tests

- inline Play/Create entry point routing;
- publish success, duplicate, conflict, and server failure states;
- post attribution and UGC metadata;
- seed post idempotency on install/upgrade;
- post deletion and stale duplicate mappings;
- local and server best-score updates;
- offline/retry behavior where Reddit permits it.

### Manual feel tests

- paddle precision at center and both edges;
- launch readability without instructions;
- combo legibility during heavy effects;
- editor drawing without accidental page scrolling;
- color distinction in common color-vision deficiencies;
- sound fatigue over repeated runs;
- small and sparse board playability;
- full 224-brick seed board duration and performance.

## Delivery phases

### Phase 0 — Local interaction prototype

- Build and iterate on the `prototype/` Play/Create surfaces.
- Confirm 400 × 700 logical dimensions in representative mobile frames.
- Tune ball/paddle sizes, base speed, combo growth, and power-up density.
- Freeze the version 1 palette only after visual testing.

Exit criteria: creating a board and repeatedly playing it feels coherent on touch and desktop, with no refresh-rate or scaling regressions.

### Phase 1 — Shared deterministic core

- Create TypeScript board/rules packages.
- Implement hashing, seeded PRNG, fixed-step simulation, scoring, and serialization tests.
- Add replay/event transcript support before UI integration.

Exit criteria: deterministic test snapshots match across runs and simulated render rates.

### Phase 2 — Devvit Web shell

- Scaffold the current React Devvit Web template.
- Configure inline, play, and create HTML entry points.
- Port the prototype visual system and Canvas renderer.
- Validate expanded mode in Reddit's simulator and on real mobile clients.

Exit criteria: a hard-coded board can be opened from inline view, played, and edited in the test subreddit.

### Phase 3 — Community publishing

- Add Redis schema, board validation, atomic duplicate detection, user-action permission, and custom-post submission.
- Add install-time seed post and stale-record reconciliation.
- Add publish confirmation, error recovery, attribution, fallback text, and deletion behavior.

Exit criteria: two simultaneous identical submissions yield exactly one post, and unique boards are correctly attributed after approved user actions are available.

### Phase 4 — Scores, polish, and review readiness

- Add validated per-level leaderboards and personal bests.
- Complete sound/effect suite, reduced-motion mode, performance budgets, analytics, privacy disclosures, moderation documentation, and app review materials.
- Test old posts against ruleset versioning and app upgrades.

Exit criteria: device matrix passes, score validation rejects obvious tampering, policy requirements are documented, and existing posts survive upgrades.

## Decisions still to tune together

- Final logical height after testing inside the iPhone 16 Reddit expanded view.
- Whether initial horizontal direction is fixed or seeded.
- Exact ball speed curve, paddle influence, and number of lives (current recommendation: one ball/run).
- Combo growth factor and whether Laser hits receive full combo value.
- Power-up frequency, guarantees, duration, and future types.
- Whether empty/sparse boards need a minimum brick count for publishing.
- Public leaderboard scope: all time, daily/weekly, friends, or subreddit only.
- Post title format and whether the creator can name a level without introducing free-form moderation burden.
- How creators remove or supersede their boards while preserving Reddit deletion expectations.
