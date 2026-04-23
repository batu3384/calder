import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PersistedState } from '../shared/types/project-state';

export type { SessionRecord, ProjectRecord, Preferences, PersistedState } from '../shared/types';

const STATE_DIR = path.join(os.homedir(), '.calder');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const COPILOT_SESSION_STATE_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const COPILOT_BACKFILL_WINDOW_MS = 2 * 60 * 1000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SUPPORTED_PROVIDER_IDS = new Set(['claude', 'codex', 'copilot', 'gemini', 'qwen']);

function defaultState(): PersistedState {
  return {
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: { soundOnSessionWaiting: true, notificationsDesktop: true, debugMode: false, sessionHistoryEnabled: true, insightsEnabled: true, autoTitleEnabled: true },
  };
}

export function loadState(): PersistedState {
  let sawCandidate = false;
  for (const file of [STATE_FILE, STATE_FILE + '.tmp']) {
    try {
      if (!fs.existsSync(file)) continue;
      sawCandidate = true;
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.version !== 1) continue;
      migrateSessionIds(parsed);
      if (file !== STATE_FILE) {
        console.info('Recovered state from temp file');
      }
      return parsed;
    } catch {
      continue;
    }
  }
  if (sawCandidate) {
    console.warn('No valid state file found, using defaults');
  }
  return defaultState();
}

/** Migrate legacy claudeSessionId fields to cliSessionId */
function migrateSessionIds(state: PersistedState): void {
  const normalizeProviderId = (value: unknown): string => {
    if (typeof value !== 'string') return 'claude';
    return SUPPORTED_PROVIDER_IDS.has(value) ? value : 'claude';
  };

  for (const project of state.projects) {
    const usedCliSessionIds = new Set(
      project.sessions
        .map((session) => session.cliSessionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    for (const session of project.sessions) {
      const s = session as unknown as Record<string, unknown>;
      if (s.claudeSessionId !== undefined && s.cliSessionId === undefined) {
        s.cliSessionId = s.claudeSessionId;
      }
      s.providerId = normalizeProviderId(s.providerId);
      if (
        s.providerId === 'copilot'
        && (s.cliSessionId === undefined || s.cliSessionId === null || s.cliSessionId === '')
        && typeof s.createdAt === 'string'
      ) {
        const inferredId = inferCopilotSessionId(project.path, s.createdAt, usedCliSessionIds);
        if (inferredId) {
          s.cliSessionId = inferredId;
          usedCliSessionIds.add(inferredId);
        }
      }
    }
  }

  if (state.preferences.defaultProvider !== undefined) {
    state.preferences.defaultProvider = normalizeProviderId(state.preferences.defaultProvider) as PersistedState['preferences']['defaultProvider'];
  }
}

function normalizePathHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return path.normalize(trimmed).replace(/[\\/]+$/, '').toLowerCase();
}

function parseYamlScalar(contents: string, key: string): string | null {
  const pattern = new RegExp(`^${key}:\\s*(.*)$`, 'm');
  const match = contents.match(pattern);
  if (!match) return null;
  const raw = match[1]?.trim() ?? '';
  if (!raw) return null;
  return raw.replace(/^['"]|['"]$/g, '');
}

function inferCopilotSessionId(projectPath: string, createdAt: string, usedIds: Set<string>): string | null {
  const sessionCreatedAtMs = Date.parse(createdAt);
  if (!Number.isFinite(sessionCreatedAtMs)) return null;
  const projectPathHint = normalizePathHint(projectPath);
  if (!projectPathHint) return null;

  try {
    if (!fs.existsSync(COPILOT_SESSION_STATE_DIR)) return null;
    let best: { id: string; delta: number } | null = null;
    for (const entry of fs.readdirSync(COPILOT_SESSION_STATE_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workspacePath = path.join(COPILOT_SESSION_STATE_DIR, entry.name, 'workspace.yaml');
      if (!fs.existsSync(workspacePath)) continue;
      const contents = fs.readFileSync(workspacePath, 'utf-8');
      const id = parseYamlScalar(contents, 'id') ?? entry.name;
      if (usedIds.has(id)) continue;
      const cwd = parseYamlScalar(contents, 'cwd');
      if (!cwd || normalizePathHint(cwd) !== projectPathHint) continue;
      const copilotCreatedAtMs = Date.parse(parseYamlScalar(contents, 'created_at') ?? '');
      if (!Number.isFinite(copilotCreatedAtMs)) continue;
      const delta = Math.abs(copilotCreatedAtMs - sessionCreatedAtMs);
      if (delta > COPILOT_BACKFILL_WINDOW_MS) continue;
      if (!best || delta < best.delta) best = { id, delta };
    }
    return best?.id ?? null;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  lastState = state;
  saveTimer = setTimeout(() => {
    writeStateAtomically(state);
    saveTimer = null;
  }, 300);
}

let lastState: PersistedState | null = null;

export function flushState(): void {
  if (lastState) {
    saveStateSync(lastState);
  }
}

export function saveStateSync(state: PersistedState): void {
  writeStateAtomically(state);
}

function writeStateAtomically(state: PersistedState): void {
  const serialized = JSON.stringify(state, null, 2);
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, serialized, 'utf-8');
    try {
      fs.renameSync(tmpFile, STATE_FILE);
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') {
        fs.writeFileSync(STATE_FILE, serialized, 'utf-8');
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}
