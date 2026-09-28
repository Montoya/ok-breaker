# Interaction and Canvas

## Scope gesture suppression

In inline mode, use `touch-action: none` only on a small bounded surface that truly needs exclusive pointer input, and verify that vertical feed scrolling still works over and around it. Keep surrounding buttons and noninteractive chrome on normal browser touch behavior. Move full-surface drag, drawing, pan, or zoom interactions to a more appropriate surface.

Use pointer capture during an active drag when appropriate. Release it on completion and cancellation. Prevent default behavior only for the gestures the app truly owns.

Never apply `overflow: hidden`, `touch-action: none`, `overscroll-behavior: none`, or broad gesture cancellation to `html`, `body`, the app root, or a full-interface inline surface. These rules can make the embedded Reddit experience feel stuck because the host page loses expected scrolling. Verify inline behavior inside Reddit, not only in a direct browser tab.

## Canvas sizing

Separate logical game coordinates from rendered CSS size:

- keep one stable logical width and height for physics and scoring;
- size the canvas responsively within its container;
- multiply backing-store dimensions by device pixel ratio for sharpness when needed;
- map pointer coordinates from the canvas bounding rectangle into logical coordinates;
- update transforms on resize without resetting game state.

Use `aspect-ratio`, bounded width/height, and container measurements so the canvas consumes available space without forcing page overflow.

## Accessibility

Canvas content still needs accessible controls and status. Provide keyboard equivalents where meaningful, visible focus, labels for icon buttons, and non-color-only state. Respect reduced motion for decorative transitions without changing game mechanics unless the product specifies it.

## Sound and visibility

Start audio only after a user interaction and provide an obvious mute control whenever the app uses sound. Persist the preference at an appropriate viewer scope and treat a missing preference conservatively.

Respond to the Devvit visibility-change lifecycle by suspending or muting audio when the post is no longer visible, then restore only when the app becomes visible and the user's preference still allows sound. Do not use sound as the only feedback, and do not let visual or audio suspension alter authoritative timers or server state.
