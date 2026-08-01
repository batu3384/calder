import type { PixelVisualState } from '../pixel-agent/visual-resolver.js';

/** Desk posture driven by evidence — not the same loop for every task. */
export type WorkPose = 'rest' | 'type' | 'read' | 'think' | 'browse' | 'build';

export function workPoseFromVisualState(
  state: PixelVisualState,
  isActive: boolean,
): WorkPose {
  // Open PTY / boot: show soft think at desk without marking agent "Working".
  if (state === 'preparing') return 'think';
  if (!isActive) return 'rest';
  switch (state) {
    case 'editing_code':
    case 'running_command':
      return 'type';
    case 'running_tests':
    case 'building':
    case 'git_ops':
      return 'build';
    case 'reading_files':
    case 'reading_project':
    case 'searching_code':
      return 'read';
    case 'researching_web':
    case 'browsing':
    case 'using_mcp':
      return 'browse';
    case 'unknown_working':
    case 'compacting':
      return 'think';
    default:
      return 'type';
  }
}
