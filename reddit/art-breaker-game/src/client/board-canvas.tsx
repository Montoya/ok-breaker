import { useEffect, useRef } from 'react';
import { CELL_SIZE, PALETTE, type Board } from '../shared/game';

type BoardCanvasProps = {
  board: Pick<Board, 'cells' | 'columns' | 'rows'>;
  className?: string;
  compact?: boolean;
  grid?: boolean;
  label: string;
};

// Shared with the Canvas-based compact board renderer.
// eslint-disable-next-line react-refresh/only-export-components
export const drawBoardPreview = (
  canvas: HTMLCanvasElement,
  board: Pick<Board, 'cells' | 'columns' | 'rows'>,
  grid = false,
  cellSize = CELL_SIZE,
): void => {
  const drawing = canvas.getContext('2d');
  if (!drawing) return;
  const boardX = (canvas.width - board.columns * cellSize) / 2;
  const occupiedRows = board.cells.flatMap((value, index) => value > 0 ? [Math.floor(index / board.columns)] : []);
  const minimum = occupiedRows.length ? Math.min(...occupiedRows) : 0;
  const maximum = occupiedRows.length ? Math.max(...occupiedRows) : board.rows - 1;
  const artHeight = (maximum - minimum + 1) * cellSize;
  const boardY = grid
    ? (canvas.height - board.rows * cellSize) / 2
    : (canvas.height - artHeight) / 2 - minimum * cellSize;
  drawing.clearRect(0, 0, canvas.width, canvas.height);
  drawing.fillStyle = '#111113';
  drawing.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < board.rows; row += 1) {
    for (let column = 0; column < board.columns; column += 1) {
      const value = board.cells[row * board.columns + column] ?? 0;
      const x = boardX + column * cellSize;
      const y = boardY + row * cellSize;
      const color = value > 0 ? PALETTE[value - 1] : undefined;
      if (color) {
        drawing.fillStyle = color.hex;
        drawing.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        drawing.fillStyle = 'rgba(255,255,255,.2)';
        drawing.fillRect(x + 2, y + 2, cellSize - 4, 2);
        drawing.fillStyle = 'rgba(0,0,0,.2)';
        drawing.fillRect(x + 2, y + cellSize - 4, cellSize - 4, 2);
      } else if (grid) {
        drawing.strokeStyle = '#343439';
        drawing.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
    }
  }
};

export const BoardCanvas = ({ board, className, compact = false, grid = false, label }: BoardCanvasProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) drawBoardPreview(canvas.current, board, grid, compact ? 16 : CELL_SIZE);
  }, [board, compact, grid]);
  return <canvas ref={canvas} className={className} width={400} height={compact ? 300 : 360} role="img" aria-label={label} />;
};
