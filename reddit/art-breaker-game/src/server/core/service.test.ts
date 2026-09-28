import { describe, expect } from 'vitest';
import { redis } from '@devvit/web/server';
import type { Board, ScoreRecord } from '../../shared/game';
import { test } from '../test';
import { ensureSeedPublished } from './publication';
import { SHARE_IMAGE_URL } from './share-image';
import {
  boardTitle,
  discoverBoards,
  leaderboardFor,
  stickyCommentFor,
} from './service';
import {
  enqueueBoard,
  getQueue,
  keys,
  removeQueuedBoard,
  saveBoard,
  saveScore,
} from './store';

const board = (creatorRole: Board['creatorRole']): Board => ({
  id: creatorRole === 'app' ? 'rainbow-no-1' : 'custom',
  formatVersion: 2,
  rulesetVersion: 1,
  columns: 18,
  rows: 16,
  cells: new Array<number>(18 * 16).fill(1),
  boardHash: '12345678',
  gameplaySeed: '12345678',
  title: creatorRole === 'app' ? 'Rainbow No. 1' : 'Space Cat',
  creatorId: 'creator-id',
  creatorUsername: 'pixel_artist',
  creatorRole,
  status: 'published',
  createdAt: 1,
  updatedAt: 1,
});

describe('board publication copy', () => {
  test('uses the uploaded Reddit share image', () => {
    expect(SHARE_IMAGE_URL).toBe('https://i.redd.it/ew9m25wzu5oh1.jpeg');
  });

  test('uses the official seed title and comment', () => {
    const seed = board('app');
    expect(boardTitle(seed)).toBe('Rainbow No. 1');
    expect(stickyCommentFor(seed)).toBe(
      "Let's go breakers! Can you get the high score? When you finish playing, submit a comment to share your score in this thread."
    );
  });

  test('uses the custom-board comment with creator attribution', () => {
    expect(stickyCommentFor(board('user'))).toBe(
      "Let's go breakers! Can you get the high score in this custom board by u/pixel_artist? When you finish playing, submit a comment to share your score in this thread."
    );
  });
});

test('upgrade-style seed reconciliation never creates a missing seed post', async () => {
  const seed = await ensureSeedPublished({ createIfMissing: false });

  expect(seed.id).toBe('rainbow-no-1');
  expect(seed.postId).toBeUndefined();
  expect(await redis.get(keys.seedPost)).toBeUndefined();
});

test('a leaderboard with one player reports a 100 percentile', async () => {
  const score: ScoreRecord = {
    boardId: 'only-player-board',
    userId: 'only-player',
    username: 'solo_breaker',
    score: 500,
    elapsedMs: 10_000,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: 1,
  };
  await saveScore(score);

  const ranking = await leaderboardFor(score.boardId, score.userId, 0);

  expect(ranking.totalPlayers).toBe(1);
  expect(ranking.percentile).toBe(100);
});

test('the first of six players reports a 100 percentile', async () => {
  const boardId = 'first-of-six-board';
  const scores: ScoreRecord[] = [100, 200, 300, 400, 500, 600].map(
    (score, index) => ({
      boardId,
      userId: `player-${index}`,
      username: `player_${index}`,
      score,
      elapsedMs: 10_000,
      cleared: true,
      brickHits: 1,
      paddleHits: 1,
      pickups: 0,
      achievedAt: index,
    })
  );
  await Promise.all(scores.map((score) => saveScore(score)));

  const ranking = await leaderboardFor(boardId, 'player-5', 0);

  expect(ranking.totalPlayers).toBe(6);
  expect(ranking.currentRank).toBe(1);
  expect(ranking.percentile).toBe(100);
});

test('the second of two players reports a zero percentile', async () => {
  const boardId = 'second-of-two-board';
  const scores: ScoreRecord[] = [100, 200].map((score, index) => ({
    boardId,
    userId: `player-${index}`,
    username: `player_${index}`,
    score,
    elapsedMs: 10_000,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: index,
  }));
  await Promise.all(scores.map((score) => saveScore(score)));

  const ranking = await leaderboardFor(boardId, 'player-0', 0);

  expect(ranking.totalPlayers).toBe(2);
  expect(ranking.currentRank).toBe(2);
  expect(ranking.percentile).toBe(0);
});

