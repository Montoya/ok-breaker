# Art Breaker product and implementation plan

## Product vision

Art Breaker is a community-authored brick breaker game for Reddit. Every custom post is both a piece of pixel art and a replayable level. Anyone can draw a board from a constrained palette, publish it as a Reddit post attributed to them, and challenge the community to find the highest-scoring way to clear it.

The game should feel immediate and legible like an early arcade game, but not unfinished: crisp motion, expressive brick destruction, layered chiptune sound, satisfying combo feedback, and small moments of celebration should give it personality without compromising the clean retro presentation.

The long-term loop is:

1. Install the app in a subreddit and create the canonical rainbow seed-board post.
2. See any Art Breaker board in the Reddit feed and choose **Play** or **Create**.
3. Play the board repeatedly, improve a personal best, inspect leaderboard position and percentile, and optionally share the result as a comment on that board's post.
4. Open Create from any board or the app's front screen, draw and preview a board, save it as a draft, or optionally name and publish it.
5. Publish user-created boards immediately; let moderators either publish immediately or add their boards to the subreddit's daily publishing queue.
6. Discover each published board as its own Reddit post, with creator attribution and a stickied instructional comment that anchors score-sharing discussion.

After installation, the app creates exactly one seed post. It is a completely filled 16 × 14 playable area rendered as repeating seven-color rainbow stripes: red, orange, yellow, green, cyan, blue, and purple. From that point forward, every additional board must be created through the Create interface; there is no automatically generated catalog.

## Product principles

- **Art is the level.** The post preview should foreground the board rather than surrounding it with application chrome.
- **One tap to understand.** Play and Create are the only primary actions on a board post.
- **Same board, same challenge.** Layout, power-up placement, initial conditions, and scoring rules must be deterministic for a given ruleset version.
- **Replay rewards mastery.** Exponentially compounding combo scoring creates meaningful routing and paddle-placement decisions.
- **Retro, not crude.** Use a limited palette, pixel-aligned geometry, monospace/pixel typography, synthesized chiptune audio, and restrained glow/animation.
- **Mobile first.** The authoritative interaction target is Reddit's expanded mobile view; desktop should preserve the same logical playfield rather than changing the game.
- **Fast and small.** Feed previews must load quickly, and the expanded experience should avoid unnecessary runtime weight.
- **Version the rules.** Old posts must remain playable and comparable after physics or scoring changes.

## Game journey and publishing lifecycle

### Installation and canonical seed post

1. A moderator installs Art Breaker in a subreddit.
2. An idempotent install flow creates the canonical rainbow-board post exactly once for that subreddit.
3. The app creates and stickies this instructional comment on the seed post:

   > Play Art Breakers! When you finish, press comment to share your score in this thread. Then create your own board!

4. The seed board uses the established 18 × 16 legacy envelope and 16 × 14 filled art area. Its 14 filled rows repeat this seven-color sequence exactly twice: red, orange, yellow, green, cyan, blue, and purple.
5. Because colors participate in canonical hashing, the seven-color prototype board uses its recomputed hash and gameplay seed, `ab56a7ef`. Its power-up plan and initial direction therefore follow the new color layout.
6. No additional boards are generated automatically. Every later board originates in Create as a user or moderator-authored board.

The installation routine must be retry-safe across duplicate install events, deploys, and partial failures. Persist both the seed post ID and stickied comment ID, and reconcile a missing comment without creating a duplicate post. Only the first-install trigger may create the seed post; upgrade reconciliation may repair a known seed record but must never submit a new Rainbow No. 1 post when legacy metadata is absent.

### Creator attribution

Every board preview uses the byline **Created by u/[username]**. Attribution identifies the board's creator, which may differ from the account or app actor that technically publishes the Reddit post:

- the canonical rainbow board and any other app-authored board use the app's bot account for that subreddit;
- a board created by a moderator uses that moderator's authenticated Reddit username, whether they choose Publish now or Add to queue;
- a board created by an ordinary user uses that user's authenticated Reddit username;
- queued publication must preserve the original moderator creator instead of replacing attribution with the bot account that executes the scheduled post.

Resolve creator identity from trusted Reddit context and persist immutable creator ID plus the display username used for presentation. Never accept creator identity from client input. Keep `creatorUserId`, `creatorUsername`, `publisherActor`, and Reddit post author distinct in the data model and audit trail.

### Journey from any board post

Every published board is one unique Reddit post. From every board post, a player can always:

- choose **Play** to open that post's board in expanded mode;
- choose **Create** to open a fresh board in the Create interface;
- replay the board without a limit;
- inspect the board leaderboard and their own standing;
- submit a score-sharing comment after a completed run.

Create must also be available from the app's front screen, so authoring never depends on first opening a particular board post.

### Play, results, leaderboard, and score comment

