# Startup and Endpoint Design

## Preview-to-expanded handoff

An inline preview and its expanded Devvit entrypoint do not share React memory. If the preview already has enough canonical public data to begin, place a small handoff in browser storage immediately before opening the expanded view.

When the inline preview is a launch-only splash, keep it lightweight. Load only the identity, copy, light animation, and state needed to present its launch action. Defer core interaction code, gameplay initialization, heavy assets, and data used only by the main interface. Do not fetch data in the splash solely to populate a handoff; the handoff exists to reuse data the splash already needed. If the inline entrypoint is the complete bounded experience, optimize its actual first interaction rather than forcing an unnecessary second entrypoint.

The handoff must include:

- a schema version;
- creation time and a short TTL;
- the post or entity ID;
- only the minimum public data needed to render;
- runtime schema validation on read.

Catch storage failures and fall back to the server. Start from the handoff, fetch canonical data in the background, and avoid resetting the game or interaction state when refreshed data is equivalent.

Do not store secrets, permission decisions, trusted identity, or large payloads in the handoff.

For a separate launch flow, measure the splash and main interface as separate entrypoints. Verify the emitted graph so the splash does not preload a shared chunk containing the game engine, full interaction UI, heavy media, or other main-interface-only dependencies.

## Critical-data endpoints

Design first-load endpoints around what the user can do next:

- A play endpoint should return the board or level, not leaderboard pages, subscription state, moderator state, publishing queues, or graph data.
- Fetch identity or a compact session summary in parallel or after the play surface appears.
- Check moderator status only when the user enters a moderator-only surface.
- Return leaderboard page zero with score submission when the results screen needs it next.
- Load deeper results, graphs, discovery pages, and editor-only data on demand.

Avoid duplicate permission checks within one trusted service call. Keep the authoritative check on every protected server entrypoint.

Minimize disclosure as well as bytes. Do not include hidden game data, private viewer state, moderation data, or future content in a convenient bootstrap response when the first interaction does not need it. Split the endpoint or return opaque identifiers and resolve protected facts only after the canonical transition that reveals them.

## Serverless request paths

Never seed fixtures, rebuild global indexes, publish content, or run broad migrations in an ordinary read request. Move these to install/upgrade triggers, explicit admin jobs, or small lazy migrations guarded by durable markers.

Keep lazy migrations idempotent, scoped to one entity or index, safe under concurrent calls, measurable, and removable after rollout.

## Lazy loading and prefetching

Distinguish three forms of lazy loading when measuring and reviewing an app:

- **Data:** request leaderboards, discovery pages, graphs, subscription state, and moderator or editor data only when the user approaches or opens the corresponding surface.
- **Code:** use dynamic imports or framework-supported lazy components for substantial feature modules that are absent from the initial interaction.
- **Assets:** defer noncritical images, fonts, audio, and generated share media while preloading only what the first interaction needs.

Choose boundaries around user-visible features, not arbitrary files. Keep the initial play or preview path synchronous enough to avoid a chain of loaders. Start independent critical requests in parallel, and do not lazy-load small shared modules when the extra request and loading state cost more than the bytes saved.

Prefetch a small amount of probable next work after the current screen is useful. Good candidates include an adjacent leaderboard page, the next discovery page, or a substantial feature chunk after clear user intent. Deduplicate prefetches, respect cache freshness and network cost, and ensure a prefetched response cannot overwrite newer state.

Provide a stable fallback for every lazy boundary: preserve layout dimensions, localize the loading indicator to the deferred region, expose retry for failures, and ignore results when the user has navigated elsewhere.

## Bundles and entrypoints

After endpoints are lean:

- compare inline and expanded bundle composition;
- inspect emitted HTML and the production chunk graph instead of assuming separate entrypoints create separate payloads;
- watch for a shared chunk that contains expanded-only features and is module-preloaded by the inline preview;
- keep editor/admin code out of the play entrypoint when practical;
- lazy-load result graphs, sharing previews, and other post-play UI;
- use local compressed fonts and images sized for their rendered use;
- preload only assets needed before the first interaction;
- avoid loading the same heavy dependency in preview and expanded entrypoints without need.

## Static asset budget

Devvit hosts the built web-view client from the directory configured by `post.dir`. It can also expose a static asset directory configured by `media.dir` to both the app client and server. Treat every shipped font, image, audio file, map, and other asset as part of the app's upload and storage budget even when it is not embedded in JavaScript, then identify which of those files are actually requested on each runtime path.

Inspect the production output, not only source files. Record total and per-entrypoint transfer size, identify which assets the inline and expanded documents request, and check whether an imported asset was copied, inlined, shared, or duplicated. Do not assume an unused-looking source asset is absent from the upload or that a separately emitted file is absent from startup cost.

For fonts:

- prefer WOFF2 and subset characters, styles, and weights to what the interface uses;
- compare one static face with a variable font when the app uses only a narrow weight range;
- use an appropriate `font-display` strategy and a compatible fallback so text does not block the first useful screen;
- preload only a truly critical face, and avoid making an inline preview download expanded-only typography.

For images, animation, and audio:

- resize to the maximum rendered dimensions and use an efficient format at an appropriate quality;
- provide smaller variants when one source would substantially overserve compact surfaces;
- defer post-play art, editor media, share assets, and audio that the first interaction does not need;
- avoid large data URLs in critical CSS or JavaScript because they increase parse cost and can duplicate bytes across entrypoints;
- reserve rendered dimensions so deferred assets do not shift the layout.

Exclude production source maps, debug media, obsolete variants, and duplicate generated assets from the hosted client unless they serve a deliberate operational purpose. Use stable asset references that work in the Devvit-hosted client, and verify playtest and uploaded builds rather than relying on paths that work only in a local development server.

Verify exact Devvit and bundler behavior against the installed package versions and official documentation before relying on a platform-specific optimization.
