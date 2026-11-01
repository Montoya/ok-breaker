# Art Breaker

Art Breaker is a Reddit-native arcade game in which a piece of pixel art becomes a brick-breaking challenge. Anyone can play, including signed-out visitors. Signed-in redditors can save leaderboard scores, create and save pixel-art boards, publish boards as Reddit posts, optionally join the community, and optionally share a score comment. Subreddit moderators can maintain a scheduled board queue and select community boards for a weekly featured post.

Installing the app creates one starter post, **Rainbow No. 1**. Normal users and moderators can publish boards immediately from the editor. Moderators can instead add boards to a queue that the app checks every five minutes and publishes from once per day during the 1:00–1:09 p.m. America/New_York window. A separate weekly task publishes featured boards on Saturdays at 11 a.m. Eastern when moderators have selected at least one board.

Art Breaker runs entirely on Reddit's Devvit platform. It has no advertising, payments, LLM features, analytics, account linking, external HTTP fetches, or third-party data services. Game and publication data is stored in the installation's Devvit Redis database.

## Release notes

- **1.1.2** fixes a bug that could cause saved sound settings not to be applied correctly during play.

## Playing Art Breaker

1. Open an Art Breaker post. Its inline card shows the artwork, creator, the viewer's saved best score when available, and separate **Play** and **Create** buttons.
2. Select **Play** to open the expanded game. Press or click the playfield to launch the ball.
3. Move the paddle with touch, mouse movement, the mouse wheel, or the left and right arrow keys. The game pauses when its tab is hidden and also provides a pause button.
4. Break bricks to build score and combo. Hitting the paddle resets the combo. Missing every ball ends the run; clearing every brick wins it.
5. When a run ends, the app saves a signed-in player's best result for that board. Guest results are shown but are not stored.

When paused, the game shows a red **Quit** button and a **Resume** button side by side near the bottom of the view. **Quit** opens an **Are you sure?** prompt with **Cancel** and a red **Yes, quit!** button. Cancel returns to the pause controls. Confirming a quit with points ends the run as an uncleared board and follows the normal score submission and results flow. A zero-point quit skips score submission and proceeds to the leaderboard. Clicking the paused playfield does not resume play.

The game uses a deterministic board seed for its power-up placement and initial launch direction. Boards with at least 12 bricks may contain **Wide**, **Narrow**, **Slow**, **Fast**, **Safety Bar**, **Laser**, **Multi-ball**, **Fireball**, and **Chain Lightning** power-ups.

Scoring starts at 100 points for a brick and follows a 1.15× combo curve. Clearing the board multiplies the pre-bonus score by 1.25, then multiplies it by `1 + accuracy` (up to 2× for perfect accuracy). Accuracy is the share of ball-specific paddle rallies that hit at least one brick before returning to the paddle or before the board clears. The initial launch from the paddle counts as the first rally. A return without a brick is a miss, and an active no-brick rally is also a miss when the board clears; Safety Bar contacts, laser hits, and multiballs that drain before returning do not affect accuracy. The ratio is always truncated, never rounded up, to four decimal places and displayed as a percentage with at most two decimal places. A perfect clear therefore earns up to 2.5× the pre-bonus score.

Each leaderboard keeps one best run per signed-in player. It orders entries by score descending, elapsed time ascending, and achievement time ascending. The public leaderboard displays up to 100 positions across ten pages and shows the current player's rank, percentile, and best score. A player's percentile is the percentage of other players whose best score is strictly lower; the current player is excluded from the denominator.

The results flow offers signed-in players three separate, optional actions:

- **Join** subscribes the player to the current subreddit.
- **Submit comment** posts the displayed score and time, plus any optional message the player entered, as a reply to the board's sticky score thread.
- **Share** opens Reddit's native share sheet for the current post. Opening the sheet changes **Skip** to **Done**; it does not claim that the player completed a share.

Each action has its own manual button and can be skipped. Posting, commenting, joining, and sharing are not required to see the leaderboard, replay, create a board, or browse other boards. A signed-out player instead receives an optional Reddit sign-in prompt before the leaderboard.

The results screen's **More** button browses other published Art Breaker boards from the current subreddit. Its header has a back button and three high-contrast tabs of the same height: **Latest** (the default), **Upvotes**, and **Plays**. The selected tab is highlighted. Latest shows the existing newest-first list. Upvotes ranks boards published within the last seven days by their Reddit post score (net votes); Plays ranks boards published within the last seven days by the number of signed-in players with saved scores. Ties use publication order. All three tabs retain the same board grid, results count, and pagination: four boards per page on mobile or six on desktop, with up to 25 pages. Selecting a board opens its canonical Reddit post. The current board and unpublished records are excluded.

Moderators also see a star tab in More. It previews the current featured selection for the next weekly post in the order the boards were added, using the same grid and page size.

## Creating and publishing boards

Creating, saving, and publishing require a signed-in Reddit account. A signed-out **Create** action shows Reddit's sign-in prompt without opening the editor.

The editor provides:

