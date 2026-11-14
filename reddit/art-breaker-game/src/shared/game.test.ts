import { describe, expect, it } from 'vitest';
import { CLEAR_SCORE_MULTIPLIER, EDITOR_COLUMNS, EDITOR_PALETTE_PAGES, EDITOR_ROWS, FORMAT_VERSION, LEGACY_COLUMNS, LEGACY_ROWS, PALETTE, POWER_UPS, accuracyFor, boardInputSchema, boardSchema, canonicalBoard, formatAccuracyPercent, formatAutomaticScoreComment, formatScore, gameplaySeedFor, makePowerPlan, makeSeedCells, pointsForCombo, resolveAccuracyAttempt, scoreForClear, scoreSchema } from './game';

describe('shared game rules', () => {
  it('keeps the seven-color seed stable', () => {
    const cells = makeSeedCells();
    expect(cells).toHaveLength(LEGACY_COLUMNS * LEGACY_ROWS);
    expect(gameplaySeedFor(cells, LEGACY_COLUMNS, LEGACY_ROWS)).toBe('ab56a7ef');
    expect(canonicalBoard(cells, LEGACY_COLUMNS, LEGACY_ROWS)).toContain(`v${FORMAT_VERSION}:18x16:`);
  });

  it('keeps new boards at 20 by 18', () => {
    expect(EDITOR_COLUMNS * EDITOR_ROWS).toBe(360);
  });

  it('keeps existing color IDs stable and exposes all 26 colors across two pages', () => {
    expect(PALETTE[13]).toEqual({ name: 'Brown', hex: '#9a5b3f' });
    expect(PALETTE).toHaveLength(26);
    expect(EDITOR_PALETTE_PAGES.map((page) => page.length)).toEqual([13, 13]);
    expect(EDITOR_PALETTE_PAGES[1][12]).toBe(14);
    expect([...EDITOR_PALETTE_PAGES.flat()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 26 }, (_, index) => index + 1)
    );
    expect(boardInputSchema.safeParse({
      cells: new Array<number>(EDITOR_COLUMNS * EDITOR_ROWS).fill(26),
    }).success).toBe(true);
  });

  it('keeps old board seeds stable and encodes new color IDs unambiguously', () => {
    expect(canonicalBoard([1, 14], 2, 1)).toBe('v2:2x1:1e');
    expect(canonicalBoard([1, 16], 2, 1)).not.toBe(canonicalBoard([17, 0], 2, 1));
    expect(canonicalBoard([1, 16], 2, 1)).toBe('v2:2x1:wide:0110');
  });

  it('keeps power-up weights and durations stable', () => {
    expect(Object.values(POWER_UPS).reduce((total, item) => total + item.weight, 0)).toBe(100);
    expect(POWER_UPS.slow.duration).toBe(15);
    expect(POWER_UPS.laser.duration).toBe(8);
    expect(POWER_UPS.shield.duration).toBe(15);
  });

  it('matches the approved prototype power-up plan for the rainbow board', () => {
    const cells = makeSeedCells();
    const board = boardSchema.parse({
      id: 'seed', formatVersion: 2, rulesetVersion: 1, columns: 18, rows: 16, cells,
      boardHash: 'ab56a7ef', gameplaySeed: 'ab56a7ef', title: 'Rainbow No. 1',
      creatorId: 'app', creatorUsername: 'art_breaker_game', creatorRole: 'app', status: 'published',
      createdAt: 0, updatedAt: 0,
    });
    expect([...makePowerPlan(board)]).toEqual([
      [237, 'shield'], [203, 'narrow'], [114, 'slow'], [55, 'shield'], [158, 'fire'], [283, 'shield'],
      [259, 'narrow'], [131, 'shield'], [76, 'chain'], [132, 'narrow'], [240, 'slow'],
    ]);
  });

  it('compounds combo points', () => {
    expect(pointsForCombo(0)).toBe(100n);
    expect(pointsForCombo(1)).toBe(115n);
    expect(pointsForCombo(10)).toBeGreaterThan(400n);
    expect(pointsForCombo(300)).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it('preserves scores above the safe integer range as decimal strings', () => {
    const score = '28517864280727814000';
    expect(scoreSchema.parse(score)).toBe(score);
    expect(scoreSchema.safeParse(Number(score)).success).toBe(false);
    expect(formatScore(score)).toBe('28,517,864,280,727,814,000');
    expect(scoreForClear(score, 4, 4)).toBe(71_294_660_701_819_535_000n);
  });

  it('applies the clear and accuracy bonuses to the base score', () => {
    expect(CLEAR_SCORE_MULTIPLIER).toBe(1.25);
    expect(accuracyFor(0, 0)).toBe(0);
    expect(accuracyFor(3, 4)).toBe(0.75);
    expect(accuracyFor(75_968, 100_000)).toBe(0.7596);
    expect(formatAccuracyPercent(0.7596)).toBe('75.96%');
    expect(formatAccuracyPercent(0.75)).toBe('75%');
    expect(scoreForClear(1_000, 0, 4)).toBe(1_250n);
    expect(scoreForClear(1_000, 3, 4)).toBe(2_188n);
    expect(scoreForClear(1_000, 4, 4)).toBe(2_500n);
  });

  it('counts repeat returns as misses without penalizing drained multiballs', () => {
    expect(resolveAccuracyAttempt('pending', true)).toEqual({ hits: 0, attempts: 1 });
    expect(resolveAccuracyAttempt('pending', false)).toEqual({ hits: 0, attempts: 0 });
    expect(resolveAccuracyAttempt('hit', false)).toEqual({ hits: 1, attempts: 1 });
  });

  it('counts an active no-brick rally as a miss when the board clears', () => {
    const firstRally = resolveAccuracyAttempt('hit', true);
    const secondRally = resolveAccuracyAttempt('pending', true);
    expect(
      accuracyFor(
        firstRally.hits + secondRally.hits,
        firstRally.attempts + secondRally.attempts
      )
    ).toBe(0.5);
  });

  it('counts the launch from the paddle as the first accuracy attempt', () => {
    const launchAfterBrickHit = resolveAccuracyAttempt('hit', true);
    const secondRallyAtClear = resolveAccuracyAttempt('pending', true);
    expect(
      accuracyFor(
        launchAfterBrickHit.hits + secondRallyAtClear.hits,
        launchAfterBrickHit.attempts + secondRallyAtClear.attempts
      )
    ).toBe(0.5);
  });

  it('labels cleared runs in automatic score comments', () => {
    expect(formatAutomaticScoreComment(12_345, 83_000, true)).toBe(
      '12,345 points in 1:23 | Cleared!'
    );
    expect(formatAutomaticScoreComment(12_345, 83_000, false)).toBe(
      '12,345 points in 1:23'
    );
  });
});
