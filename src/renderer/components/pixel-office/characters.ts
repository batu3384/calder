import { findPath } from './pathfinding.js';
import {
  CharacterState,
  Direction,
  type OfficeCharacter,
  type OfficeLayout,
  type Seat,
  SEAT_REST_MAX_SEC,
  SEAT_REST_MIN_SEC,
  TILE_SIZE,
  TYPE_FRAME_DURATION_SEC,
  WALK_FRAME_DURATION_SEC,
  WALK_SPEED_PX_PER_SEC,
  WANDER_MOVES_BEFORE_REST_MAX,
  WANDER_MOVES_BEFORE_REST_MIN,
  WANDER_PAUSE_MAX_SEC,
  WANDER_PAUSE_MIN_SEC,
} from './types.js';

/** Chance to leave desk for a short coffee walk when rest timer expires. */
export const WANDER_CHANCE = 0.22;

export interface OfficeRng {
  /** Uniform float in [0, 1). */
  random: () => number;
}

const defaultRng: OfficeRng = { random: () => Math.random() };

function tileCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

function directionBetween(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): Direction {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

function randomRange(rng: OfficeRng, min: number, max: number): number {
  return min + rng.random() * (max - min);
}

function randomInt(rng: OfficeRng, min: number, max: number): number {
  return min + Math.floor(rng.random() * (max - min + 1));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createOfficeCharacter(
  input: {
    id: string;
    sessionId: string;
    providerId: string;
    seat: Seat | null;
    name: string;
    isSubagent?: boolean;
    parentId?: string | null;
  },
  rng: OfficeRng = defaultRng,
): OfficeCharacter {
  const col = input.seat?.seatCol ?? 2;
  const row = input.seat?.seatRow ?? 2;
  const center = tileCenter(col, row);
  return {
    id: input.id,
    sessionId: input.sessionId,
    state: CharacterState.DESK,
    dir: input.seat?.facingDir ?? Direction.DOWN,
    x: center.x,
    y: center.y,
    tileCol: col,
    tileRow: row,
    path: [],
    moveProgress: 0,
    frame: 0,
    frameTimer: 0,
    wanderTimer: 0,
    wanderCount: 0,
    wanderLimit: randomInt(rng, WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX),
    seatTimer: randomRange(rng, SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC),
    isActive: false,
    seatId: input.seat?.id ?? null,
    currentTool: null,
    isReading: false,
    providerId: input.providerId,
    bubble: 'none',
    bubbleAge: 0,
    name: input.name,
    activityLabel: '',
    contextPct: null,
    isSubagent: Boolean(input.isSubagent),
    parentId: input.parentId ?? null,
    workPose: 'rest',
    visualState: 'idle',
  };
}

function advanceSeatedFrame(ch: OfficeCharacter, reducedMotion: boolean): void {
  if (reducedMotion) {
    ch.frame = 0;
    return;
  }
  const pose = ch.workPose;
  if (pose === 'rest') {
    ch.frame = 0;
    return;
  }
  if (pose === 'think') {
    if (ch.frameTimer >= 0.75) {
      ch.frameTimer -= 0.75;
      ch.frame = (ch.frame + 1) % 2;
    }
    return;
  }
  if (ch.frameTimer >= TYPE_FRAME_DURATION_SEC) {
    ch.frameTimer -= TYPE_FRAME_DURATION_SEC;
    ch.frame = (ch.frame + 1) % 2;
  }
}

export function updateOfficeCharacter(
  ch: OfficeCharacter,
  dt: number,
  layout: OfficeLayout,
  seats: Map<string, Seat>,
  walkable: Array<{ col: number; row: number }>,
  blocked: Set<string>,
  rng: OfficeRng = defaultRng,
  reducedMotion = prefersReducedMotion(),
): void {
  ch.frameTimer += dt;

  if (ch.bubble === 'think' && ch.workPose !== 'think') {
    ch.bubble = 'none';
  } else if (ch.workPose === 'think' && ch.bubble === 'none') {
    ch.bubble = 'think';
  }

  switch (ch.state) {
    case CharacterState.DESK: {
      advanceSeatedFrame(ch, reducedMotion);
      if (ch.isActive) {
        ch.seatTimer = 0;
        break;
      }
      if (ch.seatTimer > 0) {
        ch.seatTimer -= dt;
        break;
      }
      // Prefer staying seated — rare wander only (disabled under reduced motion / soft think).
      if (reducedMotion || ch.workPose === 'think' || rng.random() >= WANDER_CHANCE) {
        ch.seatTimer = randomRange(rng, SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
        if (ch.workPose !== 'think') ch.workPose = 'rest';
        ch.frame = 0;
        break;
      }
      ch.seatTimer = 0;
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
      ch.wanderTimer = randomRange(rng, WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      ch.wanderCount = 0;
      ch.wanderLimit = randomInt(rng, WANDER_MOVES_BEFORE_REST_MIN, WANDER_MOVES_BEFORE_REST_MAX);
      break;
    }
    case CharacterState.IDLE: {
      ch.frame = 0;
      if (ch.isActive) {
        if (!ch.seatId) {
          ch.state = CharacterState.DESK;
          ch.frameTimer = 0;
          break;
        }
        const seat = seats.get(ch.seatId);
        if (seat) {
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            seat.seatCol,
            seat.seatRow,
            layout.tiles,
            blocked,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
          } else {
            ch.state = CharacterState.DESK;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
        break;
      }
      if (reducedMotion && ch.seatId) {
        // Snap back to desk instead of pacing.
        const seat = seats.get(ch.seatId);
        if (seat) {
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          const center = tileCenter(seat.seatCol, seat.seatRow);
          ch.x = center.x;
          ch.y = center.y;
          ch.dir = seat.facingDir;
          ch.state = CharacterState.DESK;
          ch.seatTimer = randomRange(rng, SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
          ch.workPose = 'rest';
          ch.path = [];
        }
        break;
      }
      ch.wanderTimer -= dt;
      if (ch.wanderTimer > 0) break;
      if (ch.wanderCount >= ch.wanderLimit && ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const path = findPath(
            ch.tileCol,
            ch.tileRow,
            seat.seatCol,
            seat.seatRow,
            layout.tiles,
            blocked,
          );
          if (path.length > 0) {
            ch.path = path;
            ch.moveProgress = 0;
            ch.state = CharacterState.WALK;
            ch.frame = 0;
            ch.frameTimer = 0;
            break;
          }
        }
      }
      if (walkable.length > 0) {
        const target = walkable[Math.floor(rng.random() * walkable.length)]!;
        const path = findPath(ch.tileCol, ch.tileRow, target.col, target.row, layout.tiles, blocked);
        if (path.length > 0) {
          ch.path = path;
          ch.moveProgress = 0;
          ch.state = CharacterState.WALK;
          ch.frame = 0;
          ch.frameTimer = 0;
          ch.wanderCount += 1;
        }
      }
      ch.wanderTimer = randomRange(rng, WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
      break;
    }
    case CharacterState.WALK: {
      if (!reducedMotion && ch.frameTimer >= WALK_FRAME_DURATION_SEC) {
        ch.frameTimer -= WALK_FRAME_DURATION_SEC;
        ch.frame = (ch.frame + 1) % 4;
      }
      if (ch.path.length === 0) {
        const center = tileCenter(ch.tileCol, ch.tileRow);
        ch.x = center.x;
        ch.y = center.y;
        if (ch.isActive) {
          const seat = ch.seatId ? seats.get(ch.seatId) : null;
          if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
            ch.state = CharacterState.DESK;
            ch.dir = seat.facingDir;
          } else if (!ch.seatId) {
            ch.state = CharacterState.DESK;
          } else {
            ch.state = CharacterState.IDLE;
          }
        } else {
          const seat = ch.seatId ? seats.get(ch.seatId) : null;
          if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
            ch.state = CharacterState.DESK;
            ch.dir = seat.facingDir;
            ch.seatTimer = randomRange(rng, SEAT_REST_MIN_SEC, SEAT_REST_MAX_SEC);
            ch.workPose = 'rest';
            ch.wanderCount = 0;
          } else {
            ch.state = CharacterState.IDLE;
            ch.wanderTimer = randomRange(rng, WANDER_PAUSE_MIN_SEC, WANDER_PAUSE_MAX_SEC);
          }
        }
        ch.frame = 0;
        ch.frameTimer = 0;
        break;
      }
      const nextTile = ch.path[0]!;
      ch.dir = directionBetween(ch.tileCol, ch.tileRow, nextTile.col, nextTile.row);
      ch.moveProgress += (WALK_SPEED_PX_PER_SEC / TILE_SIZE) * dt;
      const fromCenter = tileCenter(ch.tileCol, ch.tileRow);
      const toCenter = tileCenter(nextTile.col, nextTile.row);
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
      ch.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;
      if (ch.moveProgress >= 1) {
        ch.tileCol = nextTile.col;
        ch.tileRow = nextTile.row;
        ch.x = toCenter.x;
        ch.y = toCenter.y;
        ch.path.shift();
        ch.moveProgress = 0;
      }
      if (ch.isActive && ch.seatId) {
        const seat = seats.get(ch.seatId);
        if (seat) {
          const last = ch.path[ch.path.length - 1];
          if (!last || last.col !== seat.seatCol || last.row !== seat.seatRow) {
            const newPath = findPath(
              ch.tileCol,
              ch.tileRow,
              seat.seatCol,
              seat.seatRow,
              layout.tiles,
              blocked,
            );
            if (newPath.length > 0) {
              ch.path = newPath;
              ch.moveProgress = 0;
            }
          }
        }
      }
      break;
    }
  }
}
