import { expect } from 'vitest';
import { reddit, redis } from '@devvit/web/server';
import type { Board } from '../../shared/game';
import { test } from '../test';
import {
  deleteFeaturedIssueForPost,
  featuredCommentText,
  featuredPageForPost,
  featuredQueuePage,
  featuredPublishSlot,
  publishWeeklyFeatured,
} from './featured';
import { getFeaturedQueue, keys, saveBoard } from './store';

const board = (id: string, username: string): Board => ({
  id,
  formatVersion: 2,
  rulesetVersion: 1,
  columns: 18,
  rows: 16,
  cells: new Array<number>(18 * 16).fill(1),
  boardHash: `hash-${id}`,
  gameplaySeed: '12345678',
  title: `Board ${id}`,
  creatorId: `t2_${username}`,
  creatorUsername: username,
  creatorRole: 'user',
  status: 'published',
  createdAt: 1,
  updatedAt: 2,
  postId: `t3_${id}`,
  permalink: `/r/ArtBreakerBeta/comments/${id}`,
});

test('Saturday 11 a.m. follows Eastern time across daylight saving changes', () => {
  expect(featuredPublishSlot(new Date('2026-10-31T15:00:00Z'))).toEqual({
    week: '2026-10-31',
    title: 'Featured Art Breaker boards - Week of October 31, 2026',
    due: true,
  });
  expect(featuredPublishSlot(new Date('2026-11-07T16:05:00Z')).due).toBe(true);
  expect(featuredPublishSlot(new Date('2026-11-07T15:05:00Z')).due).toBe(false);
  expect(featuredPublishSlot(new Date('2026-11-07T16:10:00Z')).due).toBe(false);
});

test('the comment tags the first five distinct creators in featured order', () => {
  expect(featuredCommentText(['ranger', 'ranger', 'miamislice', 'artlover']))
    .toBe("Check out this week's featured boards created by our community, featuring u/ranger, u/miamislice, u/artlover! Which one is your favorite?");
  expect(featuredCommentText(['a', 'b', 'c', 'd', 'e', 'f']))
    .toContain('u/a, u/b, u/c, u/d, u/e, and more!');
  expect(featuredCommentText(['a', 'a', 'b', 'c', 'd', 'e', 'f']))
    .toContain('u/a, u/b, u/c, u/d, and more!');
});

test('an empty featured queue does not publish', async () => {
  expect(await publishWeeklyFeatured(new Date('2026-10-31T15:00:00Z')))
    .toEqual({ message: 'No featured boards.' });
  expect(await redis.hGet(keys.featuredPublished, '2026-10-31')).toBe('skipped');
});

test('the weekly post snapshots order and clears only consumed selections', async () => {
  let submittedPost: unknown;
  let submittedComment: unknown;
  Object.defineProperty(reddit, 'getNewPosts', {
    configurable: true,
    value: () => ({ all: async () => [] }),
  });
  Object.defineProperty(reddit, 'submitCustomPost', {
    configurable: true,
    value: async (options: unknown) => {
      submittedPost = options;
      return { id: 't3_featured' };
    },
  });
  Object.defineProperty(reddit, 'submitComment', {
    configurable: true,
    value: async (options: unknown) => {
      submittedComment = options;
      return { id: 't1_featured_comment' };
    },
  });
  const first = board('first', 'ranger');
  const second = board('second', 'miamislice');
  await Promise.all([saveBoard(first), saveBoard(second)]);
  await redis.zAdd(keys.featuredQueue,
    { member: second.id, score: 1 },
    { member: first.id, score: 2 });

  const result = await publishWeeklyFeatured(new Date('2026-10-31T15:00:00Z'));
  expect(result.postId).toMatch(/^t3_/);
  expect(submittedPost).toMatchObject({
    title: 'Featured Art Breaker boards - Week of October 31, 2026',
    entry: 'featured',
    postData: { featuredWeek: '2026-10-31' },
    runAs: 'APP',
  });
  expect(submittedComment).toMatchObject({ id: 't3_featured', runAs: 'APP' });
  const issue = JSON.parse((await redis.get(keys.featuredIssue('2026-10-31'))) ?? '{}');
  expect(issue.boardIds).toEqual(['second', 'first']);
  expect(issue.commentText).toContain('u/miamislice, u/ranger!');
  expect(issue.commentId).toMatch(/^t1_/);
  expect(await getFeaturedQueue()).toEqual([]);

  await redis.zAdd(keys.featuredQueue, { member: first.id, score: 3 });
  expect((await publishWeeklyFeatured(new Date('2026-10-31T15:05:00Z'))).postId)
    .toBe(result.postId);
  expect((await getFeaturedQueue()).map(({ member }) => member)).toEqual(['first']);
});

