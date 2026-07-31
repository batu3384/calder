import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { type PixelVisualState, resolvePixelVisualState } from './visual-resolver.js';

export type PixelStudioStation =
  | 'idle'
  | 'research'
  | 'files'
  | 'git'
  | 'terminal'
  | 'test_build'
  | 'security'
  | 'completed';

export type PixelStudioScene = 'normal' | 'celebration' | 'error' | 'gate';

export interface PixelStudioPresentation {
  station: PixelStudioStation;
  visualState: PixelVisualState;
  subagentCount: number;
  scene: PixelStudioScene;
}

const GIT_ACTIVITY_MS = 2 * 60 * 1000;
const SUBAGENT_WINDOW_MS = 30 * 60 * 1000;
/** Studio / compact prefer recent tail so long runs stay accurate without full history. */
export const STUDIO_EVENT_WINDOW = 400;

// Keep local to avoid pixel-agent → session-inspector import cycle; mirror evidence-view-support.
function isGitChangeEvent(event: EvidenceEvent): boolean {
  return event.type === 'git_change_observed' || event.type === 'file_change_reported';
}

const STATION_POSITIONS: Record<PixelStudioStation, [number, number]> = {
  research: [16.67, 22],
  files: [50, 22],
  git: [83.33, 22],
  terminal: [16.67, 72],
  test_build: [50, 72],
  security: [83.33, 72],
  idle: [50, 47],
  completed: [50, 47],
};

export function studioStationLabel(station: PixelStudioStation): string {
  switch (station) {
    case 'research':
      return 'Station: Research';
    case 'files':
      return 'Station: Files';
    case 'git':
      return 'Station: Git';
    case 'terminal':
      return 'Station: Terminal';
    case 'test_build':
      return 'Station: Test & build';
    case 'security':
      return 'Station: Security';
    case 'completed':
      return 'Station: Completed';
    default:
      return 'Station: Idle';
  }
}

export function studioStationPosition(station: PixelStudioStation): [number, number] {
  return STATION_POSITIONS[station];
}

export function resolveStudioStation(state: PixelVisualState): PixelStudioStation {
  switch (state) {
    case 'waiting_for_approval':
    case 'blocked':
    case 'failed':
      return 'security';
    case 'running_command':
      return 'terminal';
    case 'running_tests':
    case 'building':
      return 'test_build';
    case 'reading_project':
      return 'research';
    case 'editing_code':
      return 'files';
    case 'completed':
      return 'completed';
    case 'preparing':
    case 'unknown_working':
      return 'idle';
    default:
      return 'idle';
  }
}

function hasRecentGitActivity(events: EvidenceEvent[], now: number): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (now - event.timestamp > GIT_ACTIVITY_MS) break;
    if (isGitChangeEvent(event) || event.type === 'git_state_captured') return true;
  }
  return false;
}

export function resolveStudioScene(visualState: PixelVisualState): PixelStudioScene {
  switch (visualState) {
    case 'completed':
      return 'celebration';
    case 'failed':
      return 'error';
    case 'blocked':
    case 'waiting_for_approval':
      return 'gate';
    default:
      return 'normal';
  }
}

export function studioSceneLabel(scene: PixelStudioScene): string {
  switch (scene) {
    case 'celebration':
      return 'Scene: Session completed';
    case 'error':
      return 'Scene: Operation failed';
    case 'gate':
      return 'Scene: Security gate';
    default:
      return 'Scene: Active workspace';
  }
}

function subagentKey(event: EvidenceEvent): string {
  if (event.subagentId) return event.subagentId;
  if (typeof event.sanitizedMeta?.subagentId === 'string') {
    return event.sanitizedMeta.subagentId;
  }
  return event.eventId;
}

export function countActiveSubagents(events: EvidenceEvent[], now: number): number {
  const open = new Set<string>();
  const anonymousStarts: string[] = [];
  for (const event of events) {
    if (now - event.timestamp > SUBAGENT_WINDOW_MS) continue;
    const hasExplicitId = Boolean(
      event.subagentId ||
        (typeof event.sanitizedMeta?.subagentId === 'string' && event.sanitizedMeta.subagentId),
    );
    if (event.type === 'subagent_started') {
      const key = subagentKey(event);
      open.add(key);
      if (!hasExplicitId) anonymousStarts.push(key);
    }
    if (event.type === 'subagent_completed') {
      if (hasExplicitId) {
        open.delete(subagentKey(event));
      } else if (anonymousStarts.length > 0) {
        // ponytail: FIFO close for id-less pairs; upgrade = require subagentId always
        open.delete(anonymousStarts.shift()!);
      }
    }
  }
  return Math.min(open.size, 9);
}

export function sliceEventsForStudio(events: EvidenceEvent[]): EvidenceEvent[] {
  if (events.length <= STUDIO_EVENT_WINDOW) return events;
  return events.slice(-STUDIO_EVENT_WINDOW);
}

export function resolvePixelStudioPresentation(
  events: EvidenceEvent[],
  now = Date.now(),
): PixelStudioPresentation {
  const windowed = sliceEventsForStudio(events);
  const visualState = resolvePixelVisualState(windowed, now);
  let station = resolveStudioStation(visualState);

  if (
    (station === 'idle' || station === 'research' || station === 'files') &&
    hasRecentGitActivity(windowed, now)
  ) {
    station = 'git';
  }

  return {
    station,
    visualState,
    subagentCount: countActiveSubagents(windowed, now),
    scene: resolveStudioScene(visualState),
  };
}
