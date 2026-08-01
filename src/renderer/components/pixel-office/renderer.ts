import { formatCharacterChromeLabel } from './character-label.js';
import { drawOfficeProps, drawWallTile, floorColors } from './office-props.js';
import { CHAR_FRAME_H, CHAR_FRAME_W,drawCharacterSprite, drawDeskFurniture, providerAccent } from './sprites.js';
import { type OfficeCharacter, type OfficeLayout, TILE_SIZE, type WorkPose } from './types.js';

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
  ctx.fillStyle = '#0a1018';
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
        drawWallTile(ctx, x, y, row);
      } else {
        const { base, accent } = floorColors(col, row, layout);
        ctx.fillStyle = base;
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = accent;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 1);
        ctx.fillRect(x + 1, y + 1, 1, TILE_SIZE - 2);
      }
    }
  }

  drawOfficeProps(ctx, layout);

  const seatOccupant = new Map<string, OfficeCharacter>();
  for (const ch of characters) {
    if (ch.isSubagent || !ch.seatId) continue;
    // Desk monitors follow assigned seat even while agent walks over.
    seatOccupant.set(ch.seatId, ch);
  }

  for (const seat of layout.seats) {
    const occupant = seatOccupant.get(seat.id);
    const pose: WorkPose = occupant?.workPose ?? 'rest';
    const frame = occupant?.frame ?? 0;
    drawDeskFurniture(
      ctx,
      seat.seatCol * TILE_SIZE,
      seat.seatRow * TILE_SIZE,
      seat.facingDir,
      pose,
      frame,
    );
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
    ctx.strokeStyle = providerAccent(ch.providerId);
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, CHAR_FRAME_W * scale + 2, CHAR_FRAME_H * scale + 2);
  } else if (flags.hovered) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, CHAR_FRAME_W * scale + 2, CHAR_FRAME_H * scale + 2);
  }

  drawCharacterSprite(ctx, ch, x, y, scale);

  if (ch.bubble === 'permission') {
    drawBubble(ctx, x + 2, y - 10, '!', '#fbbf24');
  } else if (ch.bubble === 'done') {
    drawBubble(ctx, x + 2, y - 10, '✓', '#34d399');
  } else if (ch.bubble === 'think') {
    drawBubble(ctx, x + 2, y - 10, '…', '#c4b5fd');
  }

  if (!ch.isSubagent && ch.contextPct != null) {
    const pct = ch.contextPct / 100;
    const barY = y + CHAR_FRAME_H * scale + 1;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, barY, CHAR_FRAME_W * scale, 3);
    ctx.fillStyle = pct > 0.85 ? '#ef4444' : pct > 0.6 ? '#f59e0b' : '#22c55e';
    ctx.fillRect(x, barY, Math.max(1, Math.round(CHAR_FRAME_W * scale * pct)), 3);
  }

  const showLabel =
    flags.hovered || flags.selected || (ch.isActive && Boolean(ch.activityLabel)) || ch.isSubagent;
  if (showLabel) {
    const text = formatCharacterChromeLabel(ch);
    ctx.font = 'bold 5px ui-sans-serif, system-ui, sans-serif';
    const w = Math.min(72, text.length * 3.2 + 6);
    const labelY = y - (ch.isActive ? 10 : 8);
    ctx.fillStyle = 'rgba(8,12,18,0.78)';
    ctx.fillRect(x - 2, labelY, w, 7);
    ctx.fillStyle = ch.isActive ? '#f8fafc' : '#cbd5e1';
    ctx.fillText(text, x, labelY + 5);
    if (flags.selected || ch.isActive) {
      ctx.fillStyle = providerAccent(ch.providerId);
      ctx.fillRect(x - 2, labelY, 2, 7);
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
  ctx.fillRect(x, y, 12, 9);
  ctx.fillStyle = color;
  ctx.font = 'bold 7px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(text, x + 2, y + 7);
}
