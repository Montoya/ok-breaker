import { afterEach, expect, test, vi } from 'vitest';
import {
  FORMAT_VERSION,
  LEGACY_COLUMNS,
  LEGACY_ROWS,
  RULESET_VERSION,
  makeSeedCells,
  type Board,
} from '../shared/game';
import { ArtBreakerEngine, type RunResult } from './game-engine';

const board: Board = {
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
};

const createEngine = (onFinish: (result: RunResult) => void) => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getContext', { value: () => ({}) });
  return new ArtBreakerEngine(canvas, board, { onHud: vi.fn(), onFinish });
};

afterEach(() => vi.unstubAllGlobals());

test('quitting with points finishes immediately as an uncleared run', async () => {
  const onFinish = vi.fn();
  const engine = createEngine(onFinish);
  await engine.startOrResume();
  engine.pause();
  Reflect.set(engine, 'score', 125n);

  expect(engine.quit()).toBe('submitted');
  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
    score: '125',
    baseScore: '125',
    cleared: false,
  }));
  expect(engine.status).toBe('over');
  engine.destroy();
});

test('quitting at zero does not finish or resume on Space', async () => {
  const onFinish = vi.fn();
  const engine = createEngine(onFinish);
  await engine.startOrResume();
  engine.pause();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

  expect(engine.status).toBe('paused');
  expect(engine.quit()).toBe('empty');
  expect(onFinish).not.toHaveBeenCalled();
  engine.destroy();
});