1. Play opens in expanded mode on both mobile and desktop. Mobile dimensions remain authoritative; desktop keeps the same logical game surface and uses the additional width as side space rather than stretching the game.
2. The player may retry the board as many times as desired. Each account contributes its best verified score to that board's leaderboard.
3. After a run ends, present a Syllo-inspired sequence of post-game screens. Screen 1 is the result and subreddit-join screen:
   1. Start with the numerical score value, **[points]**.
   2. Directly below it, show **Best score: [best points]**.
   3. Then show **Better than [x]% of players**.
   4. Then show **Current rank: #[num]**. Rank and percentile remain available even when the player is outside the visible top 100.
   5. Show **Join r/[sub]**, where `[sub]` is the trusted current installation subreddit name.
   6. Show the supporting copy: **Join the subreddit so you do not miss future boards and game updates.**
   7. End the screen with **Join r/[sub]** and **Skip** buttons. Join attempts the explicit subreddit-subscription action and then advances; Skip advances without subscribing. If the viewer is already subscribed, omit the join prompt and advance directly to the next applicable post-game screen.
   8. Subreddit joining is unavailable until the Reddit app is approved. Keep the Join control active in development so the complete sequence can be demonstrated. Implement it through an authenticated server mutation that calls Reddit's supported `reddit.subscribeToCurrentSubreddit()` API, with the manifest's `SUBSCRIBE_TO_SUBREDDIT` user-action permission. If Reddit rejects or does not support the action before approval, treat that attempt as a non-blocking no-op: do not record the viewer as subscribed, log the failure for diagnosis, and continue immediately to the next post-game screen without showing a blocking error. The same code path must begin working after approval without a feature rewrite.
4. Screen 2 is the comment screen:
   1. Repeat the complete result block from Screen 1: **[points]**, **Best score: [best points]**, **Better than [x]% of players**, and **Current rank: #[num]**.
   2. Show the heading **Leave a comment**.
   3. Show an optional textarea with the exact placeholder **Flex your skills here...**.
   4. Beneath the textarea, show **Automatically added:** followed by the non-editable score line **[points] points in [time]**.
   5. End the screen with **Submit comment** and **Skip** buttons.
   6. **Submit comment** posts the optional user-entered text together with the automatically added score line as a comment on the current board's Reddit post, then advances. **Skip** advances without creating a Reddit comment. Never submit automatically when the run ends.
5. Screen 3 is the link-sharing screen:
   1. Repeat the complete result block from Screen 1: **[points]**, **Best score: [best points]**, **Better than [x]% of players**, and **Current rank: #[num]**.
   2. Show the heading **Share with a friend**.
   3. Show the supporting copy on two lines: **Send them a link to this puzzle.** and **They don't need Reddit to play.**
   4. End the screen with **Send Link** and **Skip** buttons.
   5. **Send Link** opens the supported native share sheet with the current board post's canonical public link. **Skip** advances without opening the share sheet.
6. Across Screens 1–3, the main action button—**Join r/[sub]**, **Submit comment**, or **Send Link**—uses the lime primary treatment. Every **Skip** button uses the medium-gray secondary treatment.
7. Vertically center the complete content stack on each intermediate post-game screen—result summary plus Join, comment, or share prompt—within the available expanded space.
8. All post-game screens must remain contained within the expanded viewport on mobile and desktop. Adapt vertical spacing, typography, input height, and leaderboard height to the available space; use contained scrolling only as a fallback when the viewport is exceptionally short.
9. Show the complete outer frame around the Join, comment, share, and leaderboard screens whenever the viewport is wider than the 400px framed container. At 400px and below, where the container spans the viewport, remove the outer frame entirely; keep internal component borders.
10. After a completed run, show the centered shared animated brick loader while the score is submitted and result ranking is resolved. Use the same centered loader while changing leaderboard pages.
11. Remaining screens contain, in order:
   1. The leaderboard, containing the top 100 players with 10 entries per page and pagination for up to 10 pages.
   2. **Play again** and **Create** buttons.
12. On the leaderboard, render Previous and Next as compact lime underlined link-style controls with no boxed button treatment.

### More boards discovery

- The results screen includes a **More** button that opens a dedicated **Play more boards** screen inside `game.html`.
- The Play more boards screen has a clear Back button. Back returns to the same results screen and preserves its score, leaderboard page, and other post-game state.
- Show the complete outer frame around the Play more boards screen whenever the viewport is wider than the 400px edge-to-edge breakpoint. At 400px and below, where the main container spans the viewport, remove that outer frame entirely. Each board card keeps a border around its artwork only; the title and creator credit below have no enclosing border or horizontal inset.
- Keep board-card metadata backgrounds transparent. Vertically center the board grid in the space between the screen header and pagination, and pin the pagination row to the bottom of the main container.
- Fetch published Art Breaker boards from the current subreddit, newest first, excluding the board currently being viewed. Never expose drafts, queued boards, failed publications, removed posts, or moderator-only data through this public browse query.
- Cap Play more boards at 25 pages: up to 100 boards at the four-card mobile page size or 150 boards at the six-card desktop page size. Treat the canonical Rainbow No. 1 install-time board as a discoverable special case: reconcile its legacy publication metadata and index during upgrades and exclude it while already playing Rainbow No. 1. When fewer than 100 non-seed boards are available on mobile or fewer than 150 are available on desktop, append Rainbow No. 1 as the final board; omit it when the corresponding 25-page catalog is already full.
- Render each result as a compact board card with its actual saved cell colors and positions, plus its title and creator attribution. The artwork remains recognizable without reproducing a full gameplay canvas.
- Show four board cards per batch on mobile and up to six per batch when the expanded desktop width permits it. Provide compact lime underlined Previous and Next link-style controls when additional published boards exist.
- Selecting a board uses Devvit's supported client navigation to open that board's canonical Reddit post permalink. Do not open an internal copy detached from its post, comments, creator attribution, or leaderboard.
- Include empty, loading, retryable-error, and end-of-results states. The seed board may appear when browsing from another board, but the current board must never appear in its own More boards results.

The final post-game flow is refined screen by screen using the supplied Syllo Reddit-game references. Preserve the requirements recorded for each accepted screen while adapting Art Breaker's copy and visual system rather than copying Syllo's branding.

Percentile should be computed against unique players' best verified scores for that board. The provisional definition is the percentage of ranked players with a strictly lower score; specify rounding and score/time tie-breaking before freezing the leaderboard rules.

