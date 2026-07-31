import type { OfficeLayout, TileKind } from './types.js';
import { Direction } from './types.js';

/** Compact default office: walkable floor + desks/chairs as seats. */
export function createDefaultLayout(): OfficeLayout {
  const cols = 18;
  const rows = 14;
  const tiles: TileKind[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: TileKind[] = [];
    for (let col = 0; col < cols; col += 1) {
      const border = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;
      line.push(border ? 'wall' : 'floor');
    }
    tiles.push(line);
  }

  // Interior divider walls for rooms
  for (let row = 1; row < rows - 1; row += 1) {
    if (row === 6 || row === 7) continue;
    tiles[row]![9] = 'wall';
  }

  const seats = [
    { id: 'seat-a', seatCol: 3, seatRow: 3, facingDir: Direction.DOWN },
    { id: 'seat-b', seatCol: 6, seatRow: 3, facingDir: Direction.DOWN },
    { id: 'seat-c', seatCol: 3, seatRow: 10, facingDir: Direction.UP },
    { id: 'seat-d', seatCol: 6, seatRow: 10, facingDir: Direction.UP },
    { id: 'seat-e', seatCol: 12, seatRow: 3, facingDir: Direction.DOWN },
    { id: 'seat-f', seatCol: 15, seatRow: 3, facingDir: Direction.DOWN },
    { id: 'seat-g', seatCol: 12, seatRow: 10, facingDir: Direction.UP },
    { id: 'seat-h', seatCol: 15, seatRow: 10, facingDir: Direction.UP },
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
