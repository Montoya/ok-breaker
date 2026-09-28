# User-Generated Content

## Define the content lifecycle

Model user submissions with explicit states such as pending, accepted, rejected, removed, expired, or promoted. Define which states the author, ordinary users, moderators, and public endpoints may see. Keep the original submission separate from moderator-authored or derived canonical content when provenance matters.

Resolve the author from server context. Validate content length, structure, allowed media, referenced entities, and eligibility on the server. Apply the same safety checks to create and edit paths, and record the policy or validator version when later rechecks may be required.

## Prevent abuse without corrupting intent

Use stable user/entity uniqueness keys for one-per-user rules. Apply server-side rate limits to submission and edit operations, with an explicit scope and reset model. Return a retry time or terminal reason without revealing moderation internals that would make safeguards easier to evade.

Treat duplicate detection as a signal unless the product has a safe deterministic rule. Normalize only for comparison; preserve the canonical submitted value separately. Human review should be able to inspect why something was flagged and override suggestions with an audit trail.

If edits are allowed, define their window and which states remain editable. Enforce the deadline and ownership on the server, preserve audit facts needed for moderation, and ensure editing cannot bypass uniqueness, rate, or safety checks.

## Aggregate and promote carefully

When submissions feed surveys, rankings, catalogs, summaries, or canonical content, keep raw evidence distinct from derived groups and moderator decisions. Automated grouping, classification, scoring, or summarization should remain a suggestion unless the product explicitly authorizes automatic promotion.

Make threshold transitions atomic so concurrent submissions cross a milestone once. Define caps, expiry, reopening, rejection, and removal behavior. Derived counts and groups must be repairable from canonical eligible records.

## Reporting, moderation, and removal

Provide a user-visible reporting or support path appropriate to the app. Give moderators bounded queues with stable pagination, enough context to decide, and explicit actions. Authorize every moderation endpoint on the server and record who performed material actions without exposing private moderation data publicly.

If the app enables users to create content, define how that content can be removed. Reconcile removal across Reddit objects, Redis records, indexes, caches, aggregates, and external services. Supported post and comment deletion events must remain effective even when the app's own content state has already changed.

## Verify

Test unauthorized calls, ownership, malformed content, duplicate and concurrent submissions, rate-limit boundaries, edit boundaries, threshold races, removal, repeat removal, moderator overrides, missing reverse indexes, and policy-version rechecks. Include empty and zero-engagement content in moderator queries; do not accidentally make problematic records undiscoverable because they have no activity.
