import { DEFAULT_OFFICE_THEME, type OfficeTheme } from './office-theme.js';
import { type OfficeLayout, TILE_SIZE } from './types.js';

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
  theme: OfficeTheme = DEFAULT_OFFICE_THEME,
): { base: string; accent: string } {
  const zone = zoneAt(col, row, layout);
  switch (zone) {
    case 'carpet':
      return { base: theme.floor, accent: theme.floorAccent };
    case 'wood':
      return { base: theme.desk, accent: theme.deskAccent };
    case 'corridor':
      return { base: theme.floorAccent, accent: theme.wallAccent };
    default:
      return { base: theme.wall, accent: theme.wallAccent };
  }
}

export function drawWallTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  row: number,
  theme: OfficeTheme = DEFAULT_OFFICE_THEME,
): void {
  const isWindow = row === 0;
  ctx.fillStyle = isWindow ? theme.wall : theme.wallAccent;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = isWindow ? theme.info : theme.wall;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, isWindow ? TILE_SIZE - 4 : 3);
  if (isWindow) {
    ctx.fillStyle = theme.info;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.wallAccent;
    ctx.fillRect(x + 7, y + 2, 2, TILE_SIZE - 4);
    ctx.fillRect(x + 2, y + 7, TILE_SIZE - 4, 2);
  } else {
    ctx.fillStyle = theme.deskAccent;
    ctx.fillRect(x + 2, y + TILE_SIZE - 3, TILE_SIZE - 4, 2);
  }
}

/** Sparse props placed relative to layout so they never clip off-map. */
export function drawOfficeProps(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  theme: OfficeTheme = DEFAULT_OFFICE_THEME,
): void {
  const midCol = Math.floor(layout.cols * 0.55);
  const lastFloorCol = layout.cols - 2;
  const lastFloorRow = layout.rows - 2;

  drawPlant(ctx, 1 * TILE_SIZE + 4, Math.floor(layout.rows * 0.45) * TILE_SIZE + 2, theme);
  drawWaterCooler(ctx, (midCol - 1) * TILE_SIZE + 4, 2 * TILE_SIZE + 2, theme);
  if (lastFloorCol - midCol >= 2) {
    drawMeetingTable(ctx, (midCol + 1) * TILE_SIZE, 3 * TILE_SIZE, theme);
    drawWhiteboard(ctx, (midCol + 1) * TILE_SIZE + 4, 1 * TILE_SIZE + 2, theme);
  }
  drawBookshelf(ctx, lastFloorCol * TILE_SIZE + 2, 1 * TILE_SIZE + 2, theme);
  drawSofa(ctx, 2 * TILE_SIZE, lastFloorRow * TILE_SIZE - 2, theme);
  drawFloorLamp(ctx, lastFloorCol * TILE_SIZE - 2, lastFloorRow * TILE_SIZE - 4, theme);
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number, theme: OfficeTheme): void {
  ctx.fillStyle = theme.deskAccent;
  ctx.fillRect(x + 4, y + 8, 6, 6);
  ctx.fillStyle = theme.active;
  ctx.fillRect(x + 2, y + 2, 10, 8);
  ctx.fillStyle = theme.info;
  ctx.fillRect(x + 4, y, 6, 4);
}

function drawWaterCooler(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: OfficeTheme,
): void {
  ctx.fillStyle = theme.text;
  ctx.fillRect(x, y, 10, 14);
  ctx.fillStyle = theme.info;
  ctx.fillRect(x + 2, y + 2, 6, 6);
  ctx.fillStyle = theme.mutedText;
  ctx.fillRect(x + 3, y + 10, 4, 3);
}

function drawMeetingTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: OfficeTheme,
): void {
  ctx.fillStyle = theme.desk;
  ctx.fillRect(x, y + 6, 32, 8);
  ctx.fillStyle = theme.wall;
  ctx.fillRect(x + 2, y + 13, 3, 4);
  ctx.fillRect(x + 27, y + 13, 3, 4);
  ctx.fillStyle = theme.mutedText;
  ctx.fillRect(x + 6, y + 2, 5, 5);
  ctx.fillRect(x + 14, y + 2, 5, 5);
  ctx.fillRect(x + 22, y + 2, 5, 5);
}

function drawBookshelf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: OfficeTheme,
): void {
  ctx.fillStyle = theme.deskAccent;
  ctx.fillRect(x, y, 10, 24);
  ctx.fillStyle = theme.info;
  ctx.fillRect(x + 2, y + 3, 2, 4);
  ctx.fillStyle = theme.waiting;
  ctx.fillRect(x + 5, y + 3, 2, 4);
  ctx.fillStyle = theme.active;
  ctx.fillRect(x + 2, y + 10, 2, 4);
  ctx.fillStyle = theme.mutedText;
  ctx.fillRect(x + 5, y + 10, 2, 4);
}

function drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number, theme: OfficeTheme): void {
  ctx.fillStyle = theme.desk;
  ctx.fillRect(x, y + 4, 24, 8);
  ctx.fillStyle = theme.deskAccent;
  ctx.fillRect(x + 2, y, 20, 5);
  ctx.fillRect(x, y + 4, 3, 6);
  ctx.fillRect(x + 21, y + 4, 3, 6);
}

function drawWhiteboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: OfficeTheme,
): void {
  ctx.fillStyle = theme.mutedText;
  ctx.fillRect(x, y, 22, 12);
  ctx.fillStyle = theme.text;
  ctx.fillRect(x + 1, y + 1, 20, 10);
  ctx.fillStyle = theme.wallAccent;
  ctx.fillRect(x + 3, y + 3, 8, 1);
  ctx.fillRect(x + 3, y + 5, 12, 1);
  ctx.fillRect(x + 3, y + 7, 6, 1);
  ctx.fillStyle = theme.info;
  ctx.fillRect(x + 14, y + 3, 5, 5);
}

function drawFloorLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theme: OfficeTheme,
): void {
  ctx.fillStyle = theme.mutedText;
  ctx.fillRect(x + 3, y + 4, 2, 10);
  ctx.fillStyle = theme.waiting;
  ctx.fillRect(x + 1, y, 6, 5);
  ctx.globalAlpha = 0.25;
  ctx.fillRect(x - 1, y + 4, 10, 4);
  ctx.globalAlpha = 1;
}
