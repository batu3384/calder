import { TILE_SIZE, type OfficeLayout } from './types.js';

type FloorZone = 'carpet' | 'wood' | 'tile' | 'corridor';

/** Zones scale with layout size so compact + large maps both read correctly. */
function zoneAt(col: number, row: number, layout: OfficeLayout): FloorZone {
  if (row <= 0 || col <= 0 || row >= layout.rows - 1 || col >= layout.cols - 1) {
    return 'tile';
  }
  const midCol = Math.floor(layout.cols * 0.55);
  const midRow = Math.floor(layout.rows * 0.55);
  if (col >= midCol) return 'wood';
  if (row >= midRow) return 'carpet';
  if (col === midCol - 1) return 'corridor';
  return 'carpet';
}

export function floorColors(
  col: number,
  row: number,
  layout: OfficeLayout,
): { base: string; accent: string } {
  const zone = zoneAt(col, row, layout);
  const checker = (col + row) % 2 === 0;
  switch (zone) {
    case 'carpet':
      return checker
        ? { base: '#2a3548', accent: '#313f55' }
        : { base: '#263041', accent: '#2d3a4d' };
    case 'wood':
      return checker
        ? { base: '#3d3228', accent: '#4a3b2f' }
        : { base: '#362c23', accent: '#433528' };
    case 'corridor':
      return checker
        ? { base: '#1e2836', accent: '#252f3f' }
        : { base: '#1a2330', accent: '#212b3a' };
    default:
      return checker
        ? { base: '#222c3a', accent: '#2a3545' }
        : { base: '#1e2734', accent: '#26303f' };
  }
}

export function drawWallTile(ctx: CanvasRenderingContext2D, x: number, y: number, row: number): void {
  const isWindow = row === 0;
  ctx.fillStyle = isWindow ? '#1a2433' : '#2f3b4f';
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = isWindow ? '#4a6a8a' : '#1c2433';
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, isWindow ? TILE_SIZE - 4 : 3);
  if (isWindow) {
    ctx.fillStyle = 'rgba(147, 197, 253, 0.35)';
    ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 7, y + 2, 2, TILE_SIZE - 4);
    ctx.fillRect(x + 2, y + 7, TILE_SIZE - 4, 2);
  } else {
    ctx.fillStyle = '#3d4d63';
    ctx.fillRect(x + 2, y + TILE_SIZE - 3, TILE_SIZE - 4, 2);
  }
}

/** Sparse props placed relative to layout so they never clip off-map. */
export function drawOfficeProps(ctx: CanvasRenderingContext2D, layout: OfficeLayout): void {
  const midCol = Math.floor(layout.cols * 0.55);
  const lastFloorCol = layout.cols - 2;
  const lastFloorRow = layout.rows - 2;

  drawPlant(ctx, 1 * TILE_SIZE + 4, Math.floor(layout.rows * 0.45) * TILE_SIZE + 2);
  drawWaterCooler(ctx, (midCol - 1) * TILE_SIZE + 4, 2 * TILE_SIZE + 2);
  if (lastFloorCol - midCol >= 2) {
    drawMeetingTable(ctx, (midCol + 1) * TILE_SIZE, 3 * TILE_SIZE);
    drawWhiteboard(ctx, (midCol + 1) * TILE_SIZE + 4, 1 * TILE_SIZE + 2);
  }
  drawBookshelf(ctx, lastFloorCol * TILE_SIZE + 2, 1 * TILE_SIZE + 2);
  drawSofa(ctx, 2 * TILE_SIZE, lastFloorRow * TILE_SIZE - 2);
  drawFloorLamp(ctx, lastFloorCol * TILE_SIZE - 2, lastFloorRow * TILE_SIZE - 4);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#5c3d28';
  ctx.fillRect(x + 4, y + 8, 6, 6);
  ctx.fillStyle = '#166534';
  ctx.fillRect(x + 2, y + 2, 10, 8);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 4, y, 6, 4);
}

function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(x, y, 10, 14);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x + 2, y + 2, 6, 6);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x + 3, y + 10, 4, 3);
}

function drawMeetingTable(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#4a3b2f';
  ctx.fillRect(x, y + 6, 32, 8);
  ctx.fillStyle = '#3d2f25';
  ctx.fillRect(x + 2, y + 13, 3, 4);
  ctx.fillRect(x + 27, y + 13, 3, 4);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x + 6, y + 2, 5, 5);
  ctx.fillRect(x + 14, y + 2, 5, 5);
  ctx.fillRect(x + 22, y + 2, 5, 5);
}

function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#5c4033';
  ctx.fillRect(x, y, 10, 24);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(x + 2, y + 3, 2, 4);
  ctx.fillStyle = '#d97706';
  ctx.fillRect(x + 5, y + 3, 2, 4);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x + 2, y + 10, 2, 4);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x + 5, y + 10, 2, 4);
}

function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y + 4, 24, 8);
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + 2, y, 20, 5);
  ctx.fillRect(x, y + 4, 3, 6);
  ctx.fillRect(x + 21, y + 4, 3, 6);
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x, y, 22, 12);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x + 1, y + 1, 20, 10);
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 3, y + 3, 8, 1);
  ctx.fillRect(x + 3, y + 5, 12, 1);
  ctx.fillRect(x + 3, y + 7, 6, 1);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(x + 14, y + 3, 5, 5);
}

function drawFloorLamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#475569';
  ctx.fillRect(x + 3, y + 4, 2, 10);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x + 1, y, 6, 5);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
  ctx.fillRect(x - 1, y + 4, 10, 4);
}
