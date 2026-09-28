# Reddit Content and Sharing

## App icon

Ship a custom app icon as part of the project rather than leaving the app with generic profile artwork.

- Use a square 1024×1024 PNG no larger than 500KB.
- Keep the optimized file in version control, for example `assets/app-icon.png`.
- Set `marketingAssets.icon` in `devvit.json` to its path relative to the project root:

```json
{
  "marketingAssets": {
    "icon": "assets/app-icon.png"
  }
}
```

Run `npx devvit upload` during development to validate and upload the configured app asset with the version. The icon appears on the app's Reddit profile after `npx devvit publish` is approved. Changing the profile icon later requires updating the file or path and publishing a new version for review; playtest alone does not update the public app profile.

Verify the final PNG's dimensions, byte size, transparency, and appearance under a circular avatar crop before upload. Optimize the exported file rather than lowering the declared dimensions or relying on the upload to compress it.

## Open Graph share image

Include a dedicated 1200×630 PNG or JPG/JPEG share image so custom posts have an intentional thumbnail in compact feeds and an Open Graph-style preview when shared outside Reddit. Keep the source or final export in the project, for example `assets/og-share.png` or `assets/og-share.jpg`, and design it with safe margins because destinations may crop the edges.

The committed image is the source of truth, but a project-relative path is not sufficient for `shareImageUrl`. The post style requires an absolute Reddit-hosted `i.redd.it` URL and currently works only for apps on public subreddits.

1. Enable runtime media uploads in `devvit.json`:

```json
{
  "media": {
    "dir": "assets"
  },
  "permissions": {
    "media": true
  }
}
```

2. In a controlled setup or publication flow, pass a fetchable URL or data URL for the 1200×630 PNG or JPG/JPEG project asset to `media.upload()` with `type: 'image'`. Upload a static app-wide image once, not every time a post renders or is created. Persist the returned `mediaUrl` so it can be reused.

```ts
import { media } from '@devvit/web/server';

const uploaded = await media.upload({
  url: shareImageSourceUrlOrDataUrl,
  type: 'image',
});

const shareImageUrl = uploaded.mediaUrl;
```

3. Set the resulting `i.redd.it` URL when creating the custom post:

```ts
const post = await reddit.submitCustomPost({
  subredditName,
  title,
  styles: {
    shareImageUrl,
  },
});
```

For an existing post, update only this style with `post.setCustomPostStyles({ shareImageUrl })`. If no custom URL is supplied, Reddit uses its generic share image. Treat the stored URL as durable application configuration, and do not repeatedly upload replacements: Devvit does not currently provide an API for deleting media uploaded with `media.upload()`.

## Sharing

Invoke the Devvit share surface from an explicit user action. Supply concise, safe metadata tied to the current post or result. Treat dismissal as cancellation, not an error or successful share. Do not claim that a share completed when the API only opened a share sheet.

If generating a share image, create it ahead of the user gesture or use an already available asset so the gesture-to-share path stays short. Sanitize user-generated text included in images or share copy.

### Share data and deep-linked post UI

Use `showShareSheet()` when a shared post should carry a small recipient-facing intent. Put the payload in its `data` field and read it with `getShareData()` when the link opens. This can select a shared creation, invitation, result context, challenge, tab, or other bounded landing treatment without requiring a custom share URL.

Treat the payload as untrusted input:

- keep it at or below 1024 characters and include a schema version plus an intent discriminator;
- validate JSON shape, string lengths, enumerated values, and referenced IDs;
- never use it as authentication, authorization, ownership, identity, score proof, payment state, or reward eligibility;
- exclude secrets, hidden app state, and sensitive or unbounded user content;
- resolve canonical entities and public display fields on the server when needed;
- ignore malformed, unsupported, stale, or mismatched data safely; and
- fall back to the ordinary post UI when valid share data is absent.

Share data may choose or decorate the initial UI, but it must not bypass canonical state transitions or permission checks. Test direct opens, valid shares, tampered payloads, unknown versions, deleted entities, logged-out recipients, and recipients whose current state differs from the sender's.

### Desktop expanded-view sign-in layering

On desktop, calling `showShareSheet()` for a logged-out user from an expanded webview can open Reddit's sign-in modal behind the expanded layer. Make the expanded-view share action exit expanded mode with `exitExpandedMode()` so the Reddit modal is reachable. Pass the original trusted click event as required by the view-mode API.

Preserve the minimum pending share intent before exiting because the expanded document may lose focus or be discarded. When the user returns, re-read canonical identity and state, then resume or offer the share action without claiming that it already completed. Keep this workaround conditional to the affected expanded desktop flow; do not close unrelated inline or mobile experiences preemptively.

## User-authored posts

Declare the required `asUser` permission and submit during the direct user interaction. Validate content on the server, make attribution obvious, and return the Reddit post ID or permalink. Use an idempotency token or durable claim when a retry could create duplicate posts.

An asynchronous moderator/app publication queue is a different feature: publish as the app or an authorized app context, not as a user whose interaction happened earlier.

## Comment threads

Present commenting as its own explicit flow initiated by a comment-specific button or submit action. Do not submit a comment as a side effect of finishing a game, saving a score, continuing, replaying, sharing, subscribing, or another action.

Before submission, show the user what the comment will contain and where it will be posted. Clearly distinguish user-entered text from content the app will add automatically, such as a score, elapsed time, result summary, attribution, or link. Keep the disclosed automatic content consistent with the server-generated comment, and let the user cancel without losing access to the rest of the experience.

1. Create an app-owned root comment for the post and sticky it when the product depends on a stable thread location.
2. Store the root comment ID with the canonical post/entity record.
3. Submit user comments as replies to that root comment from the user's direct action.
4. Store each created comment ID plus its entity/user reference for reconciliation and deletion cleanup.
5. Sanitize and bound comment content, and guard retries against duplicates.

If a root comment is missing or deleted, handle it explicitly: disable replies, recreate only when policy permits, or repair through a moderator/app-owned workflow. Do not silently post replies at an unrelated level.

Platform capabilities and exact call signatures change. Confirm stickying, parent ID format, share APIs, and `asUser` permissions against the installed Devvit types and official documentation.

## Subscribing

Request subscription only from a dedicated user click or equivalent explicit action and declare the corresponding permission. Do not combine subscribing with continuing, replaying, commenting, sharing, or another action.

For user privacy, Devvit does not provide an API to check whether the current user already subscribes to the subreddit. Call `subscribeToCurrentSubreddit()` from the explicit flow; it is a no-op when the user is already subscribed. Treat any successful call as a confirmed subscribed state regardless of whether it created a new subscription.

After success, store a subscription marker in app state keyed to the authenticated user and current app installation or subreddit, and use it to avoid prompting that user again. The marker records success through the app, not authoritative Reddit membership: the user can unsubscribe elsewhere without the app observing it. Do not store the marker after failure or cancellation, and keep a repeated subscription request harmless.
