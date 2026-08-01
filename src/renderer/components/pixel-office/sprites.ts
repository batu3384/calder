import { CharacterState, Direction, type OfficeCharacter, type WorkPose } from './types.js';

/** Metro City (JIK-A-4) sheet layout — same as pixel-agents constants. */
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

const PROVIDER_CHAR: Record<string, number> = {
  claude: 0, // navy suit
  codex: 1, // black dress
  cursor: 2, // navy blazer (was orange jacket)
  antigravity: 3, // blue oxford
  unknown: 4, // muted shirt
};

/** UI accents only — muted, office-appropriate (no neon / candy). */
const PROVIDER_COLORS: Record<string, string> = {
  claude: '#b45309',
  codex: '#0f766e',
  cursor: '#4f46e5',
  antigravity: '#0369a1',
  unknown: '#475569',
};

/** Body/suit fill for procedural fallback — desaturated office palette. */
const PROVIDER_SUIT: Record<string, { jacket: string; pants: string; shirt: string }> = {
  claude: { jacket: '#1e3a5f', pants: '#172554', shirt: '#e2e8f0' },
  codex: { jacket: '#1f2937', pants: '#111827', shirt: '#f1f5f9' },
  cursor: { jacket: '#312e81', pants: '#1e1b4b', shirt: '#e0e7ff' },
  antigravity: { jacket: '#0c4a6e', pants: '#082f49', shirt: '#e0f2fe' },
  unknown: { jacket: '#334155', pants: '#1e293b', shirt: '#f8fafc' },
};

const sheets: Array<HTMLImageElement | null> = Array.from({ length: CHAR_COUNT }, () => null);
let loadPromise: Promise<void> | null = null;

export function providerAccent(providerId: string): string {
  return PROVIDER_COLORS[providerId] ?? PROVIDER_COLORS.unknown!;
}

export function characterSheetIndex(providerId: string, sessionId: string): number {
  if (providerId in PROVIDER_CHAR) return PROVIDER_CHAR[providerId]!;
  // Prefer professional sheets 0–4; never land on leftover loud palette (char_5 reserved as charcoal backup).
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  return hash % 5;
}

function suitPalette(providerId: string): { jacket: string; pants: string; shirt: string } {
  return PROVIDER_SUIT[providerId] ?? PROVIDER_SUIT.unknown!;
}

function sheetUrl(index: number): string {
  return `assets/pixel-office/characters/char_${index}.png`;
}

/** Start loading Metro City character sheets (idempotent). */
export function ensureCharacterSheetsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof Image === 'undefined') {
    loadPromise = Promise.resolve();
    return loadPromise;
  }
  loadPromise = Promise.all(
    Array.from({ length: CHAR_COUNT }, (_, index) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          sheets[index] = img;
          resolve();
        };
        img.onerror = () => {
          sheets[index] = null;
          resolve();
        };
        img.src = sheetUrl(index);
      });
    }),
  ).then(() => undefined);
  return loadPromise;
}

function frameColumn(ch: OfficeCharacter): number {
  if (ch.state === CharacterState.WALK) {
    const cycle = [0, 1, 2, 1];
    return cycle[ch.frame % 4]!;
  }
  if (ch.state === CharacterState.DESK) {
    switch (ch.workPose) {
      case 'read':
      case 'browse':
        return 5 + (ch.frame % 2);
      case 'type':
      case 'build':
        return 3 + (ch.frame % 2);
      case 'think':
        return ch.frame % 2 === 0 ? 0 : 3;
      case 'rest':
      default:
        return 0;
    }
  }
  return 0;
}

function frameRow(dir: Direction): number {
  if (dir === Direction.DOWN) return 0;
  if (dir === Direction.UP) return 1;
  return 2; // RIGHT + LEFT (LEFT flipped)
}

/** Draw Metro City sprite; falls back to procedural block if sheet missing. */
export function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  ch: OfficeCharacter,
  originX: number,
  originY: number,
  scale = 1,
): void {
  void ensureCharacterSheetsLoaded();
  const index = characterSheetIndex(ch.providerId, ch.sessionId);
  const sheet = sheets[index];
  const col = frameColumn(ch);
  const row = frameRow(ch.dir);
  const flip = ch.dir === Direction.LEFT;
  const dw = CHAR_FRAME_W * scale;
  const dh = CHAR_FRAME_H * scale;
  const x = Math.round(originX);
  const y = Math.round(originY);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 3 * scale, y + dh - 2 * scale, 10 * scale, 2 * scale);

  if (sheet && sheet.complete && sheet.naturalWidth > 0) {
    ctx.save();
    if (flip) {
      ctx.translate(x + dw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        sheet,
        col * CHAR_FRAME_W,
        row * CHAR_FRAME_H,
        CHAR_FRAME_W,
        CHAR_FRAME_H,
        0,
        0,
        dw,
        dh,
      );
    } else {
      ctx.drawImage(
        sheet,
        col * CHAR_FRAME_W,
        row * CHAR_FRAME_H,
        CHAR_FRAME_W,
        CHAR_FRAME_H,
        x,
        y,
        dw,
        dh,
      );
    }
    ctx.restore();
    return;
  }

  // Procedural office-worker fallback (suit, not candy blob)
  const suit = suitPalette(ch.providerId);
  const s = scale;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 3 * s, y + dh - 2 * s, 10 * s, 2 * s);
  ctx.fillStyle = suit.pants;
  ctx.fillRect(x + 4 * s, y + 22 * s, 3 * s, 8 * s);
  ctx.fillRect(x + 9 * s, y + 22 * s, 3 * s, 8 * s);
  ctx.fillStyle = suit.jacket;
  ctx.fillRect(x + 3 * s, y + 12 * s, 10 * s, 11 * s);
  ctx.fillStyle = suit.shirt;
  ctx.fillRect(x + 6 * s, y + 12 * s, 4 * s, 6 * s);
  ctx.fillStyle = '#e8c4a8';
  ctx.fillRect(x + 4 * s, y + 5 * s, 8 * s, 7 * s);
  ctx.fillStyle = '#2c1810';
  ctx.fillRect(x + 3 * s, y + 2 * s, 10 * s, 5 * s);
  ctx.fillStyle = '#111827';
  ctx.fillRect(x + 5 * s, y + 8 * s, 2 * s, 2 * s);
  ctx.fillRect(x + 9 * s, y + 8 * s, 2 * s, 2 * s);
}