test('players with tied scores do not count as better than each other', async () => {
  const boardId = 'tied-percentile-board';
  const score = (
    userId: string,
    points: number,
    elapsedMs: number
  ): ScoreRecord => ({
    boardId,
    userId,
    username: userId,
    score: points,
    elapsedMs,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: 1,
  });
  await Promise.all([
    saveScore(score('faster-tied-player', 500, 9_000)),
    saveScore(score('slower-tied-player', 500, 10_000)),
    saveScore(score('lower-player', 100, 8_000)),
  ]);

  const [faster, slower] = await Promise.all([
    leaderboardFor(boardId, 'faster-tied-player', 0),
    leaderboardFor(boardId, 'slower-tied-player', 0),
  ]);

  expect(faster.currentRank).toBe(1);
  expect(slower.currentRank).toBe(2);
  expect(faster.percentile).toBe(50);
  expect(slower.percentile).toBe(50);
});

test('a guest score gets a percentile without a saved best or rank', async () => {
  const scores: ScoreRecord[] = [100, 300, 500].map((score, index) => ({
    boardId: 'guest-percentile-board',
    userId: `player-${index}`,
    username: `player_${index}`,
    score,
    elapsedMs: 10_000,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: index,
  }));
  await Promise.all(scores.map((score) => saveScore(score)));

  const ranking = await leaderboardFor('guest-percentile-board', null, 0, 400);

  expect(ranking.percentile).toBe(67);
  expect(ranking.currentRank).toBeNull();
  expect(ranking.best).toBeNull();
});

