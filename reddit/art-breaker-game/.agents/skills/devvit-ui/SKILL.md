---
name: devvit-ui
description: "Build or review responsive Devvit Web interfaces for Reddit inline and expanded views, including fixed viewports, safe areas, touch, canvas, and accessibility. Not for generic websites."
---

# Devvit UI

Build each Reddit surface as a complete composition that fits its assigned viewport.

## Core contract

Never require document scrolling or an internal scroll region inside an inline Devvit post. Design the complete inline interface to fit its assigned viewport. Internal scrolling in an inline webview is prohibited and can cause the app to be rejected.

Do not try to enforce this inline rule by disabling scrolling or gestures on `html`, `body`, the app root, or the whole interface. Global `overflow`, `touch-action`, `overscroll-behavior`, wheel handling, or broad `preventDefault()` rules can block scrolling in Reddit itself. The host page must keep its normal scroll behavior while the inline interface fits without needing to scroll.

Treat Devvit layouts as height-constrained and width-responsive. Reddit owns the available height; content must not make it grow. Adapt columns, widths, and density across the available horizontal space while keeping every state within the surface's fixed height budget. Desktop fullscreen is an optional user choice, so the required experience must work in the ordinary expanded modal without it.

For an inline screen with inputs, treat the mobile on-screen keyboard as a separate compact layout state. When it occludes the webview, reposition content so the focused field, validation feedback, and relevant action remain visible. Hide or collapse nonessential content while the keyboard is present without introducing inline scrolling.

Treat every line of UI copy as part of the fixed height budget. Prefer short labels, brief instructions, and one clear heading per region. Remove duplicated titles, double headers, long introductory paragraphs, and explanatory copy that does not change the user's next action.

Do not insert unbudgeted status, success, or error containers into normal flow after the screen has rendered. They can push controls beyond the fixed viewport. Use Reddit's `showToast()` client effect or a bounded custom overlay for concise transient feedback. For critical or actionable information that must persist, replace an existing region or reserve its space in the initial layout rather than adding height.

## Layout workflow

1. Identify the entrypoint and surface: launch-only splash, full inline experience, 320px `REGULAR` inline, 512px `TALL` inline, expanded mobile, expanded desktop modal, or optional desktop fullscreen.
2. Decide whether inline is the complete bounded experience or a launch-only splash. For a launch-only splash, keep it to identity, premise, light attraction, and a clear launch action; a full inline experience may contain its core interaction when it fits and preserves feed behavior.
3. For an expanded entrypoint, decide what happens when the user closes it at any point and whether reopening restores, restarts, or discards each kind of state.
4. Inventory fixed chrome, flexible content, controls, safe areas, and the minimum usable playfield.
5. Establish the platform-owned height budget before composing the screen. Give major content containers an explicit height or maximum height and calculate how much content can fit.
6. Truncate or line-clamp variable text on the client wherever its rendered length could overflow a fixed-height container. Keep the canonical value unchanged.
7. Remove redundant headings and verbose copy. Make each remaining text block earn its vertical space by clarifying the next decision or action.
8. Set fixed limits for visible rows, cards, results, and other repeated content. Paginate whenever the available data exceeds those limits.
9. Decide where every asynchronous success, status, validation, and error state will appear without increasing the layout height.
10. Use a root grid or column flex layout with bounded rows and `minmax(0, 1fr)` or `min-height: 0` for the flexible center.
11. Make shared visual regions use the same width and breakpoint logic. A header aligned with a bordered play container must inherit its width and matching side borders.
12. Add compact short-height variants before shrinking tap targets or essential text.
13. For screens with inputs, define a keyboard-visible state that repositions the active form region and hides nonessential content as needed.
14. Verify every supported surface with real Reddit playtest behavior as well as a standalone browser.

Read [fixed-viewport-layout.md](references/fixed-viewport-layout.md), [interaction-and-canvas.md](references/interaction-and-canvas.md), and [responsive-review.md](references/responsive-review.md) as needed.

## CSS rules of thumb

- Fill the host-provided viewport with `height: 100%` or a verified `100dvh` strategy; do not use content-driven minimum heights that can enlarge it. Account for safe-area insets.
- Put `box-sizing: border-box` on layout primitives.
- Give grid/flex children `min-width: 0` and `min-height: 0` where they must shrink.
- Use `clamp()` and container queries for density, not device-name guesses.
- Preserve layout dimensions while loading to avoid reflow.
- Keep launch-only splash animation brief, lightweight, and optional under reduced motion. Do not load the main interaction bundle merely to decorate that splash.
- Do not rely on expanded-view teardown to save important work. Persist at deliberate mutations or checkpoints and make the reopen behavior clear when progress may be discarded.
- Keep borders, radii, and backgrounds consistent across adjacent regions.
- Prefer one heading per region and concise, action-oriented copy. Do not repeat a page title in both global and local chrome.
- Apply single-line ellipsis or a fixed multiline clamp to variable display text before it can increase a bounded region's height. Provide access to the full value when it is important.
- Keep transient messages out of normal flow. Bound overlay dimensions and prevent multiple custom toasts from stacking beyond the viewport.
- Do not assume a focused mobile input remains visible. React to the reduced visual viewport and keep the field, its error, and its submit or next action above the keyboard.
- Never use `overflow: auto` or `overflow: scroll` in an inline entrypoint.
- Do not use `overflow: hidden` as a substitute for making content fit. Reserve clipping for noninteractive decoration after proving that it cannot hide content, controls, focus indicators, or errors.
- Never solve a cramped screen by silently clipping interactive controls.

## Verify

Test `REGULAR` and `TALL` inline heights, narrow mobile width, the conservative 596px expanded-height fixture, the ordinary desktop expanded modal, optional desktop fullscreen, and the exact width breakpoint where side borders appear or disappear. Exercise pointer, touch, keyboard, reduced motion, sound preference and visibility changes, safe-area behavior, and close/reopen at every meaningful expanded-view state.

In inline entrypoints, inspect for document scrolling, internal scroll containers, and accidental Reddit-page gesture blocking. Across all supported surfaces, inspect for keyboard-covered inputs or actions, duplicate headings, verbose copy, dynamic messages that shift layout, stacked toasts, clipped focus rings, unreachable controls, excessive rows, missing pagination, pointer-coordinate drift, and loading-state jumps.
