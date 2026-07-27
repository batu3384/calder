import { vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

import * as fs from 'fs';
import path from 'path';

import { CURRENT_PERSISTED_STATE_VERSION } from '../shared/types/project-state';
import type { PersistedState } from './store';
import {
  __resetStoreCacheForTests,
  flushState,
  loadState,
  saveState,
  saveStateSync,
} from './store';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockRenameSync = vi.mocked(fs.renameSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);

const DEFAULT_STATE: PersistedState = {
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

beforeEach(() => {
  __resetStoreCacheForTests();
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockRenameSync.mockReset();
  mockReaddirSync.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('loadState', () => {
  it('returns default state when file does not exist', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(false);
    expect(loadState()).toEqual(DEFAULT_STATE);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ignores unknown legacy state when Calder state is missing', () => {
    mockExistsSync.mockImplementation(
      (file) => String(file) === '/mock/home/.legacy-app/state.json',
    );
    mockReadFileSync.mockReturnValue(JSON.stringify(DEFAULT_STATE));

    expect(loadState()).toEqual(DEFAULT_STATE);
    expect(mockReadFileSync).not.toHaveBeenCalledWith('/mock/home/.legacy-app/state.json', 'utf-8');
  });

  it('parses valid JSON', () => {
    const state: PersistedState = {
      version: 1,
      projects: [
        {
          id: 'p1',
          name: 'Test',
          path: '/test',
          sessions: [],
          activeSessionId: null,
          layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
        },
      ],
      activeProjectId: 'p1',
      preferences: {
        soundOnSessionWaiting: true,
        notificationsDesktop: true,
        debugMode: false,
        sessionHistoryEnabled: true,
        insightsEnabled: true,
        autoTitleEnabled: true,
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));
    expect(loadState()).toEqual({
      ...state,
      version: CURRENT_PERSISTED_STATE_VERSION,
    });
  });

  it('returns default state on invalid JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not json');
    expect(loadState()).toEqual(DEFAULT_STATE);
    expect(warnSpy).toHaveBeenCalledWith('No valid state file found, using defaults');
  });

  it('returns default state on wrong version', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: 99 }));
    expect(loadState()).toEqual(DEFAULT_STATE);
    expect(warnSpy).toHaveBeenCalledWith('No valid state file found, using defaults');
  });

  it('logs recovery as info when temp state is used', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    mockExistsSync.mockImplementation((file) => String(file).endsWith('.tmp'));
    mockReadFileSync.mockReturnValue(JSON.stringify(DEFAULT_STATE));

    expect(loadState()).toEqual(DEFAULT_STATE);
    expect(infoSpy).toHaveBeenCalledWith('Recovered state from temp file');
  });

  it('prefers in-memory cached state after saveState before disk flush', () => {
    const newState: PersistedState = {
      ...DEFAULT_STATE,
      projects: [
        {
          id: 'proj-1',
          name: 'Repo',
          path: '/repo',
          sessions: [],
          activeSessionId: null,
          layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
        },
      ],
      activeProjectId: 'proj-1',
    };
    saveState(newState);

    // Even if disk still has stale contents, loadState should expose the latest accepted snapshot.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(DEFAULT_STATE));

    expect(loadState()).toEqual(newState);
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });
});

