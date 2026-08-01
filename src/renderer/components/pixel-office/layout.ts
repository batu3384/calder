import type { OfficeLayout, TileKind } from './types.js';
import { Direction } from './types.js';

/**
 * Compact open-plan sized for the inspector rail (~280px wide).
 * 12×10 tiles @ 16px = 192×160 world — fits at zoom ≥1.4.
 */
export function createDefaultLayout(): OfficeLayout {
  const cols = 12;
  const rows = 10;
  const tiles: TileKind[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: TileKind[] = [];
    for (let col = 0; col < cols; col += 1) {
      const border = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
      line.push(border ? 'wall' : 'floor');
    }
    tiles.push(line);
  }

  // Meeting nook wall on the right (door at row 4-5)
  for (let row = 1; row < rows - 1; row += 1) {
    if (row === 4 || row === 5) continue;
    tiles[row]![7] = 'wall';
  }

  const seats = [
    { id: 'seat-a', seatCol: 2, seatRow: 2, facingDir: Direction.DOWN },
    { id: 'seat-b', seatCol: 4, seatRow: 2, facingDir: Direction.DOWN },
    { id: 'seat-c', seatCol: 2, seatRow: 5, facingDir: Direction.UP },
    { id: 'seat-d', seatCol: 4, seatRow: 5, facingDir: Direction.UP },
    { id: 'seat-e', seatCol: 2, seatRow: 7, facingDir: Direction.DOWN },
    { id: 'seat-f', seatCol: 4, seatRow: 7, facingDir: Direction.DOWN },
    { id: 'seat-g', seatCol: 9, seatRow: 2, facingDir: Direction.DOWN },
    { id: 'seat-h', seatCol: 9, seatRow: 6, facingDir: Direction.UP },
  ];

  return { cols, rows, tiles, seats };
}

export function buildWalkability(layout: OfficeLayout): {
  walkable: Array<{ col: number; row: number }>;
  blocked: Set<string>;
} {
  const walkable: Array<{ col: number; row: number }> = [];
  const blocked = new Set<string>();
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const key = `${col},${row}`;
      if (layout.tiles[row]?.[col] === 'wall') blocked.add(key);
      else walkable.push({ col, row });
    }
  }
  return { walkable, blocked };
}