test('a featured issue paginates every four boards in saved order', async () => {
  const boards = ['one', 'two', 'three', 'four', 'five'].map((id) => board(id, id));
  await Promise.all(boards.map(saveBoard));
  await redis.set(keys.featuredIssue('2026-10-31'), JSON.stringify({
    week: '2026-10-31',
    title: 'Featured Art Breaker boards - Week of October 31, 2026',
    commentText: 'Featured boards',
    boardIds: boards.map(({ id }) => id),
    selection: [],
    postId: 't3_featured',
  }));

  const first = await featuredPageForPost('2026-10-31', 't3_featured', 0);
  expect(first.boards.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four']);
  expect(first.pages).toBe(2);
  const second = await featuredPageForPost('2026-10-31', 't3_featured', 1);
  expect(second.boards.map(({ id }) => id)).toEqual(['five']);
  await expect(featuredPageForPost('2026-10-31', 't3_other', 0)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('deleting a weekly post removes its issue without reopening the week', async () => {
  await redis.set(keys.featuredIssue('2026-10-31'), JSON.stringify({
    week: '2026-10-31', title: 'Featured', commentText: 'Featured',
    boardIds: [], selection: [], postId: 't3_featured',
  }));
  await redis.hSet(keys.featuredPostWeek, { t3_featured: '2026-10-31' });
  await redis.hSet(keys.featuredPublished, { '2026-10-31': 't3_featured' });

  expect(await deleteFeaturedIssueForPost('t3_featured')).toBe(true);
  expect(await deleteFeaturedIssueForPost('t3_featured')).toBe(false);
  expect(await redis.get(keys.featuredIssue('2026-10-31'))).toBeUndefined();
  expect(await redis.hGet(keys.featuredPublished, '2026-10-31')).toBe('deleted');
});

test('only moderators can page through the live featured queue', async () => {
  const boards = ['one', 'two', 'three', 'four', 'five'].map((id) => board(id, id));
  await Promise.all(boards.map(saveBoard));
  await redis.zAdd(keys.featuredQueue,
    ...boards.map((item, index) => ({ member: item.id, score: index + 1 })));

  const original = Object.getOwnPropertyDescriptor(reddit, 'getCurrentUser');
  Object.defineProperty(reddit, 'getCurrentUser', {
    configurable: true,
    value: async () => null,
  });
  try {
    await expect(featuredQueuePage(0, 4)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    Object.defineProperty(reddit, 'getCurrentUser', {
      configurable: true,
      value: async () => ({ getModPermissionsForSubreddit: async () => ['ALL'] }),
    });
    const first = await featuredQueuePage(0, 4);
    expect(first.boards.map(({ id }) => id)).toEqual(['one', 'two', 'three', 'four']);
    expect(first.pages).toBe(2);
    expect((await featuredQueuePage(1, 4)).boards.map(({ id }) => id)).toEqual(['five']);
  } finally {
    if (original) Object.defineProperty(reddit, 'getCurrentUser', original);
    else Reflect.deleteProperty(reddit, 'getCurrentUser');
  }
});
