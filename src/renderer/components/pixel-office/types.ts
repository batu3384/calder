export const TILE_SIZE = 16;
export const MAX_DELTA_TIME_SEC = 0.1;
export const WALK_SPEED_PX_PER_SEC = 40;
export const WALK_FRAME_DURATION_SEC = 0.14;
export const TYPE_FRAME_DURATION_SEC = 0.22;
/** Idle agents sit at desk most of the time — rare coffee walks. */
export const WANDER_PAUSE_MIN_SEC = 10;
export const WANDER_PAUSE_MAX_SEC = 22;
export const WANDER_MOVES_BEFORE_REST_MIN = 1;
export const WANDER_MOVES_BEFORE_REST_MAX = 2;
export const SEAT_REST_MIN_SEC = 12;
export const SEAT_REST_MAX_SEC = 28;
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
  /** Seated at desk — work vs rest distinguished by workPose. */
  DESK = 'desk',
}

export type TileKind = 'floor' | 'wall';

export interface Seat {
  id: string;
  seatCol: number;
  seatRow: number;
  facingDir: Direction;
}

export type { WorkPose } from './work-pose.js';

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
  bubble: 'none' | 'permission' | 'done' | 'think';
  bubbleAge: number;
  name: string;
  activityLabel: string;
  contextPct: number | null;
  isSubagent: boolean;
  parentId: string | null;
  /** Evidence-derived pose for animation + monitor FX. */
  workPose: WorkPose;
  visualState: string;
}

export interface OfficeLayout {
  cols: number;
  rows: number;
  tiles: TileKind[][];
  seats: Seat[];
}