describe('saveState', () => {
  it('debounces writes by 300ms', () => {
    saveState(DEFAULT_STATE);
    expect(mockWriteFileSync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(mockWriteFileSync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('resets timer on rapid calls', () => {
    saveState(DEFAULT_STATE);
    vi.advanceTimersByTime(200);

    const updated = { ...DEFAULT_STATE, activeProjectId: 'p1' };
    saveState(updated);
    vi.advanceTimersByTime(300);

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = JSON.parse(String(mockWriteFileSync.mock.calls[0][1]));
    expect(written.activeProjectId).toBe('p1');
  });

  it('creates directory if needed', () => {
    mockExistsSync.mockReturnValue(false);
    saveState(DEFAULT_STATE);
    vi.advanceTimersByTime(300);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.calder'), {
      recursive: true,
    });
  });
});

describe('saveStateSync', () => {
  it('writes immediately without debounce', () => {
    saveStateSync(DEFAULT_STATE);
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });

  it('falls back to writing the final state file when tmp rename hits ENOENT', () => {
    mockExistsSync.mockReturnValue(true);
    mockRenameSync.mockImplementation(() => {
      const err = new Error('missing tmp file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    saveStateSync(DEFAULT_STATE);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync.mock.calls[0]?.[0]).toBe(
      path.join('/mock/home', '.calder', 'state.json.tmp'),
    );
    expect(mockWriteFileSync.mock.calls[1]?.[0]).toBe(
      path.join('/mock/home', '.calder', 'state.json'),
    );
  });
});

describe('flushState', () => {
  it('writes pending state immediately', () => {
    saveState(DEFAULT_STATE);
    flushState();
    expect(mockWriteFileSync).toHaveBeenCalledOnce();
  });
});

describe('migratePersistedState', () => {
  function makeState(sessions: Record<string, unknown>[], version: 1 | 2 = 1): string {
    const state: PersistedState = {
      version,
      projects: [
        {
          id: 'p1',
          name: 'Test',
          path: '/test',
          sessions: sessions as any,
          activeSessionId: null,
          layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
        },
      ],
      activeProjectId: 'p1',
      preferences: {
        soundOnSessionWaiting: true,
        notificationsDesktop: true,
        debugMode: false,
        sessionHistoryEnabled: true,
        insightsEnabled: true,
        autoTitleEnabled: true,
      },
    };
    return JSON.stringify(state);
  }

  it('migrates claudeSessionId to cliSessionId', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([{ id: 's1', name: 'S1', claudeSessionId: 'cs-123', createdAt: '2025-01-01' }]),
    );
    const loaded = loadState();
    const session = loaded.projects[0].sessions[0] as any;
    expect(session.cliSessionId).toBe('cs-123');
  });

  it('sets default providerId to claude', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([{ id: 's1', name: 'S1', cliSessionId: null, createdAt: '2025-01-01' }]),
    );
    const loaded = loadState();
    const session = loaded.projects[0].sessions[0] as any;
    expect(session.providerId).toBe('claude');
  });

  it('preserves existing cliSessionId over claudeSessionId', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([
        {
          id: 's1',
          name: 'S1',
          claudeSessionId: 'old-id',
          cliSessionId: 'new-id',
          createdAt: '2025-01-01',
        },
      ]),
    );
    const loaded = loadState();
    const session = loaded.projects[0].sessions[0] as any;
    expect(session.cliSessionId).toBe('new-id');
  });

  it('handles sessions with neither claudeSessionId nor cliSessionId', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([{ id: 's1', name: 'S1', createdAt: '2025-01-01' }]),
    );
    const loaded = loadState();
    expect(loaded.projects[0].sessions[0]).toBeDefined();
  });

  it('clears cli session ids when migrating unsupported providers', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([
        {
          id: 's1',
          name: 'S1',
          providerId: 'legacy-vendor',
          cliSessionId: 'legacy-session-1',
          createdAt: '2025-01-01',
        },
        {
          id: 's2',
          name: 'S2',
          providerId: 'retired-cli',
          cliSessionId: 'retired-session-1',
          createdAt: '2025-01-01',
        },
      ]),
    );

    const loaded = loadState();
    const sessions = loaded.projects[0].sessions as any[];
    expect(sessions[0].providerId).toBe('claude');
    expect(sessions[0].cliSessionId).toBeUndefined();
    expect(sessions[0].name).toBe('S1 (migrated from legacy-vendor)');
    expect(sessions[1].providerId).toBe('claude');
    expect(sessions[1].cliSessionId).toBeUndefined();
    expect(sessions[1].name).toBe('S2 (migrated from retired-cli)');
  });

  it('normalizes removed provider ids to claude for legacy sessions', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      makeState([
        { id: 's1', name: 'S1', providerId: 'minimax', createdAt: '2025-01-01' },
        { id: 's2', name: 'S2', providerId: 'blackbox', createdAt: '2025-01-01' },
        { id: 's3', name: 'S3', providerId: 'codex', createdAt: '2025-01-01' },
      ]),
    );

    const loaded = loadState();
    const sessions = loaded.projects[0].sessions as any[];
    expect(sessions[0].providerId).toBe('claude');
    expect(sessions[0].name).toBe('S1 (migrated from minimax)');
    expect(sessions[1].providerId).toBe('claude');
    expect(sessions[1].name).toBe('S2 (migrated from blackbox)');
    expect(sessions[2].providerId).toBe('codex');
    expect(sessions[2].name).toBe('S3');
  });

  it('normalizes unsupported defaultProvider to claude', () => {
    const state: PersistedState = {
      version: 1,
      projects: [
        {
          id: 'p1',
          name: 'Test',
          path: '/test',
          sessions: [
            {
              id: 's1',
              name: 'S1',
              cliSessionId: null,
              createdAt: '2025-01-01',
              providerId: 'claude',
            } as any,
          ],
          activeSessionId: null,
          layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
        },
      ],
      activeProjectId: 'p1',
      preferences: {
        soundOnSessionWaiting: true,
        notificationsDesktop: true,
        debugMode: false,
        sessionHistoryEnabled: true,
        insightsEnabled: true,
        autoTitleEnabled: true,
        defaultProvider: 'minimax' as any,
      },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    const loaded = loadState();
    expect(loaded.preferences.defaultProvider).toBe('claude');
  });

  it('strips legacy mobile sessions and normalizes mobile surface focus to session tabs', () => {
    const state: PersistedState = {
      version: 1,
      projects: [
        {
          id: 'p1',
          name: 'Test',
          path: '/test',
          sessions: [
            {
              id: 'cli-1',
              name: 'CLI',
              cliSessionId: null,
              createdAt: '2025-01-01',
            } as any,
            {
              id: 'mobile-1',
              name: 'Mobile',
              type: 'mobile',
              cliSessionId: null,
              createdAt: '2025-01-01',
            } as any,
          ],
          activeSessionId: 'mobile-1',
          layout: { mode: 'tabs', splitPanes: ['mobile-1'], splitDirection: 'horizontal' },
          surface: {
            kind: 'mobile',
            active: true,
            tabFocus: 'mobile',
            tabOrder: ['cli', 'mobile'],
          } as any,
        },
      ],
      activeProjectId: 'p1',
      preferences: DEFAULT_STATE.preferences,
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(state));

    const loaded = loadState();
    const project = loaded.projects[0] as any;
    expect(project.sessions).toHaveLength(1);
    expect(project.sessions[0].id).toBe('cli-1');
    expect(project.activeSessionId).toBe('cli-1');
    expect(project.layout.splitPanes).toEqual([]);
    expect(project.surface.kind).toBe('web');
    expect(project.surface.tabFocus).toBe('session');
    expect(project.surface.tabOrder).toEqual(['cli']);
    expect(loaded.version).toBe(CURRENT_PERSISTED_STATE_VERSION);
  });
});
