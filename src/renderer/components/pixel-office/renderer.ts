import { drawCharacterSprite, drawDeskFurniture, providerAccent, CHAR_FRAME_H, CHAR_FRAME_W } from './sprites.js';
import { type OfficeCharacter, type OfficeLayout, TILE_SIZE } from './types.js';

export interface OfficeRenderOptions {
  selectedSessionId: string | null;
  hoveredId: string | null;
  zoom: number;
}

export function renderOffice(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  characters: OfficeCharacter[],
  options: OfficeRenderOptions,
): void {
  const worldW = layout.cols * TILE_SIZE;
  const worldH = layout.rows * TILE_SIZE;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const scale = options.zoom;
  const offsetX = Math.floor((ctx.canvas.width / dpr - worldW * scale) / 2);
  const offsetY = Math.floor((ctx.canvas.height / dpr - worldH * scale) / 2);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);

  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const kind = layout.tiles[row]?.[col];
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      if (kind === 'wall') {
        ctx.fillStyle = '#2a3548';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#1c2433';
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 3);
        ctx.fillStyle = '#334155';
        ctx.fillRect(x + 2, y + TILE_SIZE - 3, TILE_SIZE - 4, 2);
      } else {
        ctx.fillStyle = (col + row) % 2 === 0 ? '#243044' : '#1f2a3d';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(x + 1, y + 1, 2, 2);
      }
    }
  }

  for (const seat of layout.seats) {
    drawDeskFurniture(ctx, seat.seatCol * TILE_SIZE, seat.seatRow * TILE_SIZE, seat.facingDir);
  }

  const sorted = [...characters].sort((a, b) => a.y - b.y);
  for (const ch of sorted) {
    drawCharacter(ctx, ch, {
      selected: ch.sessionId === options.selectedSessionId && !ch.isSubagent,
      hovered: ch.id === options.hoveredId,
    });
  }

  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  ch: OfficeCharacter,
  flags: { selected: boolean; hovered: boolean },
): void {
  const scale = ch.isSubagent ? 0.75 : 1;
  const x = Math.round(ch.x - (CHAR_FRAME_W * scale) / 2);
  const y = Math.round(ch.y - CHAR_FRAME_H * scale + 4);

  if (flags.selected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, CHAR_FRAME_W * scale + 2, CHAR_FRAME_H * scale + 2);
  }

  drawCharacterSprite(ctx, ch, x, y, scale);

  if (ch.bubble === 'permission') {
    drawBubble(ctx, x + 2, y - 10, '…', '#fbbf24');
  } else if (ch.bubble === 'done') {
    drawBubble(ctx, x + 2, y - 10, '✓', '#34d399');
  }

  if (!ch.isSubagent && ch.contextPct != null) {
    const pct = ch.contextPct / 100;
    const barY = y + CHAR_FRAME_H * scale + 1;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x, barY, CHAR_FRAME_W * scale, 2);
    ctx.fillStyle = pct > 0.85 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : '#22c55e';
    ctx.fillRect(x, barY, Math.max(1, Math.round(CHAR_FRAME_W * scale * pct)), 2);
  }

  const showLabel =
    flags.hovered || flags.selected || (ch.isActive && Boolean(ch.activityLabel)) || ch.isSubagent;
  if (showLabel) {
    const text = (ch.activityLabel || ch.name).slice(0, 20);
    ctx.font = '5px ui-sans-serif, system-ui, sans-serif';
    const w = Math.min(56, text.length * 3 + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(x - 2, y - 8, w, 6);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(text, x, y - 4);
    if (flags.selected) {
      ctx.fillStyle = providerAccent(ch.providerId);
      ctx.fillRect(x - 2, y - 8, 2, 6);
    }
  }
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  ctx.fillStyle = '#111827';
  ctx.fillRect(x, y, 12, 8);
  ctx.fillStyle = color;
  ctx.font = '7px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(text, x + 2, y + 6);
}