test('leaderboard ties use lower time, then earlier submission', async () => {
  const tiedScore = 750;
  const score = (
    userId: string,
    elapsedMs: number,
    achievedAt: number,
    cleared: boolean
  ): ScoreRecord => ({
    boardId: 'tie-break-board',
    userId,
    username: userId,
    score: tiedScore,
    elapsedMs,
    cleared,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt,
  });
  await Promise.all([
    saveScore(score('slower-clear', 12_000, 1, true)),
    saveScore(score('faster-later', 10_000, 3, false)),
    saveScore(score('faster-first', 10_000, 2, false)),
  ]);

  const ranking = await leaderboardFor('tie-break-board', null, 0);

  expect(ranking.entries.map((entry) => entry.username)).toEqual([
    'faster-first',
    'faster-later',
    'slower-clear',
  ]);
  expect(ranking.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
});

test('leaderboard lazily reconciles score records created before the rank index', async () => {
  const legacy: ScoreRecord = {
    boardId: 'legacy-rank-board',
    userId: 'legacy-player',
    username: 'legacy_player',
    score: 900,
    elapsedMs: 12_000,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: 1,
  };
  await redis.hSet(keys.scores(legacy.boardId), {
    [legacy.userId]: JSON.stringify(legacy),
  });

  const ranking = await leaderboardFor(legacy.boardId, legacy.userId, 0);

  expect(ranking.entries[0]?.username).toBe('legacy_player');
  expect(ranking.currentRank).toBe(1);
  expect(await redis.zCard(keys.scoreRanks(legacy.boardId))).toBe(1);
  expect(await redis.get(keys.scoreRanksReady(legacy.boardId))).toBe('yes');
});

test('saving a replacement score removes the previous rank entry', async () => {
  const first: ScoreRecord = {
    boardId: 'replacement-rank-board',
    userId: 'improving-player',
    username: 'improving_player',
    score: 500,
    elapsedMs: 20_000,
    cleared: true,
    brickHits: 1,
    paddleHits: 1,
    pickups: 0,
    achievedAt: 1,
  };
  await saveScore(first);
  await saveScore({ ...first, score: 800, elapsedMs: 15_000, achievedAt: 2 });

  const ranking = await leaderboardFor(first.boardId, first.userId, 0);

  expect(ranking.totalPlayers).toBe(1);
  expect(ranking.entries[0]?.score).toBe(800);
  expect(await redis.zCard(keys.scoreRanks(first.boardId))).toBe(1);
});

test('discovery includes Rainbow No. 1 from other boards even when its legacy index entry is missing', async () => {
  const seed = {
    ...board('app'),
    postId: 't3_rainbow',
    permalink: '/r/ArtBreaker/comments/rainbow',
  };
  const custom = {
    ...board('user'),
    id: 'other-board',
    postId: 't3_other',
    permalink: '/r/ArtBreaker/comments/other',
  };
  const newest = {
    ...board('user'),
    id: 'newest-board',
    postId: 't3_newest',
    permalink: '/r/ArtBreaker/comments/newest',
  };
  await Promise.all([
    saveBoard(seed),
    saveBoard(custom),
    saveBoard(newest),
    redis.zAdd(keys.published, { member: custom.id, score: custom.updatedAt }),
    redis.zAdd(keys.published, {
      member: newest.id,
      score: newest.updatedAt + 1,
    }),
  ]);

  const result = await discoverBoards(custom.id, 0, 4);

  expect(result.boards.map((item) => item.id)).toEqual([
    'newest-board',
    'rainbow-no-1',
  ]);
});

test('mobile discovery uses Rainbow No. 1 only when the 100-board window has room', async () => {
  const seed = {
    ...board('app'),
    postId: 't3_rainbow',
    permalink: '/r/ArtBreaker/comments/rainbow',
  };
  const published = Array.from({ length: 100 }, (_, index) => ({
    ...board('user'),
    id: `mobile-${index}`,
    postId: `t3_mobile_${index}`,
    permalink: `/r/ArtBreaker/comments/mobile_${index}`,
    updatedAt: index + 1,
  }));
  const finalBoard = published[0]!;
  await Promise.all([
    saveBoard(seed),
    ...published.map(async (item) => {
      await saveBoard(item);
      await redis.zAdd(keys.published, {
        member: item.id,
        score: item.updatedAt,
      });
    }),
  ]);
  await redis.zRem(keys.published, [finalBoard.id]);

  const withRoom = await discoverBoards('current-board', 24, 4);
  expect(withRoom.pages).toBe(25);
  expect(withRoom.boards.at(-1)?.id).toBe('rainbow-no-1');

  await redis.zAdd(keys.published, {
    member: finalBoard.id,
    score: finalBoard.updatedAt,
  });
  const full = await discoverBoards('current-board', 24, 4);
  expect(full.pages).toBe(25);
  expect(full.boards).toHaveLength(4);
  expect(full.boards.some((item) => item.id === 'rainbow-no-1')).toBe(false);
});

test('desktop discovery uses Rainbow No. 1 only when the 150-board window has room', async () => {
  const seed = {
    ...board('app'),
    postId: 't3_rainbow',
    permalink: '/r/ArtBreaker/comments/rainbow',
  };
  const published = Array.from({ length: 150 }, (_, index) => ({
    ...board('user'),
    id: `desktop-${index}`,
    postId: `t3_desktop_${index}`,
    permalink: `/r/ArtBreaker/comments/desktop_${index}`,
    updatedAt: index + 1,
  }));
  const finalBoard = published[0]!;
  await Promise.all([
    saveBoard(seed),
    ...published.map(async (item) => {
      await saveBoard(item);
      await redis.zAdd(keys.published, {
        member: item.id,
        score: item.updatedAt,
      });
    }),
  ]);
  await redis.zRem(keys.published, [finalBoard.id]);

  const withRoom = await discoverBoards('current-board', 24, 6);
  expect(withRoom.pages).toBe(25);
  expect(withRoom.boards.at(-1)?.id).toBe('rainbow-no-1');

  await redis.zAdd(keys.published, {
    member: finalBoard.id,
    score: finalBoard.updatedAt,
  });
  const full = await discoverBoards('current-board', 24, 6);
  expect(full.pages).toBe(25);
  expect(full.boards).toHaveLength(6);
  expect(full.boards.some((item) => item.id === 'rainbow-no-1')).toBe(false);
});

test('boards can be added to the front or back of the moderator queue', async () => {
  const first = {
    ...board('moderator'),
    id: 'queue-first',
    boardHash: '11111111',
    status: 'queued' as const,
  };
  const last = {
    ...board('moderator'),
    id: 'queue-last',
    boardHash: '22222222',
    status: 'queued' as const,
  };
  const front = {
    ...board('moderator'),
    id: 'queue-front',
    boardHash: '33333333',
    status: 'queued' as const,
  };
  await enqueueBoard(first, 'back');
  await enqueueBoard(last, 'back');
  await enqueueBoard(front, 'front');

  expect((await getQueue()).map((item) => item.id)).toEqual([
    'queue-front',
    'queue-first',
    'queue-last',
  ]);

  await removeQueuedBoard(first);
  expect((await getQueue()).map((item) => item.id)).toEqual([
    'queue-front',
    'queue-last',
  ]);
});
