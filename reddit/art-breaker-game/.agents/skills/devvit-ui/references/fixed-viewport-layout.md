# Fixed-Viewport Layout

Every inline Devvit surface must be a bounded composition. Give the surface and its major containers an explicit height or maximum height, then size the content to fit without document scrolling or an internal scroll container.

## Surface height contract

Inline Devvit surfaces are height-constrained and width-responsive. Treat inline height as a platform-owned budget, not a dimension that content may extend. Use width breakpoints to change columns and horizontal density while preserving the bounded vertical composition.

| Surface | Height assumption |
| --- | --- |
| Inline `REGULAR` | 320px fixed post height |
| Inline `TALL` | 512px fixed post height and the default inline setting |
| Expanded mobile | Fullscreen presentation with device safe areas; use 596px as a conservative minimum-height QA fixture |
| Expanded desktop | Modal presentation by default; use 596px as a conservative maximum-height design fixture |
| Desktop fullscreen | Optional user-selected enhancement; never required for the app to be usable |

Reddit's public documentation explicitly specifies the two inline heights and describes expanded mode as fullscreen on mobile and a modal on web. It does not currently publish 596px as a guaranteed API dimension. Use 596px as a conservative design and testing baseline, then verify the actual `window.innerHeight`, safe-area behavior, UI Simulator modes, and real Reddit clients. Do not branch core product behavior on receiving exactly that value.

## Compose the available height

Use a small number of explicit vertical regions:

```css
.app-shell {
  height: 100%;
  height: 100dvh;
  max-height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding:
    env(safe-area-inset-top)
    env(safe-area-inset-right)
    env(safe-area-inset-bottom)
    env(safe-area-inset-left);
}
```

The center region must be allowed to shrink. Its contents must also have a bounded-size strategy; a grid row alone does not make an intrinsically tall child fit.

Use compact modes when the host provides less than the expected height budget to reduce gaps, decorative copy, and nonessential chrome. Keep primary controls reachable and tap targets usable. Do not add content merely because fullscreen or a taller device makes extra height available unless that content is optional enhancement.

## Content capacity and pagination

For inline and other intentionally fixed compositions, calculate the maximum amount of repeated content that fits at the smallest supported height. Enforce that capacity explicitly rather than rendering an unbounded list and hoping it fits.

- Give tables, leaderboards, feeds, menus, and result grids a fixed maximum number of visible rows or items.
- Paginate when a collection exceeds that capacity. Keep the page controls inside the fixed layout budget.
- Use fewer items per page in short-height variants when necessary.
- Truncate or line-clamp user-generated and server-provided display text on the client when it could overflow a fixed-height container. Keep the canonical value intact and expose the full text through an accessible label, explicit detail view, or another interaction that also fits the no-scroll layout.
- Split long forms and editors into steps, tabs, or pages instead of making their container scroll.
- Test empty, partially filled, full, and over-capacity states with the longest plausible content.

## Copy density and feedback

Space is scarce in every Devvit surface. Use one clear heading for a page or region, then move directly to the content or action. Avoid a global title followed by a card with the same title, long welcome paragraphs, repeated instructions, verbose button labels, and explanatory text that restates visible controls. Prefer progressive disclosure when secondary help is genuinely needed, provided that opening it still respects the no-scroll height budget.

Dynamic feedback is part of the layout contract. Do not append banners, helper paragraphs, success messages, validation summaries, or error boxes that increase the screen's normal-flow height after an interaction.

- Use Reddit's `showToast()` from `@devvit/web/client` for concise, transient confirmation, status, or noncritical error feedback.
- A custom toast must be a bounded overlay, account for safe areas and the on-screen keyboard, dismiss automatically when appropriate, and avoid covering the active control.
- Do not queue or stack enough toasts to consume the viewport. Coalesce or replace repeated messages.
- Do not rely on a toast for critical information the user must retain or act on. Replace an existing content region, use a fixed-size modal or state, or reserve an error/status slot from the initial layout.
- Keep persistent field validation within the field's preallocated height. If the message can vary, clamp it or replace nearby helper text rather than pushing the rest of the form down.
- Include loading, success, empty, validation, and failure states in the original height calculation, even if only one is visible at a time.

## Width and borders

Define one shared container width token or class for the header, play area, and results chrome. Do not separately approximate their widths.

If the play container drops side borders when it becomes edge-to-edge, the header must use the same query and border decision. Apply `box-sizing: border-box` so border width does not make one region wider.

Prefer a container query when the component is embedded in different Reddit surfaces. Use viewport media queries only when the viewport itself is the intended input.

## Overflow

Never use `overflow: auto` or `overflow: scroll` in an inline entrypoint. For data-heavy inline panels, paginate, summarize, or switch to a compact representation.

Do not set global `overflow: hidden`, `touch-action: none`, `overscroll-behavior: none`, or broad wheel/touch cancellation on `html`, `body`, the app root, or a full-surface inline element. Those rules can prevent the surrounding Reddit page or app from scrolling. Let Reddit retain its normal scroll behavior while the inline surface remains intrinsically within its bounds.

Use `overflow: hidden` or `overflow: clip` only for noninteractive decoration after proving that all meaningful content fits. It must never conceal controls, focus indicators, validation messages, or user content.

Text needs explicit behavior. Use single-line ellipsis for compact labels and a fixed multiline clamp for descriptions or other bounded copy. If CSS constraints alone cannot make the component safe, truncate the display string on the client before rendering and append an ellipsis. Do not overwrite or send the shortened value back as canonical data. Never let a long username, title, translated label, or server-provided message enlarge a fixed-height layout.

## Mobile on-screen keyboard

The on-screen keyboard can cover part of a mobile expanded webview without making Reddit manage the app's layout. Treat keyboard visibility as an explicit compact state and keep the active input flow usable within the remaining visible area.

- Combine `focusin` and `focusout` state with `window.visualViewport` resize and scroll signals when available. Focus alone is insufficient because a hardware keyboard may not reduce the viewport.
- Compare the current visual viewport with the normal focused-screen baseline to estimate keyboard occlusion. Do not depend on one universal keyboard height.
- Reposition or translate an app-owned fixed form stage so the focused field, its label, validation message, and submit or next action remain above the keyboard.
- Collapse or hide nonessential artwork, explanatory copy, headers, previews, and secondary actions when the remaining height cannot fit the active flow.
- Recalculate after focus changes, orientation changes, and viewport resize or scroll events. Restore the ordinary composition when the keyboard closes without clearing the input or unexpectedly moving focus.
- Avoid calling `scrollIntoView()` on the document when it could move or trap the surrounding Reddit page. Keep keyboard accommodation scoped to an app-owned stage.

Test this behavior in real Reddit clients on iOS and Android. Cover the first and last fields, multiline input, validation errors, submit actions, keyboard dismissal, orientation changes, and switching between fields while the keyboard remains open. The desktop browser's mobile-size simulator does not reproduce every native keyboard behavior.

## Expanded and fullscreen views

Treat Reddit's expanded surface as its own bounded viewport. On mobile, expanded mode is presented fullscreen; on desktop, it opens as a modal. A desktop user may choose fullscreen, but the app cannot require or assume that choice. Design and validate the complete experience in the default desktop modal first, then allow width and spacing to enhance progressively in fullscreen.

Do not assume the browser Fullscreen API or raw screen dimensions. Adapt to the actual container, safe areas, and dynamic browser chrome.
