import { z } from 'zod';

export const FORMAT_VERSION = 2;
export const RULESET_VERSION = 1;
export const LEGACY_COLUMNS = 18;
export const LEGACY_ROWS = 16;
export const EDITOR_COLUMNS = 20;
export const EDITOR_ROWS = 18;
export const CELL_SIZE = 20;
export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 700;
export const DEFAULT_BOARD_Y = 28;
export const CLEAR_SCORE_MULTIPLIER = 1.25;

export const PALETTE = [
  { name: 'Red', hex: '#ff4554' },
  { name: 'Orange', hex: '#ff8a32' },
  { name: 'Yellow', hex: '#ffe14a' },
  { name: 'Lime', hex: '#b6ff3b' },
  { name: 'Green', hex: '#38df75' },
  { name: 'Cyan', hex: '#35d9ff' },
  { name: 'Blue', hex: '#4387ff' },
  { name: 'Violet', hex: '#8f6bff' },
  { name: 'Magenta', hex: '#df4dff' },
  { name: 'Hot Pink', hex: '#ff3da5' },
  { name: 'Gray', hex: '#92939c' },
  { name: 'White', hex: '#f6f4eb' },
  { name: 'Pink', hex: '#ff91c8' },
  { name: 'Brown', hex: '#9a5b3f' },
] as const;

export const EDITOR_PALETTE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14, 11, 12] as const;

export const powerUpNames = ['wide', 'narrow', 'slow', 'shield', 'laser', 'fast', 'multi', 'fire', 'chain'] as const;
export type PowerUpName = (typeof powerUpNames)[number];

export const POWER_UPS: Record<PowerUpName, {
  label: string;
  color: string;
  displayName: string;
  weight: number;
  duration: number | null;
}> = {
  wide: { label: 'W', color: '#b6ff3b', displayName: 'WIDE', weight: 15, duration: 15 },
  narrow: { label: 'N', color: '#b6ff3b', displayName: 'NARROW', weight: 15, duration: 10 },
  slow: { label: 'S', color: '#ff4554', displayName: 'SLOW', weight: 10, duration: 15 },
  shield: { label: 'B', color: '#35d9ff', displayName: 'SAFETY BAR', weight: 15, duration: 15 },
  laser: { label: 'L', color: '#ff3da5', displayName: 'LASER', weight: 10, duration: 8 },
  fast: { label: 'F', color: '#ffe14a', displayName: 'FAST', weight: 10, duration: 10 },
  multi: { label: 'M', color: '#f6f4eb', displayName: 'MULTI-BALL', weight: 10, duration: null },
  fire: { label: '🔥', color: '#ff8a32', displayName: 'FIREBALL', weight: 10, duration: null },
  chain: { label: '⚡', color: '#92939c', displayName: 'CHAIN LIGHTNING', weight: 5, duration: 10 },
};

const boardBaseSchema = z.object({
  id: z.string().min(1).max(100),
  formatVersion: z.literal(FORMAT_VERSION),
  rulesetVersion: z.literal(RULESET_VERSION),
  columns: z.union([z.literal(LEGACY_COLUMNS), z.literal(EDITOR_COLUMNS)]),
  rows: z.union([z.literal(LEGACY_ROWS), z.literal(EDITOR_ROWS)]),
  cells: z.array(z.number().int().min(0).max(PALETTE.length)).max(EDITOR_COLUMNS * EDITOR_ROWS),
  boardHash: z.string().min(8).max(64),
  gameplaySeed: z.string().regex(/^[0-9a-f]{8}$/),
  title: z.string().trim().min(1).max(100),
  creatorId: z.string().min(1).max(100),
  creatorUsername: z.string().min(1).max(50),
  creatorRole: z.enum(['app', 'moderator', 'user']),
  status: z.enum(['draft', 'queued', 'publishing', 'published', 'failed']),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  postId: z.string().optional(),
  permalink: z.string().optional(),
  commentId: z.string().optional(),
  lastError: z.string().optional(),
});

export const boardSchema = boardBaseSchema.superRefine((board, refinement) => {
  if (board.columns * board.rows !== board.cells.length) {
    refinement.addIssue({ code: 'custom', message: 'Board dimensions do not match its cells.' });
  }
  if (board.columns === LEGACY_COLUMNS && board.rows !== LEGACY_ROWS) {
    refinement.addIssue({ code: 'custom', message: 'Unsupported legacy dimensions.' });
  }
  if (board.columns === EDITOR_COLUMNS && board.rows !== EDITOR_ROWS) {
    refinement.addIssue({ code: 'custom', message: 'Unsupported editor dimensions.' });
  }
  if (!board.cells.some((value) => value > 0)) {
    refinement.addIssue({ code: 'custom', message: 'A board needs at least one brick.' });
  }
});

export type Board = z.infer<typeof boardSchema>;

export const boardInputSchema = z.object({
  cells: z.array(z.number().int().min(0).max(PALETTE.length)).length(EDITOR_COLUMNS * EDITOR_ROWS),
  title: z.string().trim().max(100).optional(),
});

