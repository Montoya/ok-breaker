import { context, reddit, redis } from '@devvit/web/server';
import { T3 } from '@devvit/shared-types/tid.js';
import { getBoard, getQueue, keys, saveBoard } from './store';
import { ensureSeedBoard, publishBoardPost } from './service';

export const ensureSeedPublished = async ({ createIfMissing }: { createIfMissing: boolean }) => {
  const seed = await ensureSeedBoard();
  const knownPostId = seed.postId ?? await redis.get(keys.seedPost);
  if (knownPostId) {
    let permalink = seed.permalink;
    if (!permalink) {
      try {
        permalink = (await reddit.getPostById(T3(knownPostId))).permalink;
      } catch (error) {
        console.warn('Could not reconcile the Rainbow No. 1 post.', error);
        return seed;
      }
    }
    const published = { ...seed, status: 'published' as const, postId: knownPostId, permalink };
    await Promise.all([
      saveBoard(published),
      redis.set(keys.seedPost, knownPostId),
      redis.hSet(keys.postBoard, { [knownPostId]: published.id }),
      redis.hSet(keys.boardPost, { [published.id]: knownPostId }),
      redis.zAdd(keys.published, { member: published.id, score: published.updatedAt }),
    ]);
    return published;
  }
  if (!createIfMissing) return seed;
  const lockKey = `ab:v1:seedLock:${context.subredditId}`;
  const lock = await redis.set(lockKey, String(Date.now()), { nx: true, expiration: new Date(Date.now() + 60_000) });
  if (lock !== 'OK') return seed;
  try {
    return await publishBoardPost(seed, 'APP');
  } finally {
    await redis.del(lockKey);
  }
};

export const isEasternPublishWindow = (date = new Date()): boolean => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? -1);
  return hour === 13 && minute < 10;
};

export const publishNextQueued = async (date = new Date()) => {
  if (!isEasternPublishWindow(date)) return { message: 'Outside the 1 p.m. ET publishing window.' };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const publishedToday = await redis.hGet(keys.publishedDays, day);
  if (publishedToday) return { message: 'A queued board was already published today.', postId: publishedToday };
  const lockKey = `ab:v1:queueLock:${context.subredditId}:${day}`;
  const lock = await redis.set(lockKey, String(Date.now()), { nx: true, expiration: new Date(Date.now() + 60_000) });
  if (lock !== 'OK') return { message: 'Publishing is already in progress.' };
  try {
    const [next] = await getQueue();
    if (!next) return { message: 'No queued boards.' };
    try {
      const published = await publishBoardPost({ ...next, status: 'publishing', updatedAt: Date.now() }, 'APP');
      if (published.postId) await redis.hSet(keys.publishedDays, { [day]: published.postId });
      return { message: `Published ${published.title}.`, postId: published.postId };
    } catch (error) {
      const failed = { ...next, status: 'failed' as const, lastError: error instanceof Error ? error.message : 'Publication failed.', updatedAt: Date.now() };
      await Promise.all([saveBoard(failed), redis.zRem(keys.queue, [next.id])]);
      throw error;
    }
  } finally {
    await redis.del(lockKey);
  }
};

export const publishQueuedBoardNow = async (boardId: string) => {
  const board = await getBoard(boardId);
  if (!board || board.status !== 'queued') throw new Error('Queued board unavailable.');
  const lockKey = `ab:v1:queueBoardLock:${board.id}`;
  const lock = await redis.set(lockKey, String(Date.now()), { nx: true, expiration: new Date(Date.now() + 60_000) });
  if (lock !== 'OK') throw new Error('This board is already being published.');
  try {
    return await publishBoardPost({ ...board, status: 'publishing', updatedAt: Date.now() }, 'APP');
  } catch (error) {
    const failed = { ...board, status: 'failed' as const, lastError: error instanceof Error ? error.message : 'Publication failed.', updatedAt: Date.now() };
    await Promise.all([saveBoard(failed), redis.zRem(keys.queue, [board.id])]);
    throw error;
  } finally {
    await redis.del(lockKey);
  }
};