### User board creation and immediate publishing

1. Creating and viewing **My Boards** require an authenticated Reddit account. If a signed-out viewer taps Create on the inline splash, keep them in the splash and show a **Sign in to create** modal with the body **Sign in to Reddit to make your own Art Breaker board.**, **Cancel**, and a blue **Sign in** action. Sign in invokes Reddit's native sign-in flow; do not open expanded mode first.
2. A signed-in user opens Create from the app's front screen or any board post.
3. They draw on the fully editable 20 × 18 grid and can save without publishing.
4. They can choose **Preview** between Save and Publish to inspect the board and play a full test run without saving or publishing it.
5. Preview preserves the complete in-progress editor state. Leaving the test run, losing, or clearing the board returns directly to editing without submitting a score or showing any post-game result, join, comment, share, or leaderboard screen.
6. From the editor they can keep the board as a draft or deliberately choose **Publish**.
7. The publishing step offers an optional board-name field. If supplied, the Reddit post title is **[Board name] by u/[username]**. If left blank, the Reddit post title is exactly **Custom Art Breaker**; creator attribution still appears in the stickied comment and stored board metadata.
8. Publishing runs validation and duplicate detection, then immediately creates the unique Reddit post.
9. The app creates and stickies this comment on the new post:

   > This board was created by u/[username]. When you finish playing, use Submit comment inside the game to share your score in this thread.

10. The published board appears in the creator's board list with a link to its Reddit post.

Board titles and optional score-comment text are free-form user-generated content and must follow Reddit moderation, validation, length, and escaping requirements. Publishing and comment submission require explicit user actions and clear error recovery.

### Drafts and My Boards

The Create interface includes access to **My Boards**, scoped to the signed-in account:

- drafts show their title or placeholder title, last-edited time, preview, and an action to resume editing;
- published boards show their title, publish state, and a link to the Reddit post;
- queued moderator boards show queue position and scheduled publication date/time;
- saving a draft never creates a Reddit post;
- publishing a draft updates that same board record rather than creating an unrelated duplicate draft.
- while My Boards is loading, center the shared animated brick loader in the available screen space.
- Show four boards per My Boards page. Size thumbnails and vertical spacing against the available viewport height so all four rows and pagination fit in both mobile and desktop expanded views; use slightly roomier row padding on mobile and tighter inter-row gaps on desktop. Previous and Next use the same compact blue underlined link treatment as leaderboard and Play more boards pagination, sit against the left and right edges respectively, and keep the page count centered.

Draft persistence should be server-backed so boards follow the user across devices. A local fallback may be used during prototype development, but it is not the production source of truth.

### Moderator creation, publishing queue, and recent puzzles

Moderators use the same Create interface as ordinary users. On desktop, authenticated subreddit moderators see one additional **Recent puzzles** button inside Create. It opens the moderator-only recent-publications and queue view within the same expanded application; there is no separate player-facing Admin entry point.

When a moderator finishes a board, the publishing step offers two explicit actions:

- **Publish now** creates the post and stickied comment immediately;
- **Add to queue** places the board in the subreddit-scoped daily queue without creating a post yet.

The queue must:

- publish one eligible queued moderator board each day at **1:00 p.m. America/New_York**, observing Eastern daylight-saving changes;
- use FIFO order by default, while leaving room for an explicit moderator reorder capability;
- make scheduled publication idempotent so retries cannot create duplicate posts or duplicate stickied comments;
- record queued, publishing, published, and failed states with retry/error details;
- run the same validation, duplicate detection, post-title format, attribution, and stickied-comment creation used for user boards.

The Recent puzzles view shows the centered shared animated brick loader while its data is loading, then:

- recently published user boards, with creator, title, post link, and publication time;
- the moderator board queue, including order, scheduled time, creator, status, post link when published, and failures requiring attention.

Moderator capabilities are a strict server-side authorization boundary. Every moderator query and mutation must independently verify that the authenticated account is currently a moderator of the installation's subreddit. Ordinary users must never be able to read recent-publication administration data, inspect or change the queue, publish queued boards, or invoke the moderator-only Publish now path through direct API calls. UI visibility is only a convenience and is never the access-control mechanism; ordinary users retain only their separate immediate user-publishing flow.

The core Play and Create experiences use expanded mode on mobile and desktop. The extra Recent puzzles capability is intentionally desktop-oriented and is not required to fit the mobile game surface.

### Reference-game boundary

Use the checked-in [`reference/pop-answers`](reference/pop-answers) Reddit game as an implementation reference, especially for:

- [`devvit.json`](reference/pop-answers/devvit.json) and its inline/expanded entry-point mapping; adapt its lightweight inline pattern to `preview.html` and its expanded pattern to the unified `game.html`;
- [`src/client/game.html`](reference/pop-answers/src/client/game.html), [`src/client/game.tsx`](reference/pop-answers/src/client/game.tsx), and [`src/client/App.tsx`](reference/pop-answers/src/client/App.tsx) for mounting the expanded React application, intended-view handoff, results, optional comment input, Comment states, leaderboard pagination, and moderator-only UI affordances;
- [`src/server/trpc.ts`](reference/pop-answers/src/server/trpc.ts) for authenticated procedures, per-procedure moderator checks, and idempotent result-comment submission;
- [`src/server/core/game.ts`](reference/pop-answers/src/server/core/game.ts) for authenticated identity, moderator-permission lookup, rankings, and current-player rank outside the visible leaderboard;
- [`src/server/core/publication.ts`](reference/pop-answers/src/server/core/publication.ts) and [`src/server/routes/scheduler.ts`](reference/pop-answers/src/server/routes/scheduler.ts) for timezone-aware daily publication, locks, retry-safe manual publication, Reddit post creation, and distinguished/stickied comments;
- [`src/server/core/store.ts`](reference/pop-answers/src/server/core/store.ts) for Redis queue ordering and lifecycle persistence;
- its publication, comment, ranking, authorization, and concurrency tests as patterns for Art Breaker's regression suite.

