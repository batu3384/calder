export const TILE_SIZE = 16;
export const MAX_DELTA_TIME_SEC = 0.1;
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.12;
export const TYPE_FRAME_DURATION_SEC = 0.2;
export const WANDER_PAUSE_MIN_SEC = 1.2;
export const WANDER_PAUSE_MAX_SEC = 3.2;
export const WANDER_MOVES_BEFORE_REST_MIN = 2;
export const WANDER_MOVES_BEFORE_REST_MAX = 5;
export const SEAT_REST_MIN_SEC = 1.5;
export const SEAT_REST_MAX_SEC = 3.5;
export const DONE_BUBBLE_SEC = 4;
export const SUBAGENT_WINDOW_MS = 30 * 60 * 1000;

export enum Direction {
  DOWN = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
}

export enum CharacterState {
  IDLE = 'idle',
  WALK = 'walk',
  TYPE = 'type',
}

export type TileKind = 'floor' | 'wall';

export interface Seat {
  id: string;
  seatCol: number;
  seatRow: number;
  facingDir: Direction;
}

export interface OfficeCharacter {
  id: string;
  sessionId: string;
  state: CharacterState;
  dir: Direction;
  x: number;
  y: number;
  tileCol: number;
  tileRow: number;
  path: Array<{ col: number; row: number }>;
  moveProgress: number;
  frame: number;
  frameTimer: number;
  wanderTimer: number;
  wanderCount: number;
  wanderLimit: number;
  seatTimer: number;
  isActive: boolean;
  seatId: string | null;
  currentTool: string | null;
  isReading: boolean;
  providerId: string;
  bubble: 'none' | 'permission' | 'done';
  bubbleAge: number;
  name: string;
  activityLabel: string;
  contextPct: number | null;
  isSubagent: boolean;
  parentId: string | null;
}

export interface OfficeLayout {
  cols: number;
  rows: number;
  tiles: TileKind[][];
  seats: Seat[];
}
