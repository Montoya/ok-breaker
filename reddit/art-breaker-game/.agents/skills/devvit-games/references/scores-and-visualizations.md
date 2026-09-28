# Scores and Visualizations

## Define score authority

Document the score inputs, bounds, rounding, tie-breaks, completion rules, and eligibility modes. Compute or validate competitive scores from server-known events. Persist the exact facts needed to explain and rebuild a result rather than only a final number.

When replacing an existing canonical result, compare the complete ordering tuple. Define whether lower time, earlier achievement, fewer moves, or another secondary metric wins, and finish with a stable unique key when deterministic ordering matters.

## Leaderboards and personal rank

Keep the public leaderboard cap separate from the player's exact rank. A top-N response does not prove that an omitted player is rank N+1. Use the ordered index to obtain the player's current rank directly, and label ranks as current when later results can move them.

Return normalized pagination metadata and the viewer's canonical result when the UI needs it. Do not leak private viewer state through shared caches. Define how guests, ineligible modes, removed results, ties, empty boards, and players outside the public cap appear.

## Score graphs and distributions

State exactly what each graph represents before choosing bins:

- every run or one canonical result per player;
- all time, one board, one season, or a time window;
- raw score, completion time, accuracy, streak, or another measure;
- all completed games or only ranking-eligible results.

Prefer server-produced aggregates when the client does not need raw histories. Use stable bin boundaries, include zero-count bins where axis stability matters, bound the number of bins, and return the viewer's value or bucket separately when useful.

For histograms, return raw counts and enough metadata to derive honest labels. Decide whether visual height represents count, percentage, density, percentile, or a normalized maximum, and do not mix those semantics. Handle an all-zero data set without division by zero or invented bars.

For line graphs, define sampling interval, timezone, missing-period behavior, and whether values are snapshots or events. Do not join sparse points in a way that implies measurements that were never taken.

Graphs can disclose hidden facts. Do not return or render a distribution whose bucket count, bounds, labels, or viewer marker reveals protected game structure before the appropriate state transition.

## Accessibility and small surfaces

Provide an accessible textual summary of the graph and raw values needed to understand it. Do not encode the viewer, success, or eligibility by color alone. Keep labels legible, cap visible detail to the available surface, and use pagination or a focused detail state rather than unreadably dense marks.

## Rebuildability

Treat leaderboard members, graph bins, counters, streaks, and summary statistics as derived data unless the product explicitly makes them canonical. Keep enough authoritative results to rebuild them, and version aggregate definitions when their inclusion or calculation rules change.