Reuse proven integration patterns rather than copying game-specific behavior. Art Breaker differs in two important ways: both mobile and desktop always use expanded mode for Play/Create, and Art Breaker has **no score-distribution graph**.

## Experience architecture

### Inline Reddit post

Each level post shows:

- the full board preview;
- the board title and **Created by u/[username]** byline using trusted stored creator attribution;
- a primary **Play** button;
- a secondary **Create** button;
- optionally, compact level statistics such as clears, plays, or the top score once those features exist.

The lower board-information and Play/Create action area has no enclosing border. On desktop, its text and buttons align flush with the left and right edges of the bordered artwork above. On mobile, retain the same horizontal inset used by the top branding area so the lower content does not touch the post edges.

The Reddit post view is implemented by `preview.html`. It stays lightweight, must not capture scrolling gestures, and vertically centers the visible brick artwork within its preview frame based on the artwork's occupied row bounds. Preview centering is presentation-only and does not change canonical cell positions or in-game coordinates.

Play opens user-initiated expanded mode in `game.html`. Create does the same for signed-in viewers; for signed-out viewers it first shows the inline native-sign-in gate described above without opening expanded mode. `game.html` owns gameplay, results, creation, publishing, My Boards, and moderator-only recent-puzzle/queue views. Create is also available from the app front screen. Every published board post has its own app-created stickied comment for creator attribution, play instructions, and score-sharing replies.

### Expanded Play view

- Treat the current Play interface and behavior in [`prototype/index.html`](prototype/index.html), [`prototype/styles.css`](prototype/styles.css), and the `ArtBreakerGame` implementation in [`prototype/app.js`](prototype/app.js) as the concrete reference for the production port.
- Render the selected board, paddle, and ball immediately in a frozen ready state.
- Show **Press to play** on touch-first devices and **Click to play** on mouse-first devices.
- The first press initializes audio and begins the deterministic run.
- On touch devices, touching the playfield immediately targets the paddle at that horizontal position; holding and dragging continuously tracks the finger. Disable native pan/zoom gestures inside the playfield while preserving normal page gestures outside it.
- Show score, combo, remaining bricks, pause/sound controls, and the board creator without shrinking the playfield.
- On loss, show score, best score for this board, and **Play again**.
- On clear, show score, best score, clear time, and **Play again**.
- On every completed run, enter the specified Syllo-inspired post-game screen sequence, beginning with the result and subreddit-join screen.
- A replay resets every gameplay variable and preserves only the per-board best score and preferences.
- Leaving the Play view must immediately stop the simulation and clear the run state, including balls, bricks, projectiles, falling pickups, particles, active effects, timers, score, and combo. Returning to Play always creates a fresh ready state; no delayed loss or game-over audio may occur after leaving.

### Expanded Create view

- Treat the current Create interface and behavior in [`prototype/index.html`](prototype/index.html), [`prototype/styles.css`](prototype/styles.css), and the editor functions in [`prototype/app.js`](prototype/app.js) as the concrete reference for the production port.
- Start with a blank, fully drawable 20 × 18 grid.
- Every cell is editable, including the top two rows and the leftmost and rightmost columns. There are no protected margins for user-created boards.
- Provide fourteen visible color swatches, including white, with a clearly indicated selection.
- Tap/click an empty cell to paint it with the selected color.
- Tap/click a cell already painted with the selected color to erase it.
- Painting a cell with a different selected color recolors it.
- Support pointer dragging for quick drawing, Undo, Redo, Clear, and Preview.
- Use a continuous crosshair cursor across the complete editor drawing surface, including its cell gaps, and across the complete gameplay surface on pointer-driven devices.
- A long press/long click flood-fills the held cell's contiguous four-direction region. If that region already uses the selected color, the same gesture clears it instead. Treat the complete fill or clear as one undoable action.
- Disable publishing for an empty board.
- Before publishing, show an accurate playable preview and run canonical duplicate detection.
- Ask for an optional board name during publishing and expose My Boards for drafts, queued moderator boards, and published-board links.
- A successful prototype post is stored only on the device. The Reddit build submits a custom post on behalf of the user after explicit confirmation.
- In production, a normal user's Publish action creates the post immediately. A moderator sees both **Publish now** and **Add to queue**, plus the desktop-only **Recent puzzles** button in Create.

### Duplicate response

When an identical board already exists, reject publishing and display:

> This board is identical to one that already exists. [Play it here.]

The link targets the canonical existing Reddit post. A duplicate is based on exact cell colors and positions, not visual similarity, rotation, reflection, title, or creator.

### Core lifecycle records

Plan persistent records around the board rather than treating the Reddit post as the only source of state:

- board: internal ID, format/ruleset versions, dimensions, cells, hashes/seeds, title, immutable authenticated creator ID/username, creator role at creation, lifecycle status, created/updated timestamps, and duplicate-claim state;
- draft: owner, board ID, last-edited time, revision, and preview metadata, with no Reddit post ID until publication;
- queue item: board ID, subreddit, FIFO position, scheduled publication time, attempt count, last error, and queued/publishing/published/failed state;
- publication: board ID, subreddit, Reddit post ID, stickied comment ID, preserved board-creator attribution, publishing actor/app identity, Reddit post author, and publication time;
- score: board/ruleset, authenticated player, verified score, elapsed time, completion state, achieved time, and validation evidence;
- leaderboard projection: each player's best score plus rank inputs needed for top-100 pages, absolute position, and percentile;
- score comment: board post destination, generated score/time/percentile line, optional user-authored suffix, Reddit comment ID, and submission state.