- A fully editable 20×18 grid and 14-color palette
- Click or tap painting, drag painting, recoloring, and same-color erasing
- Long-press flood fill and flood clear
- Up to 100 undo states, plus redo and clear controls
- A playable preview that returns to the unchanged editor without saving a score
- Server-backed draft saving

**My Boards** lists the current user's drafts, queued moderator boards, and published boards. Drafts can be resumed or permanently erased. Published boards link to their Reddit posts.

Publishing is a separate confirmation step. The optional board name must contain 3–22 Unicode graphemes; leaving it blank creates a post titled **Custom Art Breaker by u/[username]**. The client and server reject blocked terms, and the server rejects empty boards and duplicate cell layouts. A duplicate response links to the existing board when a canonical post is available.

A board needs at least **12 bricks** before it can be published or added to the moderator publication queue. Attempting either action with fewer bricks opens a **More bricks needed** dialog: “Boards with fewer than 12 bricks are not allowed. Add more bricks and try again.” Its **OK** button returns to the editor. The server enforces the same minimum. Smaller boards can still be saved as drafts.

Immediate publication uses `runAs: 'USER'` and includes Devvit's `userGeneratedContent` metadata. The confirmation identifies the destination subreddit and tells the redditor that the post will use their Reddit username. During an unapproved playtest, Reddit may attribute most user actions to the app account; after approval, supported user actions run as the current redditor.

Every successfully published board receives an app-authored comment containing creator attribution and score-sharing instructions, and the app asks Reddit to distinguish and sticky it. Score comments are submitted only as replies to that recorded comment. If the score thread is unavailable, the app reports an error instead of creating a top-level score comment.

## Moderator queue

The server checks current subreddit moderator permissions independently for every queue query or mutation. Client-side button visibility is not treated as authorization.

Moderators receive these additional editor features:

- **Publish** immediately publishes the current board as that moderator.
- **Queue** adds the board to the front or back of the scheduled queue.
- **Recent puzzles** shows the current queue and recently published boards.
- A queued board can be removed back into the editor or published immediately from **Recent puzzles**.

Queued publication always uses `runAs: 'APP'`, including publication started by another moderator from **Recent puzzles**. This prevents a later moderator from being shown as the creator of somebody else's queued artwork. The board record, post title when custom, text fallback, and sticky comment retain the original creator attribution.

The `daily-publish` scheduler runs every five minutes. It publishes only during the 1:00–1:09 p.m. America/New_York window, uses Eastern daylight-saving rules, and records a per-day marker after successful scheduled publication. There is no subreddit menu action for publishing queued boards.

## Weekly featured boards

On a published community board's inline splash screen, moderators see a yellow star button to the right of the sound button. An outlined star means the board is not selected; a filled star means it is selected. Toggling the button updates the featured queue, and the moderator-only star tab in **More** shows that queue. The server checks moderator permission and verifies that the board belongs to the current post. The starter board cannot be featured.

The `weekly-featured` task checks every five minutes and publishes during the Saturday 11:00–11:09 a.m. America/New_York window. If the featured queue is empty, it skips that week. Otherwise, it creates one app-authored post titled **Featured Art Breaker boards - Week of [Month day, year]**, using that Saturday's date, and clears the boards selected for that issue from the queue. Boards selected after publication remain for the following Saturday. The weekly selection is based on the current queue, regardless of when those boards were published.

The featured post displays **ART BREAKER**, **Featured boards from our community**, and a paginated 2×2 grid of the selected boards in selection order, with no fixed limit on the number of boards. Each card opens its board's Reddit post. The featured post has no Play or Create controls. The app also adds a comment asking which board is the community's favorite. It tags the creators of up to the first five selected boards and adds **and more** when the selection has more than five distinct creators.

## Permissions and stored data

The manifest enables Devvit Redis and Reddit API access. It requests these user-action scopes:

- `SUBMIT_POST` for immediate user or moderator board publication
- `SUBMIT_COMMENT` for a score comment the player explicitly confirms
- `SUBSCRIBE_TO_SUBREDDIT` for the optional **Join** action

The app stores:

- Board cells, title, hashes and deterministic seed, creator Reddit ID and username, lifecycle status, timestamps, and associated post/comment IDs
- One best score per board and signed-in player, including Reddit ID and username, score, duration, completion state, hit counts, pickup count, and timestamp
- Draft, publication, moderator queue, featured selection and weekly issue, daily-publication, subscription, and score-comment indexes
- A random browser device ID, sound preference, and short-lived navigation handoff in browser local storage

The browser device ID is sent to the app's Devvit server with requests so signed-out sessions have a fallback identifier, but it is not persisted in Redis. The app does not request credentials, email addresses, real names, location, advertising identifiers, or other sensitive personal information, and it does not send its stored data to a third party.

Free-form inputs are limited to board names and optional score-comment text. Board names are bounded and filtered inside the app. Published boards and score messages become normal Reddit posts or comments with reportable attribution. Pixel-art expression is limited to the fixed grid and palette.

Draft owners can delete their own drafts. The app also registers idempotent `onPostDelete` and `onCommentDelete` handlers:

- Deleting an Art Breaker board post removes its board, scores, comment references, duplicate hash, and related publication, queue, featured selection, draft, post, and seed indexes from Redis. Deleting a weekly featured post removes its saved issue and prevents another featured post for the same week.
- Deleting a score comment removes the app's reference to that comment but does not remove the independently earned leaderboard score.
- Deleting an app-created sticky comment clears its stored reference; the app does not silently recreate it.

The current Devvit Web implementation does not include an account-deletion event handler or automatic expiry for stored player records.

## Development and release

Requirements:

- Node.js 24.18.0 or newer; `.nvmrc` selects 24.18.0
- npm
- Devvit CLI and Web packages 0.15.0
- A Reddit account enrolled in Reddit for Developers
- Moderator access to `r/ArtBreakerBeta`

Install dependencies and authenticate:

```bash
npm install
npm run login
```

The Devvit app slug is `art-breaker-game`. Development and playtest commands target `r/ArtBreakerBeta` by default through `devvit.json`; `DEVVIT_SUBREDDIT` can override that target when needed.

```bash
npm run dev
```

On installation, `onAppInstall` creates the Rainbow No. 1 board and post if they do not already exist. `onAppUpgrade` reconciles existing starter-board metadata but does not create another starter post.

Run the local release checks with:

```bash
npm test
```

This runs TypeScript checks, ESLint, Vitest tests, and the Vite production build. The individual commands are `npm run test:types`, `npm run lint`, `npm run test:unit`, and `npm run build`.

`npm run deploy` runs the verification commands and uploads a private version with `devvit upload`. `npm run launch` performs that upload and then invokes `devvit publish` to submit a version for review. Use `devvit publish --public` only when intentionally requesting an App Directory listing; the default publish request is unlisted.

## Reviewer walkthrough

Production behavior depends on Reddit identity, user actions, posts, comments, moderator permissions, triggers, the scheduler, and installation-scoped Redis, so local tests are not a substitute for a Devvit playtest. Test the exact release candidate on current Reddit mobile and web clients with the app owner, another moderator, a regular signed-in user, and a signed-out visitor.

1. Install the app and confirm that exactly one Rainbow No. 1 post is created.
2. Play as a signed-out visitor and confirm that the result is not persisted.
3. Play as a regular signed-in user and verify best-score replacement and leaderboard pagination.
4. Pause a run, test Resume and the two-step Quit confirmation, then verify that a quit with points records an uncleared result while a zero-point quit skips score submission.
5. Independently skip or confirm joining, commenting, and sharing; verify the disclosed Reddit action in each case.
6. Open **More** and check Latest, Upvotes, and Plays, their seven-day ranking windows, board counts, pagination, and post links.
7. Save, resume, preview, erase, and publish a user draft. Try publishing with 11 bricks and then 12; verify post attribution and duplicate handling.
8. As a moderator, try queuing an 11-brick board, then add eligible boards to both ends of the queue, remove one for editing, publish one from **Recent puzzles**, and verify that non-moderators cannot call queue procedures directly.
9. As a moderator, feature and unfeature published community boards with the splash-screen star, then inspect their order in the More star tab. Confirm regular users cannot see or mutate the selection.
10. Exercise both scheduled windows. Confirm that daily publication occurs at most once per day; confirm that an empty featured queue skips the week, while a populated queue produces one Saturday post and comment, shows four boards per page, and clears its published selection.
11. Delete a published board post, weekly featured post, score comment, and sticky comment, then verify the corresponding Redis cleanup. Repeated deletion events must remain harmless.
12. Test touch, mouse, wheel, and keyboard play plus responsive inline and expanded layouts. On web, confirm that the Reddit feed continues scrolling while the pointer is over the inline card.

## Code map

- `devvit.json` registers the board and featured inline entrypoints, expanded game, server bundle, permissions, lifecycle/deletion triggers, and both scheduled tasks.
- `src/client/preview.tsx` implements the lightweight inline post card.
- `src/client/featured.tsx` implements the weekly featured post's board grid and pagination.
- `src/client/game.tsx` coordinates play, results, optional Reddit actions, leaderboards, and board discovery.
- `src/client/game-engine.ts` contains the fixed-step canvas simulation, controls, scoring, deterministic power-ups, effects, and synthesized sound.
- `src/client/editor.tsx` contains the editor, preview, drafts, publication dialogs, personal board list, and moderator queue interface.
- `src/server/trpc.ts` exposes the typed API and user-action procedures.
- `src/server/core/service.ts` handles identity, authorization, boards, scores, rankings, and discovery.
- `src/server/core/store.ts` owns Redis persistence, indexes, reverse comment references, and deletion cleanup.
- `src/server/core/publication.ts` handles starter-post reconciliation and scheduled or in-app queue publication.
- `src/server/core/featured.ts` handles featured selection pages, weekly publication, issue snapshots, and featured-post deletion.
- `src/server/routes/triggers.ts` and `src/server/routes/scheduler.ts` implement lifecycle, deletion, and scheduled-task endpoints.
