import { CharacterState, Direction, type OfficeCharacter } from './types.js';

/** Metro City (JIK-A-4) sheet layout — same as pixel-agents constants. */
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 32;
export const CHAR_FRAMES_PER_ROW = 7;
export const CHAR_COUNT = 6;

const PROVIDER_CHAR: Record<string, number> = {
  claude: 0,
  codex: 1,
  cursor: 2,
  antigravity: 3,
  unknown: 4,
};

const PROVIDER_COLORS: Record<string, string> = {
  claude: '#d97706',
  codex: '#10a37f',
  cursor: '#7c3aed',
  antigravity: '#0ea5e9',
  unknown: '#4285f4',
};

const sheets: Array<HTMLImageElement | null> = Array.from({ length: CHAR_COUNT }, () => null);
let loadPromise: Promise<void> | null = null;

export function providerAccent(providerId: string): string {
  return PROVIDER_COLORS[providerId] ?? PROVIDER_COLORS.unknown!;
}

export function characterSheetIndex(providerId: string, sessionId: string): number {
  if (providerId in PROVIDER_CHAR) return PROVIDER_CHAR[providerId]!;
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  return hash % CHAR_COUNT;
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
  if (ch.state === CharacterState.TYPE) {
    if (ch.isReading) return 5 + (ch.frame % 2);
    return 3 + (ch.frame % 2);
  }
  if (ch.state === CharacterState.WALK) {
    const cycle = [0, 1, 2, 1];
    return cycle[ch.frame % 4]!;
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

  // Procedural fallback until sheets load / if asset missing
  const color = providerAccent(ch.providerId);
  ctx.fillStyle = color;
  ctx.fillRect(x + 4 * scale, y + 8 * scale, 8 * scale, 16 * scale);
  ctx.fillRect(x + 3 * scale, y + 2 * scale, 10 * scale, 8 * scale);
}

export function drawDeskFurniture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: Direction,
): void {
  const desk = '#6b5344';
  const deskDark = '#3d2f25';
  const chair = '#4a3728';
  if (facing === Direction.DOWN) {
    ctx.fillStyle = desk;
    ctx.fillRect(x - 4, y + 10, 24, 6);
    ctx.fillStyle = deskDark;
    ctx.fillRect(x - 2, y + 10, 20, 2);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 4, y + 2, 8, 8);
  } else if (facing === Direction.UP) {
    ctx.fillStyle = desk;
    ctx.fillRect(x - 4, y - 4, 24, 6);
    ctx.fillStyle = deskDark;
    ctx.fillRect(x - 2, y, 20, 2);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 4, y + 6, 8, 8);
  } else if (facing === Direction.LEFT) {
    ctx.fillStyle = desk;
    ctx.fillRect(x - 4, y - 2, 6, 20);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 6, y + 4, 8, 8);
  } else {
    ctx.fillStyle = desk;
    ctx.fillRect(x + 14, y - 2, 6, 20);
    ctx.fillStyle = chair;
    ctx.fillRect(x + 2, y + 4, 8, 8);
  }
  ctx.fillStyle = '#1e293b';
  if (facing === Direction.DOWN) ctx.fillRect(x + 5, y + 6, 6, 4);
  else if (facing === Direction.UP) ctx.fillRect(x + 5, y + 2, 6, 4);
  else if (facing === Direction.LEFT) ctx.fillRect(x + 2, y + 5, 4, 6);
  else ctx.fillRect(x + 10, y + 5, 4, 6);
  ctx.fillStyle = '#38bdf8';
  if (facing === Direction.DOWN) ctx.fillRect(x + 6, y + 7, 4, 2);
  else if (facing === Direction.UP) ctx.fillRect(x + 6, y + 3, 4, 2);
  else if (facing === Direction.LEFT) ctx.fillRect(x + 3, y + 6, 2, 4);
  else ctx.fillRect(x + 11, y + 6, 2, 4);
}
