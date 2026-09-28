import { describe, expect, it } from 'vitest';
import { CLEAR_SCORE_MULTIPLIER, EDITOR_COLUMNS, EDITOR_ROWS, FORMAT_VERSION, LEGACY_COLUMNS, LEGACY_ROWS, POWER_UPS, accuracyFor, boardSchema, canonicalBoard, formatAccuracyPercent, formatAutomaticScoreComment, gameplaySeedFor, makePowerPlan, makeSeedCells, pointsForCombo, resolveAccuracyAttempt, scoreForClear } from './game';

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
    expect(pointsForCombo(0)).toBe(100);
    expect(pointsForCombo(1)).toBe(115);
    expect(pointsForCombo(10)).toBeGreaterThan(400);
  });

  it('applies the clear and accuracy bonuses to the base score', () => {
    expect(CLEAR_SCORE_MULTIPLIER).toBe(1.25);
    expect(accuracyFor(0, 0)).toBe(0);
    expect(accuracyFor(3, 4)).toBe(0.75);
    expect(accuracyFor(75_968, 100_000)).toBe(0.7596);
    expect(formatAccuracyPercent(0.7596)).toBe('75.96%');
    expect(formatAccuracyPercent(0.75)).toBe('75%');
    expect(scoreForClear(1_000, 0, 4)).toBe(1_250);
    expect(scoreForClear(1_000, 3, 4)).toBe(2_188);
    expect(scoreForClear(1_000, 4, 4)).toBe(2_500);
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