export const scoreInputSchema = z.object({
  boardId: z.string().min(1).max(100),
  score: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  baseScore: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  elapsedMs: z.number().int().min(0).max(3_600_000),
  cleared: z.boolean(),
  brickHits: z.number().int().min(0).max(EDITOR_COLUMNS * EDITOR_ROWS),
  paddleHits: z.number().int().min(0).max(100_000),
  accuracyHits: z.number().int().min(0).max(100_000).optional(),
  accuracyAttempts: z.number().int().min(0).max(100_000).optional(),
  pickups: z.number().int().min(0).max(1000),
});

export type ScoreInput = z.infer<typeof scoreInputSchema>;

export const scoreRecordSchema = scoreInputSchema.extend({
  userId: z.string().min(1).max(100),
  username: z.string().min(1).max(50),
  achievedAt: z.number().int().nonnegative(),
});
export type ScoreRecord = z.infer<typeof scoreRecordSchema>;

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
  elapsedMs: number;
  cleared: boolean;
};

export const makeSeedCells = (): number[] => {
  const rainbow = [1, 2, 3, 5, 6, 7, 8];
  const cells = new Array<number>(LEGACY_COLUMNS * LEGACY_ROWS).fill(0);
  for (let row = 2; row < LEGACY_ROWS; row += 1) {
    for (let column = 1; column < LEGACY_COLUMNS - 1; column += 1) {
      cells[row * LEGACY_COLUMNS + column] = rainbow[(row - 2) % rainbow.length] ?? 1;
    }
  }
  return cells;
};

export const canonicalBoard = (cells: number[], columns: number, rows: number): string =>
  `v${FORMAT_VERSION}:${columns}x${rows}:${cells.map((value) => value.toString(16)).join('')}`;

export const gameplaySeedFor = (cells: number[], columns: number, rows: number): string => {
  const input = canonicalBoard(cells, columns, rows);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const seededRandom = (seed: string): (() => number) => {
  let state = Number.parseInt(seed.slice(0, 8), 16) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
};

export const makePowerPlan = (board: Board): Map<number, PowerUpName> => {
  const occupied = board.cells.flatMap((value, index) => value > 0 ? [{ index }] : []);
  const target = occupied.length >= 12 ? Math.min(11, Math.max(1, Math.round(occupied.length / 18))) : 0;
  const random = seededRandom(board.gameplaySeed);
  const shuffled = [...occupied];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const currentValue = shuffled[index];
    const otherValue = shuffled[other];
    if (!currentValue || !otherValue) continue;
    shuffled[index] = otherValue;
    shuffled[other] = currentValue;
  }
  const chosen: { index: number }[] = [];
  for (const candidate of shuffled) {
    const row = Math.floor(candidate.index / board.columns);
    if (chosen.every((cell) => Math.abs(Math.floor(cell.index / board.columns) - row) >= 2)
      || shuffled.length - chosen.length <= target) chosen.push(candidate);
    if (chosen.length === target) break;
  }
  while (chosen.length < target) {
    const fallback = shuffled.find((cell) => !chosen.some((item) => item.index === cell.index));
    if (!fallback) break;
    chosen.push(fallback);
  }
  return new Map(chosen.map((cell) => {
    let roll = random() * 100;
    let type: PowerUpName = 'wide';
    for (const candidate of powerUpNames) {
      roll -= POWER_UPS[candidate].weight;
      if (roll < 0) { type = candidate; break; }
    }
    return [cell.index, type];
  }));
};

export const pointsForCombo = (comboBeforeHit: number): number =>
  Math.round(100 * 1.15 ** comboBeforeHit);

export const accuracyFor = (hits: number, attempts: number): number =>
  attempts > 0
    ? Math.floor(Math.max(0, Math.min(1, hits / attempts)) * 10_000) / 10_000
    : 0;

export const formatAccuracyPercent = (accuracy: number): string =>
  `${(Math.max(0, Math.min(1, accuracy)) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

export type AccuracyAttempt = 'none' | 'pending' | 'hit';

export const resolveAccuracyAttempt = (
  attempt: AccuracyAttempt,
  countMiss: boolean
): { hits: number; attempts: number } => {
  if (attempt === 'hit') return { hits: 1, attempts: 1 };
  if (attempt === 'pending' && countMiss) return { hits: 0, attempts: 1 };
  return { hits: 0, attempts: 0 };
};

export const scoreForClear = (
  baseScore: number,
  accuracyHits: number,
  accuracyAttempts: number
): number =>
  Math.round(
    baseScore *
      CLEAR_SCORE_MULTIPLIER *
      (1 + accuracyFor(accuracyHits, accuracyAttempts))
  );

export const formatTime = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatAutomaticScoreComment = (
  score: number,
  elapsedMs: number,
  cleared: boolean
): string =>
  `${score.toLocaleString('en-US')} points in ${formatTime(elapsedMs)}${cleared ? ' | Cleared!' : ''}`;
