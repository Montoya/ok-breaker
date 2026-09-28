import { expect } from 'vitest';
import { redis } from '@devvit/web/server';
import type { Board, ScoreRecord } from '../../shared/game';
import { test } from '../test';
import {
  deleteBoardForPost,
  deleteCommentReference,
  getBoard,
  getScores,
  keys,
  saveBoard,
  saveCommentReference,
  saveDraft,
  saveScore,
} from './store';

const publishedBoard = (overrides: Partial<Board> = {}): Board => ({
  id: 'deleted-board',
  formatVersion: 2,
  rulesetVersion: 1,
  columns: 18,
  rows: 16,
  cells: new Array<number>(18 * 16).fill(1),
  boardHash: 'deleted-board-hash',
  gameplaySeed: '12345678',
  title: 'Delete Me',
  creatorId: 't2_creator',
  creatorUsername: 'pixel_artist',
  creatorRole: 'user',
  status: 'published',
  createdAt: 1,
  updatedAt: 2,
  postId: 't3_deleted',
  permalink: '/r/ArtBreaker/comments/deleted',
  commentId: 't1_sticky',
  ...overrides,
});

const scoreFor = (boardId: string): ScoreRecord => ({
  boardId,
  userId: 't2_player',
  username: 'brick_breaker',
  score: 100,
  elapsedMs: 1_000,
  cleared: true,
  brickHits: 1,
  paddleHits: 1,
  pickups: 0,
  achievedAt: 3,
});

test('post deletion removes the board and every dependent Redis record', async () => {
  const board = publishedBoard();
  await Promise.all([
    saveDraft(board.creatorId, board),
    saveScore(scoreFor(board.id)),
    redis.hSet(keys.postBoard, { [board.postId!]: board.id }),
    redis.hSet(keys.boardPost, { [board.id]: board.postId! }),
    redis.hSet(keys.boardHash, { [board.boardHash]: board.id }),
    redis.zAdd(keys.published, { member: board.id, score: board.updatedAt }),
    redis.zAdd(keys.queue, { member: board.id, score: 1 }),
    redis.hSet(keys.publishedDays, { '2026-09-07': board.postId! }),
    redis.hSet(keys.comments(board.id), { submission: 't1_score' }),
    saveCommentReference('t1_score', {
      kind: 'score',
      boardId: board.id,
      submissionId: 'submission',
    }),
    saveCommentReference('t1_sticky', { kind: 'sticky', boardId: board.id }),
  ]);

  expect(await deleteBoardForPost(board.postId!)).toBe(true);
  expect(await deleteBoardForPost(board.postId!)).toBe(false);

  expect(await getBoard(board.id)).toBeUndefined();
  expect(await getScores(board.id)).toEqual([]);
  expect(await redis.hGet(keys.postBoard, board.postId!)).toBeUndefined();
  expect(await redis.hGet(keys.boardPost, board.id)).toBeUndefined();
  expect(await redis.hGet(keys.boardHash, board.boardHash)).toBeUndefined();
  expect(
    await redis.hGet(keys.drafts(board.creatorId), board.id)
  ).toBeUndefined();
  expect(await redis.hGet(keys.publishedDays, '2026-09-07')).toBeUndefined();
  expect(await redis.hGet(keys.commentRefs, 't1_score')).toBeUndefined();
  expect(await redis.hGet(keys.commentRefs, 't1_sticky')).toBeUndefined();
  expect(await redis.hGetAll(keys.comments(board.id))).toEqual({});
  expect(await redis.zRange(keys.published, 0, -1, { by: 'rank' })).toEqual([]);
  expect(await redis.zRange(keys.queue, 0, -1, { by: 'rank' })).toEqual([]);
  expect(await redis.zCard(keys.scoreRanks(board.id))).toBe(0);
  expect(await redis.get(keys.scoreRanksReady(board.id))).toBeUndefined();
});

test('score-comment deletion removes only its reference and preserves the score', async () => {
  const board = publishedBoard();
  await Promise.all([
    saveBoard(board),
    saveScore(scoreFor(board.id)),
    redis.hSet(keys.postBoard, { [board.postId!]: board.id }),
    redis.hSet(keys.comments(board.id), { submission: 't1_score' }),
    saveCommentReference('t1_score', {
      kind: 'score',
      boardId: board.id,
      submissionId: 'submission',
    }),
  ]);

  expect(await deleteCommentReference('t1_score', board.postId!)).toBe(true);
  expect(
    await redis.hGet(keys.comments(board.id), 'submission')
  ).toBeUndefined();
  expect(await redis.hGet(keys.commentRefs, 't1_score')).toBeUndefined();
  expect(await getScores(board.id)).toHaveLength(1);
  expect(await getBoard(board.id)).toEqual(board);
});

test('sticky-comment deletion clears the board and seed references', async () => {
  const board = publishedBoard({ id: 'rainbow-no-1' });
  await Promise.all([
    saveBoard(board),
    redis.hSet(keys.postBoard, { [board.postId!]: board.id }),
    redis.set(keys.seedComment, board.commentId!),
    saveCommentReference(board.commentId!, {
      kind: 'sticky',
      boardId: board.id,
    }),
  ]);

  expect(await deleteCommentReference(board.commentId!, board.postId!)).toBe(
    true
  );
  expect((await getBoard(board.id))?.commentId).toBeUndefined();
  expect(await redis.get(keys.seedComment)).toBeUndefined();
  expect(await redis.hGet(keys.commentRefs, board.commentId!)).toBeUndefined();
});

test('comment deletion supports records created before the reverse index existed', async () => {
  const board = publishedBoard();
  await Promise.all([
    saveBoard(board),
    redis.hSet(keys.postBoard, { [board.postId!]: board.id }),
    redis.hSet(keys.comments(board.id), { legacySubmission: 't1_legacy' }),
  ]);

  expect(await deleteCommentReference('t1_legacy', board.postId!)).toBe(true);
  expect(
    await redis.hGet(keys.comments(board.id), 'legacySubmission')
  ).toBeUndefined();
});
