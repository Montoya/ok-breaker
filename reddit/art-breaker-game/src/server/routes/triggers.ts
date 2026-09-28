import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnCommentDeleteRequest,
  OnPostDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { ensureSeedPublished } from '../core/publication';
import { syncPublishedPostShareImages } from '../core/share-image';
import { deleteBoardForPost, deleteCommentReference } from '../core/store';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const input = await c.req.json<OnAppInstallRequest>();
    const seed = await ensureSeedPublished({ createIfMissing: true });
    const shareImages = await syncPublishedPostShareImages();
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Art Breaker initialized in r/${context.subredditName}. Seed post: ${seed.postId ?? 'pending'}. Share images updated: ${shareImages.updated}; failed: ${shareImages.failed}. Trigger: ${input.type}.`,
      },
      200
    );
  } catch (error) {
    console.error('Art Breaker install failed.', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to initialize Art Breaker.' },
      400
    );
  }
});

triggers.post('/on-app-upgrade', async (c) => {
  await c.req.text();
  const seed = await ensureSeedPublished({ createIfMissing: false });
  const shareImages = await syncPublishedPostShareImages();
  return c.json<TriggerResponse>(
    {
      status: 'success',
      message: `Art Breaker upgraded without creating a seed post. Known seed: ${seed.postId ?? 'unlinked'}. Share images updated: ${shareImages.updated}; failed: ${shareImages.failed}.`,
    },
    200
  );
});

triggers.post('/on-post-delete', async (c) => {
  try {
    const input = await c.req.json<OnPostDeleteRequest>();
    await deleteBoardForPost(input.postId);
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  } catch (error) {
    console.error('Art Breaker post-deletion cleanup failed.', error);
    return c.json<TriggerResponse>({ status: 'error' }, 400);
  }
});

triggers.post('/on-comment-delete', async (c) => {
  try {
    const input = await c.req.json<OnCommentDeleteRequest>();
    await deleteCommentReference(input.commentId, input.postId);
    return c.json<TriggerResponse>({ status: 'success' }, 200);
  } catch (error) {
    console.error('Art Breaker comment-deletion cleanup failed.', error);
    return c.json<TriggerResponse>({ status: 'error' }, 400);
  }
});
