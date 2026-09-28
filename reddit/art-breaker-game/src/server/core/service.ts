import { createHash, randomUUID } from 'node:crypto';
import { context, reddit, redis } from '@devvit/web/server';
import { TRPCError } from '@trpc/server';
import {
  EDITOR_COLUMNS,
  EDITOR_ROWS,
  FORMAT_VERSION,
  LEGACY_COLUMNS,
  LEGACY_ROWS,
  RULESET_VERSION,
  boardInputSchema,
  canonicalBoard,
  gameplaySeedFor,
  scoreForClear,
  makeSeedCells,
  pointsForCombo,
  scoreInputSchema,
  type Board,
  type LeaderboardEntry,
  type ScoreInput,
  type ScoreRecord,
} from '../../shared/game';
import { boardNameIssue } from '../../shared/text-safety';
import {
  deleteDraft,
  enqueueBoard,
  ensureScoreRanks,
  getBoard,
  getBoards,
  getBoardsById,
  getDrafts,
  getPublishedBoardIds,
  getPublishedBoards,
  getQueue,
  getRankedScores,
  getScore,
  keys,
  removeQueuedBoard,
  saveBoard,
  saveCommentReference,
  saveDraft,
  saveScore,
  scoreRankMember,
} from './store';
import { SHARE_IMAGE_URL } from './share-image';

export type Actor = { id: string; username: string; authenticated: boolean };

export const getActor = async (deviceId: string): Promise<Actor> => {
  const username = context.username ?? (await reddit.getCurrentUsername());
  if (context.userId && username)
    return { id: context.userId, username, authenticated: true };
  const safe =
    deviceId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'temporary';
  return {
    id: `guest:${context.loid ?? safe}`,
    username: 'Guest',
    authenticated: false,
  };
};

export const requireActor = async (deviceId: string): Promise<Actor> => {
  const actor = await getActor(deviceId);
  if (!actor.authenticated)
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue.',
    });
  return actor;
};

export const isModerator = async (): Promise<boolean> => {
  const user = await reddit.getCurrentUser();
  if (!user) return false;
  return (
    (await user.getModPermissionsForSubreddit(context.subredditName)).length > 0
  );
};

export const requireModerator = async (): Promise<void> => {
  if (!(await isModerator()))
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Moderator access required.',
    });
};

export const hashCells = (
  cells: number[],
  columns: number,
  rows: number
): string =>
  createHash('sha256')
    .update(canonicalBoard(cells, columns, rows))
    .digest('hex');

export const makeSeedBoard = (): Board => {
  const now = Date.now();
  const cells = makeSeedCells();
  return {
    id: 'rainbow-no-1',
    formatVersion: FORMAT_VERSION,
    rulesetVersion: RULESET_VERSION,
    columns: LEGACY_COLUMNS,
    rows: LEGACY_ROWS,
    cells,
    boardHash: hashCells(cells, LEGACY_COLUMNS, LEGACY_ROWS),
    gameplaySeed: gameplaySeedFor(cells, LEGACY_COLUMNS, LEGACY_ROWS),
    title: 'Rainbow No. 1',
    creatorId: `app:${context.appSlug}`,
    creatorUsername: context.appSlug.replaceAll('-', '_'),
    creatorRole: 'app',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
};

export const ensureSeedBoard = async (): Promise<Board> => {
  const existing = await getBoard('rainbow-no-1');
  if (existing) return existing;
  const seed = makeSeedBoard();
  await Promise.all([
    saveBoard(seed),
    redis.hSet(keys.boardHash, { [seed.boardHash]: seed.id }),
  ]);
  return seed;
};

export const resolveCurrentBoard = async (): Promise<Board> => {
  await ensureSeedBoard();
  const postBoardId = context.postData?.boardId;
  if (typeof postBoardId === 'string') {
    const board = await getBoard(postBoardId);
    if (board) return board;
  }
  if (context.postId) {
    const boardId = await redis.hGet(keys.postBoard, context.postId);
    if (boardId) {
      const board = await getBoard(boardId);
      if (board) return board;
    }
  }
  const seed = await getBoard('rainbow-no-1');
  if (!seed) throw new Error('Seed board unavailable.');
  return seed;
};

export const createBoardRecord = async (
  deviceId: string,
  input: unknown,
  status: Board['status'],
  existingId?: string
): Promise<Board> => {
  const actor = await requireActor(deviceId);
  const parsed = boardInputSchema.parse(input);
  const moderator = await isModerator();
  const now = Date.now();
  const boardHash = hashCells(parsed.cells, EDITOR_COLUMNS, EDITOR_ROWS);
  const existing = existingId ? await getBoard(existingId) : undefined;
  if (existing && existing.creatorId !== actor.id)
    throw new TRPCError({ code: 'FORBIDDEN' });
  if (status !== 'draft') {
    const issue = boardNameIssue(parsed.title ?? '');
    if (issue === 'offensive')
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Offensive content, please remove.',
      });
    if (issue === 'too-short')
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Name must be at least 3 chars.',
      });
    if (issue === 'too-long')
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Max title length is 22.',
      });
  }
  return {
    id: existing?.id ?? randomUUID(),
    formatVersion: FORMAT_VERSION,
    rulesetVersion: RULESET_VERSION,
    columns: EDITOR_COLUMNS,
    rows: EDITOR_ROWS,
    cells: parsed.cells,
    boardHash,
    gameplaySeed: gameplaySeedFor(parsed.cells, EDITOR_COLUMNS, EDITOR_ROWS),
    title: parsed.title?.trim() || 'Custom Art Breaker',
    creatorId: actor.id,
    creatorUsername: actor.username,
    creatorRole: moderator ? 'moderator' : 'user',
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
};