function monitorPalette(pose: WorkPose): { bezel: string; glow: string; line: string } {
  switch (pose) {
    case 'type':
      return { bezel: '#0f172a', glow: '#22c55e', line: '#86efac' };
    case 'build':
      return { bezel: '#0f172a', glow: '#f59e0b', line: '#fde68a' };
    case 'read':
      return { bezel: '#0f172a', glow: '#eab308', line: '#fef08a' };
    case 'browse':
      return { bezel: '#0f172a', glow: '#38bdf8', line: '#bae6fd' };
    case 'think':
      return { bezel: '#0f172a', glow: '#a78bfa', line: '#ddd6fe' };
    case 'rest':
    default:
      return { bezel: '#111827', glow: '#1e3a5f', line: '#334155' };
  }
}

function drawMonitorScreen(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  pose: WorkPose,
  tick: number,
): void {
  const pal = monitorPalette(pose);
  ctx.fillStyle = pal.bezel;
  ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
  ctx.fillStyle = pal.glow;
  ctx.fillRect(sx, sy, sw, sh);
  if (pose === 'rest') return;
  ctx.fillStyle = pal.line;
  const lineCount = pose === 'browse' ? 2 : 3;
  for (let i = 0; i < lineCount; i += 1) {
    const wobble = pose === 'type' || pose === 'build' ? (tick + i) % 2 : 0;
    const lw = Math.max(2, sw - 2 - i * 2 - wobble);
    ctx.fillRect(sx + 1, sy + 1 + i * 2, lw, 1);
  }
  if (pose === 'browse') {
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(sx + sw - 2, sy + 1, 1, sh - 2);
  }
}

/**
 * Dual-monitor desk + keyboard + mug — pose drives screen content so work is visible.
 */
export function drawDeskFurniture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: Direction,
  workPose: WorkPose = 'rest',
  animFrame = 0,
): void {
  const desk = '#6b5344';
  const deskTop = '#8b6b52';
  const deskDark = '#3d2f25';
  const chair = '#374151';
  const chairBack = '#4b5563';
  const metal = '#64748b';
  const tick = animFrame % 2;

  if (facing === Direction.DOWN) {
    ctx.fillStyle = chair;
    ctx.fillRect(x + 3, y - 1, 10, 8);
    ctx.fillStyle = chairBack;
    ctx.fillRect(x + 2, y - 3, 12, 3);
    ctx.fillRect(x + 1, y, 3, 6);
    ctx.fillRect(x + 12, y, 3, 6);
    ctx.fillStyle = desk;
    ctx.fillRect(x - 6, y + 8, 28, 8);
    ctx.fillStyle = deskTop;
    ctx.fillRect(x - 5, y + 8, 26, 2);
    ctx.fillStyle = deskDark;
    ctx.fillRect(x - 4, y + 15, 2, 3);
    ctx.fillRect(x + 18, y + 15, 2, 3);
    drawMonitorScreen(ctx, x + 1, y + 2, 11, 6, workPose, tick);
    drawMonitorScreen(ctx, x + 14, y + 3, 7, 5, workPose === 'rest' ? 'rest' : workPose, tick);
    ctx.fillStyle = metal;
    ctx.fillRect(x + 5, y + 8, 2, 2);
    ctx.fillRect(x + 16, y + 8, 2, 2);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 4, y + 11, 10, 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 16, y + 11, 3, 2);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 20, y + 10, 3, 3);
  } else if (facing === Direction.UP) {
    ctx.fillStyle = desk;
    ctx.fillRect(x - 6, y - 6, 28, 8);
    ctx.fillStyle = deskTop;
    ctx.fillRect(x - 5, y - 6, 26, 2);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 3, y + 5, 10, 8);
    ctx.fillStyle = chairBack;
    ctx.fillRect(x + 2, y + 11, 12, 3);
    drawMonitorScreen(ctx, x + 1, y - 4, 11, 6, workPose, tick);
    drawMonitorScreen(ctx, x + 14, y - 3, 7, 5, workPose === 'rest' ? 'rest' : workPose, tick);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 4, y - 1, 10, 2);
  } else if (facing === Direction.LEFT) {
    ctx.fillStyle = desk;
    ctx.fillRect(x - 6, y - 4, 8, 24);
    ctx.fillStyle = deskTop;
    ctx.fillRect(x - 6, y - 3, 2, 22);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 5, y + 3, 9, 10);
    drawMonitorScreen(ctx, x - 4, y + 2, 5, 10, workPose, tick);
  } else {
    ctx.fillStyle = desk;
    ctx.fillRect(x + 14, y - 4, 8, 24);
    ctx.fillStyle = deskTop;
    ctx.fillRect(x + 20, y - 3, 2, 22);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 1, y + 3, 9, 10);
    drawMonitorScreen(ctx, x + 15, y + 2, 5, 10, workPose, tick);
  }
}
