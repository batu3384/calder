import type { TileKind } from './types.js';

function key(col: number, row: number): string {
  return `${col},${row}`;
}

/** BFS pathfinding on tile grid. Returns steps after start (not including start). */
export function findPath(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  tiles: TileKind[][],
  blocked: Set<string>,
): Array<{ col: number; row: number }> {
  if (fromCol === toCol && fromRow === toRow) return [];
  const rows = tiles.length;
  const cols = tiles[0]?.length ?? 0;
  if (toCol < 0 || toRow < 0 || toCol >= cols || toRow >= rows) return [];
  if (blocked.has(key(toCol, toRow))) return [];

  const queue: Array<{ col: number; row: number }> = [{ col: fromCol, row: fromRow }];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(key(fromCol, fromRow), null);

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.col === toCol && current.row === toRow) break;
    for (const [dc, dr] of dirs) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nk = key(nc, nr);
      if (cameFrom.has(nk) || blocked.has(nk)) continue;
      if (tiles[nr]?.[nc] === 'wall') continue;
      cameFrom.set(nk, key(current.col, current.row));
      queue.push({ col: nc, row: nr });
    }
  }

  const endKey = key(toCol, toRow);
  if (!cameFrom.has(endKey)) return [];

  const path: Array<{ col: number; row: number }> = [];
  let cursor: string | null = endKey;
  while (cursor) {
    const [c, r] = cursor.split(',').map(Number) as [number, number];
    path.push({ col: c, row: r });
    cursor = cameFrom.get(cursor) ?? null;
  }
  path.reverse();
  path.shift(); // drop start
  return path;
}
