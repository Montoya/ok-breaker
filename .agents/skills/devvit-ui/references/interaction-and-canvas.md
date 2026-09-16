# Interaction and Canvas

## Scope gesture suppression

Use `touch-action: none` only on a surface that needs exclusive pointer input, such as a paddle, drawing canvas, or draggable board. Keep surrounding buttons and noninteractive chrome on normal browser touch behavior.

Use pointer capture during an active drag when appropriate. Release it on completion and cancellation. Prevent default behavior only for the gestures the app truly owns.

Never apply `overflow: hidden`, `touch-action: none`, `overscroll-behavior: none`, or broad gesture cancellation to `html`, `body`, the app root, or a full-interface surface. These rules can make the embedded Reddit experience feel stuck because the host page loses expected scrolling. Verify behavior inside Reddit, not only in a direct browser tab.

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
