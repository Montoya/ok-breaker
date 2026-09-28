import { redis } from '@devvit/web/server';
import { z } from 'zod';
import {
  boardSchema,
  scoreRecordSchema,
  type Board,
  type ScoreRecord,
} from '../../shared/game';

const commentReferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('score'),
    boardId: z.string(),
    submissionId: z.string(),
  }),
  z.object({ kind: z.literal('sticky'), boardId: z.string() }),
]);
export type CommentReference = z.infer<typeof commentReferenceSchema>;

export const keys = {
  boards: 'ab:v1:boards',
  postBoard: 'ab:v1:postBoard',
  boardPost: 'ab:v1:boardPost',
  boardHash: 'ab:v1:boardHash',
  published: 'ab:v1:published',
  queue: 'ab:v1:queue',
  publishedDays: 'ab:v1:publishedDays',
  seedPost: 'ab:v1:seedPost',
  seedComment: 'ab:v1:seedComment',
  subscriptions: 'ab:v1:subscriptions',
  commentRefs: 'ab:v1:commentRefs',
  drafts: (userId: string) => `ab:v1:drafts:${userId}`,
  scores: (boardId: string) => `ab:v1:scores:${boardId}`,
  scoreRanks: (boardId: string) => `ab:v1:scoreRanks:${boardId}`,
  scoreRanksReady: (boardId: string) => `ab:v1:scoreRanksReady:${boardId}`,
  comments: (boardId: string) => `ab:v1:comments:${boardId}`,
};

const parseStored = <T>(
  value: string | undefined,
  parser: (input: unknown) => T
): T | undefined => {
  if (!value) return undefined;
  try {
    return parser(JSON.parse(value));
  } catch (error) {
    console.error('Ignoring invalid Art Breaker record.', error);
    return undefined;
  }
};

export const getBoard = async (id: string): Promise<Board | undefined> =>
  parseStored(await redis.hGet(keys.boards, id), (input) =>
    boardSchema.parse(input)
  );

export const saveBoard = async (board: Board): Promise<void> => {
  await redis.hSet(keys.boards, {
    [board.id]: JSON.stringify(boardSchema.parse(board)),
  });
};

export const getBoards = async (): Promise<Board[]> => {
  const stored = Object.values(await redis.hGetAll(keys.boards));
  return stored.flatMap((value) => {
    const board = parseStored(value, (input) => boardSchema.parse(input));
    return board ? [board] : [];
  });
};

export const getBoardsById = async (ids: string[]): Promise<Board[]> => {
  if (!ids.length) return [];
  const stored = await redis.hMGet(keys.boards, ids);
  return stored.flatMap((value) => {
    const board = parseStored(value ?? undefined, (input) =>
      boardSchema.parse(input)
    );
    return board ? [board] : [];
  });
};

export const getPublishedBoardIds = async (): Promise<string[]> =>
  (
    await redis.zRange(keys.published, 0, -1, {
      by: 'rank',
      reverse: true,
    })
  ).map(({ member }) => member);

export const getPublishedBoards = async (): Promise<Board[]> => {
  const boards = await getBoardsById(await getPublishedBoardIds());
  return boards.filter((board): board is Board =>
    Boolean(board?.postId && board.permalink && board.status === 'published')
  );
};

export const saveDraft = async (
  userId: string,
  board: Board
): Promise<void> => {
  await Promise.all([
    saveBoard(board),
    redis.hSet(keys.drafts(userId), { [board.id]: JSON.stringify(board) }),
  ]);
};

export const deleteDraft = async (
  userId: string,
  boardId: string
): Promise<void> => {
  await redis.hDel(keys.drafts(userId), [boardId]);
};

