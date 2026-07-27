import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PersistedState } from '../shared/types/project-state';
import { CURRENT_PERSISTED_STATE_VERSION } from '../shared/types/project-state';
import { SUPPORTED_PROVIDER_IDS } from './providers/registry';

export type { PersistedState, Preferences, ProjectRecord } from '../shared/types/project-state';
export type { SessionRecord } from '../shared/types/session';

const STATE_DIR = path.join(os.homedir(), '.calder');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cachedState: PersistedState | null = null;

export function __resetStoreCacheForTests(): void {
  cachedState = null;
  lastState = null;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function defaultState(): PersistedState {
  return {
    version: CURRENT_PERSISTED_STATE_VERSION,
    projects: [],
    activeProjectId: null,
    preferences: {
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      debugMode: false,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
    },
  };
}

export function loadState(): PersistedState {
  if (cachedState) {
    return cachedState;
  }

  let sawCandidate = false;
  for (const file of [STATE_FILE, STATE_FILE + '.tmp']) {
    try {
      if (!fs.existsSync(file)) continue;
      sawCandidate = true;
      const raw = fs.readFileSync(file, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.version !== 1 && parsed.version !== CURRENT_PERSISTED_STATE_VERSION) continue;
      migratePersistedState(parsed);
      if (file !== STATE_FILE) {
        console.info('Recovered state from temp file');
      }
      cachedState = parsed;
      return parsed;
    } catch {
      continue;
    }
  }
  if (sawCandidate) {
    console.warn('No valid state file found, using defaults');
  }
  const fallback = defaultState();
  cachedState = fallback;
  return fallback;
}

/** Migrate legacy persisted state (v1 fields, removed session types) to current shape. */
function migratePersistedState(state: PersistedState): void {
  const normalizeProviderId = (value: unknown): string => {
    if (typeof value !== 'string') return 'claude';
    if (value === 'gemini') return 'antigravity';
    return (SUPPORTED_PROVIDER_IDS as readonly string[]).includes(value) ? value : 'claude';
  };

  for (const project of state.projects) {
    project.sessions = project.sessions.filter((session) => {
      const t = (session as { type?: string }).type;
      return t !== 'remote-terminal' && t !== 'mobile';
    });
    if (
      project.activeSessionId &&
      !project.sessions.some((session) => session.id === project.activeSessionId)
    ) {
      project.activeSessionId = project.sessions[0]?.id ?? null;
    }
    if (project.layout?.splitPanes) {
      project.layout.splitPanes = project.layout.splitPanes.filter((sessionId) =>
        project.sessions.some((session) => session.id === sessionId),
      );
    }
    const surface = project.surface as
      | { kind?: string; tabFocus?: string; tabOrder?: unknown }
      | undefined;
    if (surface) {
      if (surface.kind === 'mobile') surface.kind = 'web';
      // Legacy mobile inspect tab; restore normal session tab focus (surface may stay web/cli).
      if (surface.tabFocus === 'mobile') surface.tabFocus = 'session';
      if (Array.isArray(surface.tabOrder)) {
        surface.tabOrder = (surface.tabOrder as string[]).filter((entry) => entry === 'cli');
      }
    }

    for (const session of project.sessions) {
      const s = session as unknown as Record<string, unknown>;
      delete s.remoteHostName;
      delete s.shareMode;
      const rawProvider = typeof s.providerId === 'string' ? s.providerId : 'claude';
      const normalized = normalizeProviderId(s.providerId);
      if (normalized !== rawProvider) {
        delete s.cliSessionId;
        delete s.claudeSessionId;
        if (typeof s.name === 'string' && s.name.trim()) {
          const marker = `(migrated from ${rawProvider})`;
          if (!s.name.includes(marker) && !s.name.includes('(migrated from ')) {
            s.name = `${s.name} ${marker}`;
          }
        }
      }
      if (s.claudeSessionId !== undefined && s.cliSessionId === undefined) {
        s.cliSessionId = s.claudeSessionId;
      }
      s.providerId = normalizeProviderId(s.providerId);
    }
  }

  if (state.preferences.defaultProvider !== undefined) {
    state.preferences.defaultProvider = normalizeProviderId(
      state.preferences.defaultProvider,
    ) as PersistedState['preferences']['defaultProvider'];
  }

  state.version = CURRENT_PERSISTED_STATE_VERSION;
}

export function saveState(state: PersistedState): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  lastState = state;
  cachedState = state;
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
  cachedState = state;
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
