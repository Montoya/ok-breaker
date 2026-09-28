import { initTRPC, TRPCError } from '@trpc/server';
import { context, reddit, redis } from '@devvit/web/server';
import { T1 } from '@devvit/shared-types/tid.js';
import { z } from 'zod';
import { transformer } from '../shared/transformer';
import {
  boardInputSchema,
  formatAutomaticScoreComment,
  scoreInputSchema,
  type Board,
} from '../shared/game';
import type { Context } from './context';
import {
  adminOverview,
  bootstrap,
  deleteUserDraft,
  discoverBoards,
  editorSession,
  leaderboardFor,
  myBoards,
  publishModeratorBoard,
  publishUserBoard,
  queueModeratorBoard,
  requireActor,
  requireModerator,
  resolveCurrentBoard,
  saveUserDraft,
  sessionSummary,
  submitScore,
  takeQueuedBoardForEditing,
} from './core/service';
import { getBoard, keys, saveCommentReference } from './core/store';
import { publishQueuedBoardNow } from './core/publication';

const t = initTRPC.context<Context>().create({ transformer });
export const router = t.router;
export const publicProcedure = t.procedure;

const deviceInput = z.object({ deviceId: z.string().min(8).max(100) });
const editableBoardInput = deviceInput.extend({
  boardId: z.string().uuid().optional(),
  board: boardInputSchema,
});

export const scoreCommentParentId = (board: Pick<Board, 'commentId'>) => {
  if (!board.commentId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'The score thread is unavailable.',
    });
  }
  return T1(board.commentId);
};

export const appRouter = t.router({
  bootstrap: publicProcedure
    .input(deviceInput)
    .query(({ input }) => bootstrap(input.deviceId)),
  session: t.router({
    summary: publicProcedure
      .input(deviceInput)
      .query(({ input }) => sessionSummary(input.deviceId)),
    editor: publicProcedure
      .input(deviceInput)
      .query(({ input }) => editorSession(input.deviceId)),
  }),
  boards: t.router({
    saveDraft: publicProcedure
      .input(editableBoardInput)
      .mutation(({ input }) =>
        saveUserDraft(input.deviceId, input.board, input.boardId)
      ),
    deleteDraft: publicProcedure
      .input(deviceInput.extend({ boardId: z.string().uuid() }))
      .mutation(({ input }) => deleteUserDraft(input.deviceId, input.boardId)),
    publish: publicProcedure
      .input(editableBoardInput)
      .mutation(({ input }) =>
        publishUserBoard(input.deviceId, input.board, input.boardId)
      ),
    publishNow: publicProcedure
      .input(editableBoardInput)
      .mutation(({ input }) =>
        publishModeratorBoard(input.deviceId, input.board, input.boardId)
      ),
    addToQueue: publicProcedure
      .input(editableBoardInput.extend({ position: z.enum(['front', 'back']) }))
      .mutation(({ input }) =>
        queueModeratorBoard(
          input.deviceId,
          input.board,
          input.position,
          input.boardId
        )
      ),
    mine: publicProcedure
      .input(deviceInput)
      .query(({ input }) => myBoards(input.deviceId)),
    discover: publicProcedure
      .input(
        deviceInput.extend({
          currentId: z.string().min(1).max(100),
          page: z.number().int().min(0).max(24),
          take: z.union([z.literal(4), z.literal(6)]),
        })
      )
      .query(({ input }) =>
        discoverBoards(input.currentId, input.page, input.take)
      ),
  }),
  scores: t.router({
    submit: publicProcedure
      .input(deviceInput.extend({ run: scoreInputSchema }))
      .mutation(({ input }) => submitScore(input.deviceId, input.run)),
    leaderboard: publicProcedure
      .input(
        deviceInput.extend({
          boardId: z.string().min(1).max(100),
          page: z.number().int().min(0).max(9),
        })
      )
      .query(async ({ input }) => {
        const actor = await requireActor(input.deviceId).catch(() => null);
        return leaderboardFor(input.boardId, actor?.id ?? null, input.page);
      }),
  }),
  social: t.router({
    join: publicProcedure.input(deviceInput).mutation(async ({ input }) => {
      const actor = await requireActor(input.deviceId);
      await reddit.subscribeToCurrentSubreddit();
      await redis.hSet(keys.subscriptions, { [actor.id]: 'yes' });
      return { joined: true };
    }),
    comment: publicProcedure
      .input(
        deviceInput.extend({
          boardId: z.string().min(1).max(100),
          customText: z.string().trim().max(500),
          score: z.number().int().nonnegative(),
          elapsedMs: z.number().int().nonnegative().max(3_600_000),
          cleared: z.boolean(),
          submissionId: z.string().uuid(),
        })
      )
      .mutation(async ({ input }) => {
        const actor = await requireActor(input.deviceId);
        const board = await getBoard(input.boardId);
        if (!board?.postId)
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Board post unavailable.',
          });
        const existing = await redis.hGet(
          keys.comments(board.id),
          input.submissionId
        );
        if (existing) return { commentId: existing };
        const claimKey = `ab:v1:commentClaim:${board.id}:${actor.id}:${input.submissionId}`;
        const claim = await redis.set(claimKey, 'pending', {
          nx: true,
          expiration: new Date(Date.now() + 60_000),
        });
        if (claim !== 'OK')
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Comment is already being submitted.',
          });
        try {
          const automatic = formatAutomaticScoreComment(
            input.score,
            input.elapsedMs,
            input.cleared
          );
          const text = input.customText
            ? `${input.customText}\n\n${automatic}`
            : automatic;
          const comment = await reddit.submitComment({
            id: scoreCommentParentId(board),
            text,
            runAs: 'USER',
          });
          await Promise.all([
            redis.hSet(keys.comments(board.id), {
              [input.submissionId]: comment.id,
            }),
            saveCommentReference(comment.id, {
              kind: 'score',
              boardId: board.id,
              submissionId: input.submissionId,
            }),
          ]);
          return { commentId: comment.id };
        } finally {
          await redis.del(claimKey);
        }
      }),
  }),
  admin: t.router({
    overview: publicProcedure
      .input(deviceInput)
      .query(() => adminOverview()),
    removeQueued: publicProcedure
      .input(deviceInput.extend({ boardId: z.string().uuid() }))
      .mutation(({ input }) => takeQueuedBoardForEditing(input.boardId)),
    publishQueued: publicProcedure
      .input(deviceInput.extend({ boardId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireModerator();
        return publishQueuedBoardNow(input.boardId);
      }),
  }),
  current: t.router({
    board: publicProcedure.query(() => resolveCurrentBoard()),
    post: publicProcedure.query(() => ({
      postId: context.postId,
      subredditName: context.subredditName,
    })),
  }),
});

export type AppRouter = typeof appRouter;
