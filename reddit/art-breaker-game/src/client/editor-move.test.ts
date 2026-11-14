import { describe, expect, it } from 'vitest';
import { EDITOR_COLUMNS, EDITOR_ROWS } from '../shared/game';
import { moveArtwork } from './editor-move';

const blank = () => new Array<number>(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);
const at = (row: number, column: number) => row * EDITOR_COLUMNS + column;

describe('moveArtwork', () => {
  it.each([
    ['up', 8, 10],
    ['left', 9, 9],
    ['right', 9, 11],
    ['down', 10, 10],
  ] as const)('moves every cell one space %s', (direction, row, column) => {
    const cells = blank();
    cells[at(9, 10)] = 4;

    const moved = moveArtwork(cells, direction);

    expect(moved[at(row, column)]).toBe(4);
    expect(moved.filter(Boolean)).toHaveLength(1);
    expect(cells[at(9, 10)]).toBe(4);
  });

  it.each([
    ['up', 0, 5],
    ['left', 5, 0],
    ['right', 5, EDITOR_COLUMNS - 1],
    ['down', EDITOR_ROWS - 1, 5],
  ] as const)('discards cells moved beyond the %s edge', (direction, row, column) => {
    const cells = blank();
    cells[at(row, column)] = 2;

    const moved = moveArtwork(cells, direction);

    expect(moved.every((value) => value === 0)).toBe(true);
    expect(moveArtwork(moved, direction === 'up' ? 'down' : direction === 'down' ? 'up' : direction === 'left' ? 'right' : 'left'))
      .toEqual(blank());
    expect(cells[at(row, column)]).toBe(2);
  });
});
