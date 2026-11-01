import { context, reddit, redis } from '@devvit/web/server';
import { TRPCError } from '@trpc/server';
import { T3 } from '@devvit/shared-types/tid.js';
import { z } from 'zod';
import { getBoardsById, getFeaturedQueue, keys } from './store';
import { SHARE_IMAGE_URL } from './share-image';
import { requireModerator } from './service';

const selectionSchema = z.object({ id: z.string(), score: z.number() });
const issueSchema = z.object({
  week: z.string(),
  title: z.string(),
  commentText: z.string(),
  boardIds: z.array(z.string()),
  selection: z.array(selectionSchema),
  postId: z.string().optional(),
  commentId: z.string().optional(),
});
type FeaturedIssue = z.infer<typeof issueSchema>;

const readIssue = async (week: string): Promise<FeaturedIssue | undefined> => {
  const stored = await redis.get(keys.featuredIssue(week));
  return stored ? issueSchema.parse(JSON.parse(stored)) : undefined;
};

const saveIssue = async (issue: FeaturedIssue): Promise<void> => {
  await redis.set(keys.featuredIssue(issue.week), JSON.stringify(issueSchema.parse(issue)));
};

export const featuredPublishSlot = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const week = `${part('year')}-${part('month')}-${part('day')}`;
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
  }).format(date);
  return {
    week,
    title: `Featured Art Breaker boards - Week of ${dateLabel}`,
    due: part('weekday') === 'Saturday' && Number(part('hour')) === 11 && Number(part('minute')) < 10,
  };
};

export const featuredCommentText = (usernames: string[]): string => {
  const unique = [...new Set(usernames)];
  const tags = [...new Set(usernames.slice(0, 5))].map((name) => `u/${name}`);
  const names = `${tags.join(', ')}${unique.length > 5 ? ', and more' : ''}`;
  return `Check out this week's featured boards created by our community, featuring ${names}! Which one is your favorite?`;
};

const clearPublishedSelections = async (issue: FeaturedIssue): Promise<void> => {
  for (const selection of issue.selection) {
    const lockKey = keys.featuredSelectionLock(selection.id);
    const lock = await redis.set(lockKey, '1', {
      nx: true, expiration: new Date(Date.now() + 5_000),
    });
    if (lock !== 'OK') throw new Error('Featured list is busy.');
    try {
      if (await redis.zScore(keys.featuredQueue, selection.id) === selection.score)
        await redis.zRem(keys.featuredQueue, [selection.id]);
    } finally {
      await redis.del(lockKey);
    }
  }
};

