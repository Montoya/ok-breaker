import { afterEach, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  LEGACY_COLUMNS,
  LEGACY_ROWS,
  RULESET_VERSION,
  makeSeedCells,
  type Board,
} from '../shared/game';
import { cachePlayBoard, readCachedPlayBoard } from './play-handoff';

afterEach(() => localStorage.clear());

const board = (): Board => ({
  id: 'rainbow-no-1',
  formatVersion: FORMAT_VERSION,
  rulesetVersion: RULESET_VERSION,
  columns: LEGACY_COLUMNS,
  rows: LEGACY_ROWS,
  cells: makeSeedCells(),
  boardHash: 'seedboard',
  gameplaySeed: 'ab56a7ef',
  title: 'Rainbow No. 1',
  creatorId: 'app:art-breaker-game',
  creatorUsername: 'art_breaker_game',
  creatorRole: 'app',
  status: 'published',
  createdAt: 1,
  updatedAt: 1,
});

describe('play handoff', () => {
  it('returns a recently cached board for the same post', () => {
    const cachedBoard = board();
    cachePlayBoard(cachedBoard, 't3_post', 1_000);

    expect(readCachedPlayBoard('t3_post', 2_000)).toEqual(cachedBoard);
  });

  it('rejects handoffs for another post', () => {
    cachePlayBoard(board(), 't3_first', 1_000);

    expect(readCachedPlayBoard('t3_second', 2_000)).toBeNull();
  });

  it('rejects expired or invalid handoffs', () => {
    cachePlayBoard(board(), 't3_post', 1_000);
    expect(readCachedPlayBoard('t3_post', 31_001)).toBeNull();

    localStorage.setItem('art-breaker-play-handoff', '{invalid');
    expect(readCachedPlayBoard('t3_post', 2_000)).toBeNull();
  });
});
