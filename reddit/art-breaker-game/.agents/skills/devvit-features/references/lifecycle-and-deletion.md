# Lifecycle, Publication, and Deletion

## Install and upgrade

Use install triggers for first-time idempotent initialization. Use upgrade triggers for migrations and repair without automatically duplicating seed posts or comments.

Every lifecycle operation should be safe to retry. Persist stable markers or IDs only after dependent writes succeed, and design partial-failure recovery. Keep expensive initialization and fixture generation out of normal user requests.

## Publication

Model publishing as explicit states such as draft, queued, publishing, published, and failed. Protect moderator transitions on the server. Use durable claims or locks so schedules and moderator actions cannot publish the same item twice.

Store the resulting Reddit post ID and any root or stickied comment ID with the entity. Maintain ordered published and queue indexes separately from canonical records.

Keep mutable drafts separate from immutable published revisions. Bind each post to the exact revision used to create it so later editorial changes do not silently change historical content. Persist generated titles, media URLs, attribution, scheduled time, and other publication inputs before the external call when retries must reproduce the same post.

For scheduled content:

- distinguish recurring cadence slots from independently scheduled one-off items;
- store canonical instants and make local-time and timezone conversion explicit at the editing boundary;
- reject collisions and enforce one assignment per slot or claim;
- define how priority insertion shifts only content that has not started publishing;
- represent missing due content explicitly rather than silently substituting another item;
- use coverage or runway queries derived from the ordered schedule; and
- keep audit records for assignment, movement, cancellation, publication, failure, and repair.

Import and export canonical content through a versioned schema. Validate identifiers, references, invariants, and ordering before writing, and make repeated imports deterministic or explicitly conflict-aware.

## Reverse references

Create mappings that make platform events actionable without scans:

- post ID to app entity;
- comment ID to entity and purpose;
- entity to associated comment IDs;
- user/entity to canonical score when required.

Update mappings in the same logical mutation as the canonical write. Account for partial failure and make repair possible.

## Delete handlers

Configure and implement post and comment deletion handlers. Cleanup must be idempotent and narrowly scoped.

For a deleted post, remove or unlink the entity, publication and queue indexes, score hashes and sorted sets, migration markers, root and child comment references, date indexes, locks, and reverse post mappings as appropriate.

For a deleted comment, remove its reverse reference and any entity-level pointer to it. Do not delete unrelated scores or entities merely because a user-facing comment disappeared.

Test deletion with complete data, partial legacy data, missing reverse mappings, repeated events, and a missing canonical record. A bounded legacy fallback scan can aid migration, but maintain reverse indexes for the steady-state path.

## User-content removal

If the app lets users create content, provide an appropriate user or moderator flow to remove it. Reconcile removal across Reddit objects, Redis records, indexes, caches, aggregates, and external stores. Keep explicit removal operations and supported post or comment deletion events idempotent and narrowly scoped.

Test complete indexed data, missing reverse indexes, already-removed content, shared records with multiple authors, cached display data, and repeated deletion events. Report unreconciled legacy state rather than silently leaving removed content behind.