Use idempotency keys for install, publish, scheduled queue execution, stickied-comment creation, and score-comment submission.

## Board specification

### Canonical representation

- `formatVersion`: board serialization version.
- `rulesetVersion`: physics/scoring/power-up rules used by the post.
- `columns`: 20 for newly created version 1 boards; the legacy seed board remains 18 columns wide.
- `rows`: 18 for newly created version 1 boards; the legacy seed board remains 16 rows high.
- `cells`: row-major array of 360 values for new 20 × 18 boards or 288 values for the legacy 18 × 16 seed board; `0` is empty and `1..14` are palette indices.
- `boardHash`: SHA-256 of a canonical byte/string encoding containing the format version, dimensions, and cells.
- `gameplaySeed`: stable 32-bit seed derived from the canonical dimensions and colored cell values using the documented version 1 algorithm. The prototype currently uses FNV-1a; preserve its output for existing boards even if `boardHash` uses a stronger identity hash. The seven-color rainbow board currently resolves to `ab56a7ef`.
- Reddit record: post ID, author ID/name, creation timestamp, board hash, ruleset version, and optional derived statistics.

Validate on both client and server:

- new user submissions must be exactly 20 × 18; 18 × 16 is accepted only for the canonical legacy seed record and compatible existing data;
- dimensions and cell count must agree;
- all 20 × 18 cells are valid drawing positions for new boards;
- palette values limited to `0..14`;
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
10. hot pink
11. gray
12. white
13. pink
14. brown

Present the final five editor swatches in this order: hot pink, pink, brown, gray, white. This is a display order only; stable numeric color IDs must not change when the editor is rearranged.

The exact hex values can be tuned before the schema is frozen, but IDs and values must never change for already-published boards. Empty cells use the dark playfield and are not a thirteenth color.

### Seed board

- The seed uses every drawable cell: columns 1–16 and rows 2–15.
- Its art dimensions are 16 wide × 14 high inside the 18 × 16 board envelope.
- Keep the seed in its legacy 18 × 16 dimensions; do not pad or migrate it to the larger format.
- Its 14 filled rows cycle through red, orange, yellow, green, cyan, blue, and purple exactly twice. Use the stable palette IDs for those seven colors; purple refers to the palette's violet/purple entry.
- Use the recomputed seven-color prototype hash, `ab56a7ef`, as its gameplay seed; do not retain the earlier fourteen-color seed.
- An idempotent `onAppInstall` routine creates it once per subreddit, creates/stickies the instructional comment, and stores both resulting IDs.
- `onAppUpgrade` must not recreate it.

## Deterministic gameplay

### Run seed

Derive deterministic run randomness from `rulesetVersion + gameplaySeed`. Version 1 uses the prototype's documented FNV-1a-derived 32-bit gameplay seed for every board, including `ab56a7ef` for the current seven-color rainbow board. Do not use the current time or `Math.random()` for anything that affects the result. The seed controls:

- which bricks contain power-ups;
- power-up types;
- initial horizontal ball direction, if it is not fixed by the ruleset;
- any future deterministic gameplay variation.

Cosmetic particles, pitch variation, and screen shake may use nondeterministic randomness because they cannot affect score or physics.

### Power-up plan

- Generate and store an immutable power-up assignment when the level loads.
- A power-up is bound to a cell index, so it drops whenever that brick is destroyed, independent of destruction order.
- Use a seeded PRNG with a documented algorithm; changing it requires a new ruleset version.
- Guarantee reasonable distribution for eligible boards rather than relying only on independent probability. The current prototype targets approximately one power-up per 18 bricks, guarantees at least one on boards with 12 or more bricks, spaces placements across rows where possible, and caps a board at 11 pickups.
- Timed effects never stack or extend. Collecting the same timed power-up again resets its timer to that power-up's full standard duration from the new pickup moment.
- Select types using these weights, which total 100%:

| Power-up | Pickup color/icon | Rarity | Weight | Behavior |
| --- | --- | --- | ---: | --- |
| Wide Paddle | lime `W` | Common | 15% | Makes the paddle 50% wider for 15 seconds. |
| Narrow Paddle | lime `N` | Common | 15% | Makes the paddle 50% narrower for 10 seconds. |
| Safety Bar | cyan `B` | Common | 15% | Adds one bottom safety-bar save for up to 15 seconds. |
| Slow Motion | red `S` | Uncommon | 10% | Runs active balls at 60% of their normal speed for 15 seconds. |
| Laser | hot-pink `L` | Uncommon | 10% | Fires paired shots from the paddle for 8 seconds. |
| Fast Ball | yellow `F` | Uncommon | 10% | Runs active balls at 135% of their normal speed for 10 seconds. |
| Multi-ball | white `M` | Uncommon | 10% | Adds two balls immediately, capped at five active balls; play continues until the last ball is lost. |
| Fireball | orange flame | Uncommon | 10% | Passes through 10 bricks without bouncing; its fire treatment visibly dwindles as the shared hit budget is consumed. |
| Chain Lightning | gray bolt | Rare | 5% | For 10 seconds, a ball hit also destroys 2–3 randomly selected nearby bricks. Gameplay-affecting target selection must use the seeded run PRNG in production. |

