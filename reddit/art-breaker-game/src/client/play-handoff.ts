import { z } from 'zod';
import { boardSchema, type Board } from '../shared/game';

const PLAY_HANDOFF_KEY = 'art-breaker-play-handoff';
const PLAY_HANDOFF_VERSION = 1;
const PLAY_HANDOFF_MAX_AGE_MS = 30_000;

const playHandoffSchema = z.object({
  version: z.literal(PLAY_HANDOFF_VERSION),
  createdAt: z.number().int().nonnegative(),
  postId: z.string().min(1),
  board: boardSchema,
});

export const cachePlayBoard = (
  board: Board,
  postId: string,
  createdAt = Date.now()
): void => {
  try {
    localStorage.setItem(
      PLAY_HANDOFF_KEY,
      JSON.stringify({
        version: PLAY_HANDOFF_VERSION,
        createdAt,
        postId,
        board,
      })
    );
  } catch {
    // Expanded Play can fall back to the server when storage is unavailable.
  }
};

export const readCachedPlayBoard = (
  postId: string | undefined,
  now = Date.now()
): Board | null => {
  if (!postId) return null;
  try {
    const stored = localStorage.getItem(PLAY_HANDOFF_KEY);
    if (!stored) return null;
    const parsed = playHandoffSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) return null;
    if (parsed.data.postId !== postId) return null;
    if (now - parsed.data.createdAt > PLAY_HANDOFF_MAX_AGE_MS) return null;
    return parsed.data.board;
  } catch {
    return null;
  }
};
