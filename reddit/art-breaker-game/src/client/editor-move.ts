import { EDITOR_COLUMNS, EDITOR_ROWS } from '../shared/game';

export type MoveDirection = 'up' | 'left' | 'right' | 'down';

export const moveArtwork = (cells: number[], direction: MoveDirection): number[] => {
  const moved = new Array<number>(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);
  const rowShift = direction === 'down' ? 1 : direction === 'up' ? -1 : 0;
  const columnShift = direction === 'right' ? 1 : direction === 'left' ? -1 : 0;

  for (let row = 0; row < EDITOR_ROWS; row++) {
    for (let column = 0; column < EDITOR_COLUMNS; column++) {
      const nextRow = row + rowShift;
      const nextColumn = column + columnShift;
      if (
        nextRow >= 0 && nextRow < EDITOR_ROWS &&
        nextColumn >= 0 && nextColumn < EDITOR_COLUMNS
      ) {
        moved[nextRow * EDITOR_COLUMNS + nextColumn] =
          cells[row * EDITOR_COLUMNS + column] ?? 0;
      }
    }
  }

  return moved;
};