- Pickups and balls are circles drawn in Canvas, not standalone SVG assets. Letter glyphs are centered from measured glyph bounds; the fire and lightning symbols are drawn vector-style within the circle. Pickup circles have no white outline.
- Power-ups should never be visible in the board preview.
- Every player receives the same placements and types for the same post and ruleset.

The exact rate, weights, and durations remain tuning parameters until ruleset version 1 is frozen. Any later change requires a ruleset-version change once competitive scores exist.

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
- Safety Bar contact does not reset the combo because the paddle was not touched.
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

- Dark charcoal background, off-white primary interface text, one consistent medium-gray secondary-text color, and saturated brick colors. Do not introduce a darker tertiary text tier that becomes illegible against the background.
- Pixel-aligned rectangles, one-pixel highlights/shadows on game pieces, square corners, and minimal borders. Keep interface containers and controls flat, with no drop shadows.
- Keep the playfield clean and solid: do not apply CRT scanlines over bricks, paddle, ball, or gameplay.
- Use JetBrains Mono from Google Fonts as the locally embedded interface typeface, with system monospace fallbacks.
- Use simple square CSS-outset controls without decorative button icons. On press, reverse the light and dark edges so each control becomes inset like a classic web button; do not use gradients or ornamental bevels.
- Make the inline Play and Create buttons equal width. Play uses the lime primary treatment and Create uses blue. Other secondary actions use a clearly visible medium-gray face rather than black that blends into the surrounding surface.
- Apply that medium-gray secondary treatment consistently to neutral contained controls, including Back, Sound, Close, Preview, Undo, Redo, and post-game Skip buttons. Semantic exceptions are lime primary actions, blue Create/Publish actions, red destructive actions, color swatches, and intentionally borderless text or full-surface interaction controls.
- In the post-game sequence, use lime for each screen's main action and medium gray for every Skip action.
- Use compact, vertically centered text-only **Undo**, **Redo**, and **Clear** controls with no decorative or pixel-art icons; Clear uses the red destructive-action treatment.
- The sound control always shows the music-note icon. Its muted state overlays a thin × on the note rather than replacing the note with an ×.
- Frame post, HUD, editor, and dialog sections with solid chunky borders inspired by classic arcade cabinets.
- Use CSS/Canvas effects rather than representational image assets for the playfield.
- Keep controls visually quiet until needed so the artwork dominates.

### Motion and feedback

- Brick hit: one-frame flash, tiny scale/pop, 4–8 pixel particles, and floating points on valuable hits.
- Combo milestones: progressively stronger color pulse, short label, and richer sound every 5 or 10 bricks.
- Paddle hit: subtle squash/stretch and a brief contact spark.
- Power-up reveal/pickup: recognizable fall animation, color trail, and labeled pickup toast.
- Laser: hot-pink shots with two hot-pink emitter lines embedded inside the paddle body at the shot positions, plus a short bright trail.
- Safety Bar: scan-in animation, low shimmer, and satisfying shatter on use.
- Win: compact cascade across remaining effects followed by a score count-up.
- Loss: brief desaturation/low shake, never a long blocking animation.
- Respect `prefers-reduced-motion`; keep gameplay state identical when effects are reduced.

### Chiptune audio

- Generate audio with Web Audio oscillators and noise so the style is cohesive and assets remain small.
- Initialize/resume audio only after a user gesture.
- Add distinct cues for launch, wall, paddle position, brick height/pitch, combo milestone, power-up drop, pickup, Laser, Safety Bar, loss, clear, editor paint/erase, and successful post. Brick-hit pitch rises as the hit position moves upward on the board and falls toward the bottom.
- Use short gain envelopes to avoid clicks, cap simultaneous voices, and provide a persistent mute control.
- Cosmetic pitch variation must not feed back into gameplay state.

## Target dimensions and responsive behavior

- Authoritative logical game width: **400 px**.
- Prototype logical game height: **700 px**, with a 400 × 700 Canvas and HUD overlaid within that surface.
- At 393 CSS pixels (iPhone 16-class width), scale uniformly to fit width; do not crop or independently stretch axes.
- New 20-column user boards fill the 400-logical-pixel playfield width with 20-pixel cells and no protected side margins.
- New 18-row user boards occupy 360 logical pixels and may use every row. The legacy seed remains an 18 × 16 board rendered at its established inset coordinates so its canonical layout and hash do not change.
- Vertically center the occupied brick artwork in `preview.html` independently of gameplay placement. In `game.html`, keep the expanded ready state and active game at identical logical `(x, y)` coordinates so launching the ball never makes the board jump.
- Desktop may display the surface at 400 logical/CSS pixels or an integer-friendly larger scale, but physics and visible world bounds remain identical.
- Do not add an outer frame or dark backing container around the Play screen. Keep the CSS frame immediately around the canvas as well as the gameplay boundary rendered inside it, and let the page's subtle grid background remain visible in any side space up to that canvas frame.
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

Planned client entry points:

- `preview.html`: the lightweight inline Reddit post view with the vertically centered board artwork plus Play and Create actions.
- `game.html`: the single expanded application for Play, results, leaderboards, score comments, More boards discovery, Create, previewing, naming/publishing, drafts, My Boards, and moderator-only Recent puzzles/queue capabilities.

Play and Create pass an intended initial view into the same `game.html` entry point. Follow the pending-action handoff pattern from Pop Answers so opening expanded mode lands directly in the requested interface without duplicating application shells. Do not create separate `play`, `create`, `front`, or `admin` HTML entry points.

Planned server responsibilities:

- install trigger creates the idempotent seven-color seed post and its stickied instructional comment;
- board lookup by Reddit post ID;
- schema validation and canonical SHA-256 hashing;
- atomic duplicate reservation and lookup;
- user-board `submitCustomPost()` using `runAs: 'USER'` and required `userGeneratedContent` metadata immediately after an explicit Publish action;
- moderator-board Publish now and Add to queue mutations, plus queue processing at 1:00 p.m. `America/New_York`, with idempotent post/comment creation and failure recovery;
- board lifecycle persistence for draft, queued, publishing, published, and failed states;
- author, board, post, and stickied-comment mapping persistence;
- per-board score validation, personal-best writes, global rank, percentile, and paginated top-100 leaderboard reads;
- score-comment composition/submission against the correct board post after an explicit Submit comment action;
- public, subreddit-scoped published-board discovery with compact pagination and canonical Reddit post permalinks;
- strictly moderator-authorized Recent puzzles data and actions for recent user posts and queued moderator boards;
- deletion/reconciliation handling for removed Reddit posts;
- basic rate limiting and abuse controls.

Important platform constraints:

- Expanded mode must be initiated by the user.
- Publishing on behalf of the user requires the `SUBMIT_POST` user-action permission, explicit user intent, UGC metadata, and Reddit app review. During unapproved playtesting, attribution behavior differs.
- Joining the current subreddit requires the `SUBSCRIBE_TO_SUBREDDIT` user-action permission and may fail until the app is approved. The development UI still attempts the real authenticated API path, treats pre-approval failure as a non-blocking no-op, and advances through the post-game sequence; persist subscribed state only after Reddit confirms success.
- Creating or stickying instructional comments and submitting score comments must use the appropriate current Reddit APIs and permissions; verify exact moderator/app capabilities before implementation.
- The displayed `u/[username]` attribution must come from authenticated Reddit identity, never client-supplied text.
- The fourteen-color grid is constrained UGC, which is safer than free-form content, but the app still requires moderation, deletion, and intellectual-property consideration.
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
- occupied-row-based vertical centering in the post preview without changing gameplay coordinates;
- Play and Create routes/views;
- a frozen game ready state;
- fixed-step Canvas gameplay with correct coordinate scaling;
- combo scoring and the complete current power-up roster: Wide Paddle, Narrow Paddle, Slow Motion, Safety Bar, Laser, Fast Ball, Multi-ball, Fireball, and Chain Lightning;
- per-board local high scores;
- chiptune effects, particles, shake, and reduced-motion behavior;
- a fully drawable 20 × 18 editor;
- click/tap toggle, drag painting, undo, redo, clear, and preview;
- local duplicate detection with the required linked message;
- local-only simulated publishing and reopening of the created board.
- a prototype-only `S` keyboard shortcut that destroys one random remaining brick per physical keypress; this is a testing convenience and must not ship as a player feature.
- immediate run teardown when navigating away from Play.

The prototype is a feel/sizing tool, not production architecture. Its serialization and rules should inform the shared TypeScript model, but production code should not blindly copy browser-storage or single-file assumptions.

### Prototype interface and code references

Use the current local prototype as the primary acceptance reference when implementing the production Create and Play experiences:

- [`prototype/index.html`](prototype/index.html) defines the inline post, expanded Play, expanded Create, preview dialog, HUD, and accessible control structure.
- [`prototype/styles.css`](prototype/styles.css) defines the responsive 400-pixel shell, equal-width lime Play and blue Create actions, a blue Publish action, gray secondary treatments, editor grid, palette, HUD, and retro visual system.
- [`prototype/app.js`](prototype/app.js) is the behavioral reference for `ArtBreakerGame`, fixed-step play, paddle/ball collision, scoring, power-up planning and effects, run cleanup, previews, the 20 × 18 editor, undo/redo, duplicate detection, local publishing, and route transitions.
- [`prototype/README.md`](prototype/README.md) documents how to run the reference locally and its route entry points.

For the production port, preserve the prototype's observable interaction and visual behavior unless this plan explicitly supersedes it. Extract deterministic rules into shared TypeScript modules and replace local storage/local publishing with validated Devvit server flows; do not copy the prototype's global state or single-file architecture verbatim.

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
- Remove dead/incorrect Safety Bar positioning state and define its one-hit behavior explicitly.
- Guard audio creation/resume failures and use gain envelopes.
- Match the clearly audible perceived cue level established by the Pop Answers reference. Use master gain plus dynamic-range compression so quiet single effects remain legible without clipping when several gameplay sounds overlap.

## Testing strategy

### Unit tests

- canonical serialization and hash stability;
- seven-color default-board gameplay-seed snapshot remains exactly `ab56a7ef`;
- supported-dimension, cell-count, palette, and schema rejection;
- seeded PRNG and power-up plan snapshots;
- power-up weight totals, durations, speed multipliers, paddle widths, and per-board drop cap;
- scoring progression and numeric upper bounds;
- initial velocity magnitude and speed thresholds;
- paddle angle mapping;
- wall, paddle, brick-corner, adjacent-brick, Laser, Safety Bar, Multi-ball, Fireball, and Chain Lightning collisions/effects;
- identical outcomes at different render frame rates;
- win by ball and win by Laser;
- replay with active bullets/power-ups;
- leaving Play tears down the run and cannot later produce a loss, score change, or game-over audio;
- duplicate reservation races.

### Integration tests

