import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import type { ProviderId } from '../../../shared/types-provider.js';

export type PixelProviderId = ProviderId | 'unknown';

/** Subset used for locomotion — keep in sync with PixelVisualState work states. */
type PixelMotionState =
  | 'preparing'
  | 'unknown_working'
  | 'reading_project'
  | 'editing_code'
  | 'running_command'
  | 'running_tests'
  | 'building';

export type PixelToolVisualState =
  | PixelMotionState
  | 'idle'
  | 'waiting_for_approval'
  | 'blocked'
  | 'failed'
  | 'completed';

const PROVIDER_LABELS: Record<PixelProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
  unknown: 'Agent',
};

/** States that warrant active locomotion / bob — not decorative idle loop. */
const MOTION_ACTIVE_STATES = new Set<string>([
  'preparing',
  'unknown_working',
  'reading_project',
  'editing_code',
  'running_command',
  'running_tests',
  'building',
]);

export function isPixelMotionActive(state: string): boolean {
  return MOTION_ACTIVE_STATES.has(state);
}

export function normalizePixelProviderId(raw: string | undefined | null): PixelProviderId {
  if (raw === 'claude' || raw === 'codex' || raw === 'cursor' || raw === 'antigravity') {
    return raw;
  }
  return 'unknown';
}

export function pixelProviderLabel(providerId: PixelProviderId): string {
  return PROVIDER_LABELS[providerId];
}

export function resolvePixelProviderId(
  events: EvidenceEvent[],
  fallback?: string | null,
): PixelProviderId {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const id = normalizePixelProviderId(events[index]?.providerId);
    if (id !== 'unknown') return id;
  }
  return normalizePixelProviderId(fallback);
}

/**
 * Map tool names across Claude / Codex / Cursor / Antigravity naming conventions.
 * Unknown tools stay unknown_working — never invent a station claim.
 */
export function mapToolNameToPixelState(toolName: string): PixelToolVisualState {
  const tool = toolName.toLowerCase();

  if (
    /test|vitest|jest|pytest|mocha|playwright|cypress|phpunit|rspec|go test|cargo test/.test(tool)
  ) {
    return 'running_tests';
  }
  if (/build|compile|webpack|vite|tsc|esbuild|rollup|cargo build|mvn|gradle|make\b/.test(tool)) {
    return 'building';
  }
  if (
    /read|grep|glob|search|find|list_dir|list_files|ls\b|cat\b|view_image|semanticsearch|codebase_search|file_search|rg\b/.test(
      tool,
    )
  ) {
    return 'reading_project';
  }
  if (
    /write|edit|strreplace|apply_patch|applypatch|search_replace|create_file|delete_file|notebook|multiedit|edit_notebook/.test(
      tool,
    )
  ) {
    return 'editing_code';
  }
  if (
    /shell|bash|terminal|run_terminal|run_command|execute|powershell|cmd\b|zsh|process|await/.test(
      tool,
    )
  ) {
    return 'running_command';
  }

  return 'unknown_working';
}
