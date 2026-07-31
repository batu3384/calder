import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import type { ProviderId } from '../../../shared/types-provider.js';

export type PixelProviderId = ProviderId | 'unknown';

/** Subset used for locomotion — keep in sync with PixelVisualState work states. */
type PixelMotionState =
  | 'preparing'
  | 'unknown_working'
  | 'reading_project'
  | 'searching_code'
  | 'reading_files'
  | 'researching_web'
  | 'browsing'
  | 'using_mcp'
  | 'git_ops'
  | 'compacting'
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
  'searching_code',
  'reading_files',
  'researching_web',
  'browsing',
  'using_mcp',
  'git_ops',
  'compacting',
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

function metaHasHttpUrl(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  for (const key of ['url', 'uri', 'href']) {
    const value = meta[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return true;
  }
  return false;
}

/**
 * Map tool names across Claude / Codex / Cursor / Antigravity naming conventions.
 * Unknown tools stay unknown_working — never invent a station claim.
 */
export function mapToolNameToPixelState(
  toolName: string,
  sanitizedMeta?: Record<string, unknown>,
): PixelToolVisualState {
  const tool = toolName.toLowerCase();

  if (tool.startsWith('mcp__')) {
    if (/browser|playwright|navigate|puppeteer/.test(tool)) return 'browsing';
    if (/web|search|fetch|http/.test(tool) || metaHasHttpUrl(sanitizedMeta)) {
      return 'researching_web';
    }
    return 'using_mcp';
  }

  if (
    /websearch|webfetch|web_search|web_fetch|brave_search|tavily|serp|duckduck/.test(tool) ||
    metaHasHttpUrl(sanitizedMeta)
  ) {
    return 'researching_web';
  }

  if (/browser_|playwright|puppeteer|navigate|snapshot/.test(tool)) {
    return 'browsing';
  }

  if (/^git\b|git_status|git_diff|git_log|git_commit|git_push|git_pull/.test(tool)) {
    return 'git_ops';
  }

  if (/test|vitest|jest|pytest|mocha|cypress|phpunit|rspec|go test|cargo test/.test(tool)) {
    return 'running_tests';
  }
  if (/build|compile|webpack|vite|tsc|esbuild|rollup|cargo build|mvn|gradle|make\b/.test(tool)) {
    return 'building';
  }

  if (
    /semanticsearch|codebase_search|file_search|grep|glob|rg\b|find_by_name|list_dir|list_files/.test(
      tool,
    )
  ) {
    return 'searching_code';
  }

  if (/^read\b|read_file|view_image|cat\b|open_file/.test(tool)) {
    return 'reading_files';
  }

  // Legacy catch-all for generic "search"/"find" without web signal
  if (/search|find|ls\b/.test(tool)) {
    return 'searching_code';
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