export const saveUserDraft = async (
  deviceId: string,
  input: unknown,
  boardId?: string
): Promise<Board> => {
  const board = await createBoardRecord(deviceId, input, 'draft', boardId);
  await saveDraft(board.creatorId, board);
  return board;
};

export const deleteUserDraft = async (
  deviceId: string,
  boardId: string
): Promise<{ deleted: true }> => {
  const actor = await requireActor(deviceId);
  const board = await getBoard(boardId);
  if (!board || board.creatorId !== actor.id || board.status !== 'draft') {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Draft board unavailable.',
    });
  }
  await Promise.all([
    deleteDraft(actor.id, board.id),
    redis.hDel(keys.boards, [board.id]),
  ]);
  return { deleted: true };
};

export const claimBoardHash = async (
  board: Board
): Promise<Board | undefined> => {
  const existingId = await redis.hGet(keys.boardHash, board.boardHash);
  if (existingId && existingId !== board.id) return getBoard(existingId);
  const claimKey = `ab:v1:hashClaim:${board.boardHash}`;
  const claimed = await redis.set(claimKey, board.id, {
    nx: true,
    expiration: new Date(Date.now() + 60_000),
  });
  if (claimed !== 'OK') {
    const concurrentId = await redis.get(claimKey);
    return concurrentId ? getBoard(concurrentId) : undefined;
  }
  await redis.hSet(keys.boardHash, { [board.boardHash]: board.id });
  return undefined;
};

export const boardTitle = (board: Board): string => {
  if (board.creatorRole === 'app' || board.title === 'Custom Art Breaker')
    return board.title;
  return `${board.title} by u/${board.creatorUsername}`;
};

export const stickyCommentFor = (board: Board): string =>
  board.creatorRole === 'app'
    ? "Let's go breakers! Can you get the high score? When you finish playing, submit a comment to share your score in this thread."
    : `Let's go breakers! Can you get the high score in this custom board by u/${board.creatorUsername}? When you finish playing, submit a comment to share your score in this thread.`;

export const publishBoardPost = async (
  board: Board,
  runAs: 'USER' | 'APP'
): Promise<Board> => {
  if (board.postId && board.status === 'published') return board;
  const duplicate = await claimBoardHash(board);
  if (duplicate?.permalink) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `This board is identical to one that already exists. Play it here: ${duplicate.permalink}`,
    });
  }
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: boardTitle(board),
    entry: 'default',
    postData: { boardId: board.id },
    runAs,
    ...(runAs === 'USER'
      ? {
          userGeneratedContent: {
            text: `Art Breaker board created by u/${board.creatorUsername}`,
          },
        }
      : {}),
    styles: {
      backgroundColor: '#0e0e10ff',
      backgroundColorDark: '#0e0e10ff',
      heightPixels: 512,
      shareImageUrl: SHARE_IMAGE_URL,
    },
    textFallback: {
      text: `Play ${board.title}, an Art Breaker board created by u/${board.creatorUsername}.`,
    },
  });
  const comment = await reddit.submitComment({
    id: post.id,
    runAs: 'APP',
    text: stickyCommentFor(board),
  });
  try {
    await comment.distinguish(true);
  } catch (error) {
    console.warn('Could not sticky board comment.', error);
  }
  const published: Board = {
    ...board,
    status: 'published',
    postId: post.id,
    permalink: post.permalink,
    commentId: comment.id,
    updatedAt: Date.now(),
  };
  await Promise.all([
    saveBoard(published),
    saveCommentReference(comment.id, { kind: 'sticky', boardId: board.id }),
    redis.hSet(keys.postBoard, { [post.id]: board.id }),
    redis.hSet(keys.boardPost, { [board.id]: post.id }),
    redis.zAdd(keys.published, {
      member: board.id,
      score: published.updatedAt,
    }),
    redis.zRem(keys.queue, [board.id]),
    deleteDraft(board.creatorId, board.id),
    ...(board.id === 'rainbow-no-1'
      ? [
          redis.set(keys.seedPost, post.id),
          redis.set(keys.seedComment, comment.id),
        ]
      : []),
  ]);
  return published;
};