export const getDrafts = async (userId: string): Promise<Board[]> => {
  const stored = Object.values(await redis.hGetAll(keys.drafts(userId)));
  return stored
    .flatMap((value) => {
      const board = parseStored(value, (input) => boardSchema.parse(input));
      return board ? [board] : [];
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
};

export const getQueue = async (): Promise<Board[]> => {
  const members = await redis.zRange(keys.queue, 0, -1, { by: 'rank' });
  const boards = await Promise.all(
    members.map(({ member }) => getBoard(member))
  );
  return boards.filter((board): board is Board => board?.status === 'queued');
};

export const enqueueBoard = async (
  board: Board,
  position: 'front' | 'back'
): Promise<void> => {
  const queue = await redis.zRange(keys.queue, 0, -1, { by: 'rank' });
  if (!queue.some(({ member }) => member === board.id)) {
    const scores = queue.map(({ score }) => score);
    const score =
      position === 'front'
        ? Math.min(0, ...scores) - 1
        : Math.max(0, ...scores) + 1;
    await redis.zAdd(keys.queue, { member: board.id, score });
  }
  await saveBoard(board);
};

export const removeQueuedBoard = async (board: Board): Promise<void> => {
  await Promise.all([
    redis.zRem(keys.queue, [board.id]),
    redis.hDel(keys.boards, [board.id]),
    redis.hDel(keys.boardHash, [board.boardHash]),
    redis.del(`ab:v1:hashClaim:${board.boardHash}`),
  ]);
};

export const getScores = async (boardId: string): Promise<ScoreRecord[]> => {
  const stored = Object.values(await redis.hGetAll(keys.scores(boardId)));
  return stored.flatMap((value) => {
    const score = parseStored(value, (input) => scoreRecordSchema.parse(input));
    return score ? [score] : [];
  });
};

export const getScore = async (
  boardId: string,
  userId: string
): Promise<ScoreRecord | undefined> =>
  parseStored(await redis.hGet(keys.scores(boardId), userId), (input) =>
    scoreRecordSchema.parse(input)
  );

const invertedRankPart = (maximum: number, value: number, width: number) =>
  Math.max(0, maximum - value)
    .toString()
    .padStart(width, '0');

export const scoreRankMember = (score: ScoreRecord): string =>
  `${invertedRankPart(3_600_000, score.elapsedMs, 7)}:${invertedRankPart(Number.MAX_SAFE_INTEGER, score.achievedAt, 16)}:${Buffer.from(score.userId).toString('base64url')}`;

const userIdFromScoreRankMember = (member: string): string | undefined => {
  const encoded = member.split(':', 3)[2];
  if (!encoded) return undefined;
  try {
    return Buffer.from(encoded, 'base64url').toString();
  } catch {
    return undefined;
  }
};

export const saveScore = async (score: ScoreRecord): Promise<void> => {
  const parsed = scoreRecordSchema.parse(score);
  const previous = await getScore(parsed.boardId, parsed.userId);
  const nextMember = scoreRankMember(parsed);
  await Promise.all([
    redis.hSet(keys.scores(parsed.boardId), {
      [parsed.userId]: JSON.stringify(parsed),
    }),
    redis.zAdd(keys.scoreRanks(parsed.boardId), {
      member: nextMember,
      score: parsed.score,
    }),
    ...(previous && scoreRankMember(previous) !== nextMember
      ? [
          redis.zRem(keys.scoreRanks(parsed.boardId), [
            scoreRankMember(previous),
          ]),
        ]
      : []),
  ]);
};

export const ensureScoreRanks = async (boardId: string): Promise<void> => {
  if (await redis.get(keys.scoreRanksReady(boardId))) return;
  const scores = await getScores(boardId);
  if (scores.length)
    await redis.zAdd(
      keys.scoreRanks(boardId),
      ...scores.map((score) => ({
        member: scoreRankMember(score),
        score: score.score,
      }))
    );
  await redis.set(keys.scoreRanksReady(boardId), 'yes');
};

export const getRankedScores = async (
  boardId: string,
  start: number,
  stop: number
): Promise<ScoreRecord[]> => {
  const ranked = await redis.zRange(keys.scoreRanks(boardId), start, stop, {
    by: 'rank',
    reverse: true,
  });
  const userIds = ranked.flatMap(({ member }) => {
    const userId = userIdFromScoreRankMember(member);
    return userId ? [userId] : [];
  });
  if (!userIds.length) return [];
  const stored = await redis.hMGet(keys.scores(boardId), userIds);
  return stored.flatMap((value) => {
    const score = parseStored(value ?? undefined, (input) =>
      scoreRecordSchema.parse(input)
    );
    return score ? [score] : [];
  });
};

export const saveCommentReference = async (
  commentId: string,
  reference: CommentReference
): Promise<void> => {
  await redis.hSet(keys.commentRefs, {
    [commentId]: JSON.stringify(commentReferenceSchema.parse(reference)),
  });
};

const removePublishedDayReferences = async (postId: string): Promise<void> => {
  const days = await redis.hGetAll(keys.publishedDays);
  const matchingDays = Object.entries(days)
    .filter(([, publishedPostId]) => publishedPostId === postId)
    .map(([day]) => day);
  if (matchingDays.length) await redis.hDel(keys.publishedDays, matchingDays);
};

export const deleteBoardForPost = async (postId: string): Promise<boolean> => {
  const indexedBoardId = await redis.hGet(keys.postBoard, postId);
  const board = indexedBoardId
    ? await getBoard(indexedBoardId)
    : (await getBoards()).find((candidate) => candidate.postId === postId);
  const boardId = indexedBoardId ?? board?.id;

  await removePublishedDayReferences(postId);
  if (!boardId) {
    await redis.hDel(keys.postBoard, [postId]);
    return false;
  }

  const scoreCommentIds = Object.values(
    await redis.hGetAll(keys.comments(boardId))
  );
  const commentIds = [
    ...new Set([
      ...scoreCommentIds,
      ...(board?.commentId ? [board.commentId] : []),
    ]),
  ];
  const cleanup: Promise<unknown>[] = [
    redis.hDel(keys.boards, [boardId]),
    redis.hDel(keys.postBoard, [postId]),
    redis.hDel(keys.boardPost, [boardId]),
    redis.zRem(keys.published, [boardId]),
    redis.zRem(keys.queue, [boardId]),
    redis.del(keys.scores(boardId)),
    redis.del(keys.scoreRanks(boardId)),
    redis.del(keys.scoreRanksReady(boardId)),
    redis.del(keys.comments(boardId)),
  ];
  if (commentIds.length) cleanup.push(redis.hDel(keys.commentRefs, commentIds));
  if (board) {
    cleanup.push(
      redis.hDel(keys.boardHash, [board.boardHash]),
      redis.del(`ab:v1:hashClaim:${board.boardHash}`),
      redis.hDel(keys.drafts(board.creatorId), [boardId])
    );
  }
  if (boardId === 'rainbow-no-1') {
    cleanup.push(redis.del(keys.seedPost), redis.del(keys.seedComment));
  }
  await Promise.all(cleanup);
  return true;
};

export const deleteCommentReference = async (
  commentId: string,
  postId: string
): Promise<boolean> => {
  const storedReference = parseStored(
    await redis.hGet(keys.commentRefs, commentId),
    (input) => commentReferenceSchema.parse(input)
  );
  const boardId =
    storedReference?.boardId ?? (await redis.hGet(keys.postBoard, postId));
  let removed = Boolean(storedReference);

  if (boardId) {
    const board = await getBoard(boardId);
    if (storedReference?.kind === 'score') {
      await redis.hDel(keys.comments(boardId), [storedReference.submissionId]);
    } else if (!storedReference) {
      const comments = await redis.hGetAll(keys.comments(boardId));
      const matchingSubmissions = Object.entries(comments)
        .filter(([, storedCommentId]) => storedCommentId === commentId)
        .map(([submissionId]) => submissionId);
      if (matchingSubmissions.length) {
        await redis.hDel(keys.comments(boardId), matchingSubmissions);
        removed = true;
      }
    }
    if (board?.commentId === commentId) {
      const updated = { ...board };
      delete updated.commentId;
      await saveBoard(updated);
      removed = true;
    }
  }

  if ((await redis.get(keys.seedComment)) === commentId) {
    await redis.del(keys.seedComment);
    removed = true;
  }
  await redis.hDel(keys.commentRefs, [commentId]);
  return removed;
};