export const publishWeeklyFeatured = async (date = new Date()) => {
  const slot = featuredPublishSlot(date);
  if (!slot.due) return { message: 'Outside the Saturday 11 a.m. ET publishing window.' };
  const previous = await redis.hGet(keys.featuredPublished, slot.week);
  if (previous === 'deleted') return { message: 'This week’s featured post was deleted.' };
  if (previous === 'skipped') return { message: 'No featured boards were queued for this week.' };
  const lockKey = `ab:v1:featuredLock:${context.subredditId}:${slot.week}`;
  const lock = await redis.set(lockKey, String(Date.now()), {
    nx: true, expiration: new Date(Date.now() + 120_000),
  });
  if (lock !== 'OK') return { message: 'Featured publication is already in progress.' };
  try {
    let issue = await readIssue(slot.week);
    if (!issue) {
      const queue = await getFeaturedQueue();
      const boards = await getBoardsById(queue.map(({ member }) => member));
      const byId = new Map(boards.map((board) => [board.id, board]));
      const selection = queue.filter(({ member }) => {
        const board = byId.get(member);
        return board?.status === 'published' && board.postId && board.permalink && board.creatorRole !== 'app';
      }).map(({ member, score }) => ({ id: member, score }));
      if (!selection.length) {
        await redis.hSet(keys.featuredPublished, { [slot.week]: 'skipped' });
        return { message: 'No featured boards.' };
      }
      const selectedBoards = selection.flatMap(({ id }) => {
        const board = byId.get(id);
        return board ? [board] : [];
      });
      issue = {
        week: slot.week,
        title: slot.title,
        boardIds: selection.map(({ id }) => id),
        selection,
        commentText: featuredCommentText(selectedBoards.map((board) => board.creatorUsername)),
      };
      await saveIssue(issue);
    }
    if (!issue.postId) {
      const pendingIssue = issue;
      // A prior attempt may have posted successfully before its ID reached Redis.
      const recent = await reddit.getNewPosts({ subredditName: context.subredditName, limit: 100 }).all();
      const existing = recent.find((post) => post.title === pendingIssue.title);
      const post = existing ?? await reddit.submitCustomPost({
        subredditName: context.subredditName,
        title: issue.title,
        entry: 'featured',
        postData: { featuredWeek: issue.week },
        runAs: 'APP',
        styles: {
          backgroundColor: '#0e0e10ff',
          backgroundColorDark: '#0e0e10ff',
          heightPixels: 512,
          shareImageUrl: SHARE_IMAGE_URL,
        },
        textFallback: { text: "Browse this week's featured Art Breaker boards." },
      });
      issue = { ...issue, postId: post.id };
      await saveIssue(issue);
    }
    const postId = issue.postId;
    if (!postId) throw new Error('Featured post ID unavailable.');
    await Promise.all([
      redis.hSet(keys.featuredPublished, { [slot.week]: postId }),
      redis.hSet(keys.featuredPostWeek, { [postId]: slot.week }),
    ]);
    await clearPublishedSelections(issue);
    if (!issue.commentId) {
      const comment = await reddit.submitComment({ id: T3(postId), runAs: 'APP', text: issue.commentText });
      issue = { ...issue, commentId: comment.id };
      await saveIssue(issue);
    }
    return { message: `Published ${issue.title}.`, postId: issue.postId };
  } finally {
    await redis.del(lockKey);
  }
};

export const featuredPageForPost = async (week: string, postId: string, page: number) => {
  const issue = await readIssue(week);
  if (!issue?.postId || issue.postId !== postId)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Featured post unavailable.' });
  const boards = (await getBoardsById(issue.boardIds)).filter(
    (board) => board.status === 'published' && board.postId && board.permalink
  );
  const pages = Math.max(1, Math.ceil(boards.length / 4));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  return { boards: boards.slice(safePage * 4, safePage * 4 + 4), page: safePage, pages };
};

export const featuredPage = async (page: number) => {
  const week = context.postData?.featuredWeek;
  if (typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week) || !context.postId)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Featured post unavailable.' });
  return featuredPageForPost(week, context.postId, page);
};

export const featuredQueuePage = async (page: number, take: 4 | 6) => {
  await requireModerator();
  const queue = await getFeaturedQueue();
  const stored = await getBoardsById(queue.map(({ member }) => member));
  const byId = new Map(stored.map((board) => [board.id, board]));
  const boards = queue.flatMap(({ member }) => {
    const board = byId.get(member);
    return board?.status === 'published' && board.postId && board.permalink && board.creatorRole !== 'app'
      ? [board]
      : [];
  });
  const pages = Math.max(1, Math.ceil(boards.length / take));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  return { boards: boards.slice(safePage * take, safePage * take + take), page: safePage, pages };
};

export const deleteFeaturedIssueForPost = async (postId: string): Promise<boolean> => {
  const indexedWeek = await redis.hGet(keys.featuredPostWeek, postId);
  const week = indexedWeek ?? Object.entries(await redis.hGetAll(keys.featuredPublished))
    .find(([, publishedPostId]) => publishedPostId === postId)?.[0];
  if (!week) return false;
  await Promise.all([
    redis.hSet(keys.featuredPublished, { [week]: 'deleted' }),
    redis.hDel(keys.featuredPostWeek, [postId]),
    redis.del(keys.featuredIssue(week)),
  ]);
  return true;
};