- `preview.html` inline Play opens the correct initial view; authenticated Create opens the editor; signed-out Create stays inline, shows the exact sign-in modal, Cancel closes it, and the blue Sign in action invokes Reddit's native sign-in flow without requesting expanded mode;
- preview artwork is vertically centered for the seed, sparse boards, and top/bottom-heavy boards while gameplay coordinates remain unchanged;
- Create access from the app front screen and from every board post;
- all four edges and all 360 cells of the 20 × 18 Create grid are editable;
- mouse and touch long-press fills and same-color region clears, respects four-direction boundaries, does not replace tap/drag behavior, and undoes in one step;
- draft save/resume, My Boards listing, and published-post links;
- immediate user publishing plus duplicate, conflict, and server failure states;
- moderator **Publish now** and **Add to queue** paths, including strict rejection for non-moderators;
- daily queue execution at 1:00 p.m. `America/New_York`, including daylight-saving transitions, retries, empty queues, and duplicate-job delivery;
- named and unnamed post-title formats, authenticated creator attribution, UGC metadata, and stickied creator/instruction comment;
- preview attribution for app-authored, moderator-authored, immediately user-published, and queued moderator boards, including preservation across scheduled bot publication;
- seven-color seed content, recomputed `ab56a7ef` gameplay seed, and idempotent seed post/comment creation on install/upgrade;
- post deletion and stale duplicate mappings;
- local and server best-score updates, top-100 ordering, 10-row pagination, global position, percentile, and tie handling;
- post-game screen 1 win/loss headings, best score, percentile, rank outside the top 100, trusted current-subreddit name, successful Join-and-advance, pre-approval/failed Join no-op that still advances without persisting subscription, Skip-without-subscribe, and already-subscribed bypass;
- post-game Screen 2 repeated result block, exact textarea placeholder, non-editable automatically added score line, optional user text, Submit comment/Skip paths, correct destination post, and submission failures;
- post-game Screen 3 repeated result block, exact share copy, canonical current-board link, supported native share sheet, Send Link/Skip paths, lime primary actions, and gray Skip actions across Screens 1–3;
- results-screen More action, centered shared loading indicator, responsive four/six-card More boards batches, accurate compact artwork, public-data filtering, pagination, canonical post navigation, and Back restoring the unchanged results state;
- moderator-only Recent puzzles visibility and independent server-side authorization for every associated query/mutation;
- offline/retry behavior where Reddit permits it.

### Manual feel tests

- In `r/ArtBreakerBeta` only, seed 30 idempotent visual-test scores for Rainbow No. 1 so all leaderboard pages and pagination can be reviewed with realistic data. Never seed these fixtures in another subreddit or board.
- paddle precision at center and both edges;
- launch readability without instructions;
- combo legibility during heavy effects;
- editor drawing without accidental page scrolling;
- color distinction in common color-vision deficiencies;
- sound fatigue over repeated runs;
- small and sparse board playability;
- full 224-brick legacy seed-board duration and performance;
- full 360-brick authored-board duration, collision behavior, and performance;
- expanded-mode game sizing on mobile and desktop, with desktop adding side room rather than stretching the logical playfield;
- results and leaderboard usability without a score-distribution graph.

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
- Configure `preview.html` as the inline entry point and unified `game.html` as the expanded entry point for gameplay, results, creation, publishing, and moderator capabilities.
- Port the prototype visual system and Canvas renderer.
- Validate expanded mode in Reddit's simulator and on real mobile clients.

Exit criteria: a hard-coded board can be opened from inline view, played, and edited in the test subreddit.

### Phase 3 — Community publishing

- Add Redis schema for drafts and board lifecycle states, board validation, atomic duplicate detection, user-action permission, and custom-post submission.
- Add the install-time seven-color seed post, its stickied instructional comment, recomputed gameplay seed, and stale-record reconciliation.
- Add immediate user publishing, moderator Publish now/Add to queue choices, daily queue publication, optional naming with the **Custom Art Breaker** fallback, creator attribution, per-board stickied comments, publish confirmation, error recovery, fallback text, and deletion behavior.
- Add My Boards and the strictly moderator-only desktop Recent puzzles view inside Create.

Exit criteria: two simultaneous identical submissions yield exactly one post; user boards publish immediately; moderators can safely choose immediate or queued publication; queued boards publish once at the correct daily slot; drafts remain unpublished; non-moderators cannot invoke moderator capabilities; and posts/comments are correctly attributed after approved user actions are available.

### Phase 4 — Scores, polish, and review readiness

- Add validated per-board personal bests, top-100 leaderboards with 10-row pagination, all-player position/percentile reporting, and the results-screen score-comment composer.
- Complete sound/effect suite, reduced-motion mode, performance budgets, analytics, privacy disclosures, moderation documentation, and app review materials.
- Test old posts against ruleset versioning and app upgrades.

Exit criteria: device matrix passes, score validation rejects obvious tampering, policy requirements are documented, and existing posts survive upgrades.

## Decisions still to tune together

- Final logical height after testing inside the iPhone 16 Reddit expanded view.
- Whether initial horizontal direction is fixed or seeded.
- Exact ball speed curve, paddle influence, and number of lives (current recommendation: one initial ball/run, with Multi-ball able to add balls).
- Combo growth factor and whether Laser hits receive full combo value.
- Final power-up frequency, weights, guarantees, and durations.
- Whether empty/sparse boards need a minimum brick count for publishing.
- Leaderboard tie-breaking, percentile rounding, and how incomplete runs compare with clears.
- Draft limits, retention, naming, autosave behavior, and cross-device conflict handling.
- Whether moderators can reorder or schedule around the default FIFO daily queue.
- Final wording for creator-board stickied comments while retaining creator attribution and score-sharing instructions.
- How creators remove or supersede their boards while preserving Reddit deletion expectations.