export const publishUserBoard = async (
  deviceId: string,
  input: unknown,
  boardId?: string
): Promise<Board> => {
  const board = await createBoardRecord(deviceId, input, 'publishing', boardId);
  return publishBoardPost(board, 'USER');
};

export const queueModeratorBoard = async (
  deviceId: string,
  input: unknown,
  position: 'front' | 'back',
  boardId?: string
): Promise<Board> => {
  await requireModerator();
  const board = await createBoardRecord(deviceId, input, 'queued', boardId);
  const duplicate = await claimBoardHash(board);
  if (duplicate?.permalink)
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Duplicate: ${duplicate.permalink}`,
    });
  await enqueueBoard(board, position);
  await deleteDraft(board.creatorId, board.id);
  return board;
};

export const takeQueuedBoardForEditing = async (
  boardId: string
): Promise<Board> => {
  await requireModerator();
  const board = await getBoard(boardId);
  if (!board || board.status !== 'queued') {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Queued board unavailable.',
    });
  }
  await removeQueuedBoard(board);
  return board;
};

export const publishModeratorBoard = async (
  deviceId: string,
  input: unknown,
  boardId?: string
): Promise<Board> => {
  await requireModerator();
  const board = await createBoardRecord(deviceId, input, 'publishing', boardId);
  return publishBoardPost(board, 'USER');
};

const compareScores = (left: ScoreRecord, right: ScoreRecord): number =>
  right.score - left.score ||
  left.elapsedMs - right.elapsedMs ||
  left.achievedAt - right.achievedAt;

export const leaderboardFor = async (
  boardId: string,
  userId: string | null,
  page: number,
  candidateScore?: number
) => {
  await ensureScoreRanks(boardId);
  const offset = Math.max(0, Math.min(9, page)) * 10;
  const [ranked, totalPlayers, user] = await Promise.all([
    getRankedScores(boardId, offset, offset + 9),
    redis.zCard(keys.scoreRanks(boardId)),
    userId ? getScore(boardId, userId) : undefined,
  ]);
  const entries: LeaderboardEntry[] = ranked.map((score, index) => ({
    rank: offset + index + 1,
    username: score.username,
    score: score.score,
    elapsedMs: score.elapsedMs,
    cleared: score.cleared,
  }));
  const percentileScore = user?.score ?? candidateScore;
  const [ascendingUserRank, firstAtOrAbove] = await Promise.all([
    user
      ? redis.zRank(keys.scoreRanks(boardId), scoreRankMember(user))
      : undefined,
    percentileScore === undefined
      ? undefined
      : redis.zRange(keys.scoreRanks(boardId), percentileScore, '+inf', {
          by: 'score',
          limit: { offset: 0, count: 1 },
        }),
  ]);
  const firstAtOrAboveRank = firstAtOrAbove?.[0]
    ? await redis.zRank(keys.scoreRanks(boardId), firstAtOrAbove[0].member)
    : totalPlayers;
  const lower = firstAtOrAboveRank ?? 0;
  const comparisonPlayers = totalPlayers - (user ? 1 : 0);
  return {
    entries,
    page: Math.max(0, Math.min(9, page)),
    pages: Math.max(
      1,
      Math.min(10, Math.ceil(Math.min(100, totalPlayers) / 10))
    ),
    totalPlayers,
    currentRank:
      ascendingUserRank === undefined ? null : totalPlayers - ascendingUserRank,
    percentile:
      (user || candidateScore !== undefined) && totalPlayers
        ? comparisonPlayers === 0
          ? 100
          : Math.round((lower / comparisonPlayers) * 100)
        : null,
    best: user ?? null,
  };
};

export const submitScore = async (deviceId: string, raw: unknown) => {
  const input: ScoreInput = scoreInputSchema.parse(raw);
  const [actor, board] = await Promise.all([
    getActor(deviceId),
    getBoard(input.boardId),
  ]);
  if (!board)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Board unavailable.' });
  const brickCount = board.cells.filter(Boolean).length;
  if (
    input.brickHits > brickCount ||
    (input.cleared && input.brickHits !== brickCount) ||
    (input.accuracyHits ?? 0) > (input.accuracyAttempts ?? 0) ||
    (input.accuracyAttempts ?? 0) > input.paddleHits
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid run transcript.',
    });
  }
  let theoreticalMaximum = 0;
  for (let combo = 0; combo < brickCount; combo += 1)
    theoreticalMaximum += pointsForCombo(combo);
  const maximumWithClearBonus = scoreForClear(
    theoreticalMaximum,
    input.paddleHits,
    input.paddleHits
  );
  if (input.score > (input.cleared ? maximumWithClearBonus : theoreticalMaximum))
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid score.' });
  if (input.baseScore !== undefined) {
    const expectedScore = input.cleared
      ? scoreForClear(
          input.baseScore,
          input.accuracyHits ?? 0,
          input.accuracyAttempts ?? 0
        )
      : input.baseScore;
    if (input.baseScore > theoreticalMaximum || input.score !== expectedScore)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid score.' });
  }
  if (!actor.authenticated) {
    return {
      saved: false,
      user: {
        username: null,
        authenticated: false,
        subscribed: false,
      },
      leaderboard: await leaderboardFor(board.id, null, 0, input.score),
    };
  }
  const record: ScoreRecord = {
    ...input,
    userId: actor.id,
    username: actor.username,
    achievedAt: Date.now(),
  };
  await ensureScoreRanks(board.id);
  const existing = await getScore(board.id, actor.id);
  if (!existing || compareScores(record, existing) < 0) await saveScore(record);
  const [leaderboard, subscribed] = await Promise.all([
    leaderboardFor(board.id, actor.id, 0),
    redis.hGet(keys.subscriptions, actor.id),
  ]);
  return {
    saved: true,
    user: {
      username: actor.username,
      authenticated: true,
      subscribed: subscribed === 'yes',
    },
    leaderboard,
  };
};

export const bootstrap = async (deviceId: string) => {
  const [board, actor] = await Promise.all([
    resolveCurrentBoard(),
    getActor(deviceId),
  ]);
  const ranking = await leaderboardFor(
    board.id,
    actor.authenticated ? actor.id : null,
    0
  );
  return {
    board,
    user: {
      username: actor.authenticated ? actor.username : null,
      authenticated: actor.authenticated,
    },
    subredditName: context.subredditName,
    postId: context.postId,
    ranking,
  };
};

export const sessionSummary = async (deviceId: string) => {
  const actor = await getActor(deviceId);
  return {
    user: {
      username: actor.authenticated ? actor.username : null,
      authenticated: actor.authenticated,
    },
    subredditName: context.subredditName,
    postId: context.postId,
  };
};

export const editorSession = async (deviceId: string) => {
  const actor = await getActor(deviceId);
  const moderator = actor.authenticated ? await isModerator() : false;
  return {
    user: {
      username: actor.authenticated ? actor.username : null,
      authenticated: actor.authenticated,
      moderator,
    },
    subredditName: context.subredditName,
    postId: context.postId,
  };
};

export const myBoards = async (deviceId: string) => {
  const actor = await requireActor(deviceId);
  const all = await getBoards();
  return {
    drafts: await getDrafts(actor.id),
    published: all
      .filter(
        (board) => board.creatorId === actor.id && board.status === 'published'
      )
      .sort((a, b) => b.updatedAt - a.updatedAt),
    queued: all
      .filter(
        (board) => board.creatorId === actor.id && board.status === 'queued'
      )
      .sort((a, b) => a.updatedAt - b.updatedAt),
  };
};

export const discoverBoards = async (
  currentId: string,
  page: number,
  take: number
) => {
  const [seed, indexedIds] = await Promise.all([
    ensureSeedBoard(),
    getPublishedBoardIds(),
  ]);
  const safeTake = Math.min(6, Math.max(4, take));
  const pageLimit = 25;
  const boardLimit = pageLimit * safeTake;
  const publishedIds = indexedIds.filter(
    (boardId) => boardId !== currentId && boardId !== seed.id
  );
  if (
    publishedIds.length < boardLimit &&
    currentId !== seed.id &&
    seed.status === 'published' &&
    seed.permalink
  )
    publishedIds.push(seed.id);
  const safePage = Math.min(pageLimit - 1, Math.max(0, page));
  const pageIds = publishedIds.slice(
    safePage * safeTake,
    safePage * safeTake + safeTake
  );
  const pageBoards = await getBoardsById(pageIds);
  const boardsById = new Map(pageBoards.map((board) => [board.id, board]));
  return {
    boards: pageIds.flatMap((boardId) => {
      const board = boardsById.get(boardId);
      return board?.postId && board.permalink && board.status === 'published'
        ? [board]
        : [];
    }),
    page: safePage,
    pages: Math.max(
      1,
      Math.min(pageLimit, Math.ceil(publishedIds.length / safeTake))
    ),
  };
};

export const adminOverview = async () => {
  await requireModerator();
  return {
    queue: await getQueue(),
    recent: (await getPublishedBoards()).slice(0, 400),
  };
};
