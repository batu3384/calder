import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockBuildResumeWithPrompt = vi.fn();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    session: { buildResumeWithPrompt: mockBuildResumeWithPrompt },
  },
});

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

vi.mock('./session-cost.js', () => ({
  getCost: vi.fn().mockReturnValue(null),
  restoreCost: vi.fn(),
}));

vi.mock('./session-context.js', () => ({
  restoreContext: vi.fn(),
}));

import { getCost } from './session-cost.js';
import { _resetForTesting, appState } from './state';
import {
  addProject,
  addProjectWithSessions,
  mockCostData as mockCostDataFn,
} from './state/appstate-test-support';

const mockGetCost = vi.mocked(getCost);

function mockCostData() {
  mockCostDataFn(mockGetCost);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoad.mockReset();
  mockSave.mockReset();
  mockBuildResumeWithPrompt.mockReset();
  uuidCounter = 0;
  mockGetCost.mockReturnValue(null);
  mockBuildResumeWithPrompt.mockResolvedValue('Resume prompt');
  _resetForTesting();
});

describe('archiveSession via removeSession()', () => {
  it('archives CLI session on close', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'My Session')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-123');
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe('My Session');
    expect(history[0].cliSessionId).toBe('cli-123');
    expect(history[0].createdAt).toBe(session.createdAt);
    expect(history[0].closedAt).toBeDefined();
    expect(history[0].providerId).toBe('claude');
  });

  it('captures cost data when available', () => {
    mockCostData();
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-cost');
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history[0].cost).not.toBeNull();
    expect(history[0].cost!.totalCostUsd).toBe(0.42);
    expect(history[0].cost!.totalInputTokens).toBe(1000);
    expect(history[0].cost!.totalOutputTokens).toBe(500);
    expect(history[0].cost!.totalDurationMs).toBe(5000);
  });

  it('archives with null cost when no cost data', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-no-cost');
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history[0].cost).toBeNull();
  });

  it('does NOT archive empty sessions (no cliSessionId, no cost)', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Empty')!;
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('archives session with cost data but no cliSessionId', () => {
    mockCostData();
    const project = addProject();
    const session = appState.addSession(project.id, 'CostOnly')!;
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history).toHaveLength(1);
    expect(history[0].cliSessionId).toBeNull();
    expect(history[0].cost).not.toBeNull();
    expect(history[0].cost!.totalCostUsd).toBe(0.42);
  });

  it('does NOT archive diff-viewer sessions', () => {
    const project = addProject();
    const session = appState.addDiffViewerSession(project.id, '/f.ts', 'staged')!;
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('does NOT archive file-reader sessions', () => {
    const project = addProject();
    const session = appState.addFileReaderSession(project.id, '/f.ts')!;
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('does NOT archive mcp-inspector sessions', () => {
    const project = addProject();
    const session = appState.addMcpInspectorSession(project.id, 'Inspector')!;
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('deduplicates by cliSessionId', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-abc');
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);

    // Resume and close again
    const resumed = appState.resumeFromHistory(
      project.id,
      appState.getSessionHistory(project.id)[0].id,
    )!;
    appState.removeSession(project.id, resumed.id);
    // Should still be 1 entry, not 2
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);
  });

  it('updates cost on deduplicated re-close', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-abc');
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)[0].cost).toBeNull();

    // Resume with cost data
    const resumed = appState.resumeFromHistory(
      project.id,
      appState.getSessionHistory(project.id)[0].id,
    )!;
    mockCostData();
    appState.removeSession(project.id, resumed.id);
    expect(appState.getSessionHistory(project.id)[0].cost).not.toBeNull();
    expect(appState.getSessionHistory(project.id)[0].cost!.totalCostUsd).toBe(0.42);
  });

  it('updates name on deduplicated re-close', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Original')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-abc');
    appState.removeSession(project.id, session.id);

    const resumed = appState.resumeFromHistory(
      project.id,
      appState.getSessionHistory(project.id)[0].id,
    )!;
    appState.renameSession(project.id, resumed.id, 'Renamed');
    appState.removeSession(project.id, resumed.id);
    expect(appState.getSessionHistory(project.id)[0].name).toBe('Renamed');
  });

  it('caps history at 500 entries', () => {
    const project = addProject();
    // Manually set up 500 history entries
    const p = appState.projects.find((p) => p.id === project.id)!;
    p.sessionHistory = [];
    for (let i = 0; i < 500; i++) {
      p.sessionHistory.push({
        id: `old-${i}`,
        name: `Old ${i}`,
        providerId: 'claude',
        cliSessionId: null,
        createdAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        cost: null,
      });
    }

    const session = appState.addSession(project.id, 'New')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-new');
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history).toHaveLength(500);
    // Oldest entry should have been dropped
    expect(history[0].id).toBe('old-1');
    expect(history[history.length - 1].name).toBe('New');
  });

  it('emits history-changed on archive', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-emit');
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.removeSession(project.id, session.id);
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('bulk removeAllSessions archives each', () => {
    const { project, sessions } = addProjectWithSessions(3);
    sessions.forEach((s, i) => appState.updateSessionCliId(project.id, s.id, `cli-bulk-${i}`));
    appState.removeAllSessions(project.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(3);
  });

  it('does NOT archive when sessionHistoryEnabled is false', () => {
    appState.setPreference('sessionHistoryEnabled', false);
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.removeSession(project.id, session.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('preserves existing history when sessionHistoryEnabled is disabled', () => {
    const project = addProject();
    const session1 = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session1.id, 'cli-preserve');
    appState.removeSession(project.id, session1.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);

    appState.setPreference('sessionHistoryEnabled', false);
    const session2 = appState.addSession(project.id, 'S2')!;
    appState.removeSession(project.id, session2.id);
    // Still 1 — second session was not archived
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);
    expect(appState.getSessionHistory(project.id)[0].name).toBe('S1');
  });

  it('resumes archiving when sessionHistoryEnabled is re-enabled', () => {
    appState.setPreference('sessionHistoryEnabled', false);
    const project = addProject();
    const session1 = appState.addSession(project.id, 'S1')!;
    appState.removeSession(project.id, session1.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);

    appState.setPreference('sessionHistoryEnabled', true);
    const session2 = appState.addSession(project.id, 'S2')!;
    appState.updateSessionCliId(project.id, session2.id, 'cli-resume-pref');
    appState.removeSession(project.id, session2.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);
    expect(appState.getSessionHistory(project.id)[0].name).toBe('S2');
  });
});

describe('getSessionHistory()', () => {
  it('returns empty array for project with no history', () => {
    const project = addProject();
    expect(appState.getSessionHistory(project.id)).toEqual([]);
  });

  it('returns empty array for nonexistent project', () => {
    expect(appState.getSessionHistory('nonexistent')).toEqual([]);
  });
});

describe('removeHistoryEntry()', () => {
  it('removes a single history entry by id', () => {
    const project = addProject();
    const s1 = appState.addSession(project.id, 'S1')!;
    const s2 = appState.addSession(project.id, 'S2')!;
    appState.updateSessionCliId(project.id, s1.id, 'cli-s1');
    appState.updateSessionCliId(project.id, s2.id, 'cli-s2');
    appState.removeSession(project.id, s1.id);
    appState.removeSession(project.id, s2.id);
    const historyBefore = appState.getSessionHistory(project.id);
    expect(historyBefore).toHaveLength(2);

    const entryToRemove = historyBefore.find((h) => h.name === 'S1')!;
    appState.removeHistoryEntry(project.id, entryToRemove.id);
    const history = appState.getSessionHistory(project.id);
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe('S2');
  });

  it('no-op for nonexistent project', () => {
    // Should not throw
    appState.removeHistoryEntry('bad-project', 'bad-id');
  });

  it('no-op for nonexistent entry id', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-noop');
    appState.removeSession(project.id, session.id);
    appState.removeHistoryEntry(project.id, 'nonexistent');
    expect(appState.getSessionHistory(project.id)).toHaveLength(1);
  });

  it('emits history-changed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-emit-hist');
    appState.removeSession(project.id, session.id);
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.removeHistoryEntry(project.id, session.id);
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('persists after removal', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-persist');
    appState.removeSession(project.id, session.id);
    mockSave.mockClear();
    appState.removeHistoryEntry(project.id, session.id);
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('clearSessionHistory()', () => {
  it('clears all history for a project', () => {
    const { project, sessions } = addProjectWithSessions(3);
    sessions.forEach((s, i) => appState.updateSessionCliId(project.id, s.id, `cli-clear-${i}`));
    appState.removeAllSessions(project.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(3);
    appState.clearSessionHistory(project.id);
    expect(appState.getSessionHistory(project.id)).toEqual([]);
  });

  it('emits history-changed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-clear-emit');
    appState.removeSession(project.id, session.id);
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.clearSessionHistory(project.id);
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('persists', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-clear-persist');
    appState.removeSession(project.id, session.id);
    mockSave.mockClear();
    appState.clearSessionHistory(project.id);
    expect(mockSave).toHaveBeenCalled();
  });

  it('no-op for nonexistent project', () => {
    // Should not throw
    appState.clearSessionHistory('nonexistent');
  });

  it('clears all history including bookmarked sessions', () => {
    const { project, sessions } = addProjectWithSessions(3);
    sessions.forEach((s, i) => appState.updateSessionCliId(project.id, s.id, `cli-bm-clear-${i}`));
    appState.removeAllSessions(project.id);
    const historyBefore = appState.getSessionHistory(project.id);
    expect(historyBefore).toHaveLength(3);

    const entryToBookmark = historyBefore.find((h) => h.name === sessions[1].name)!;
    appState.toggleBookmark(project.id, entryToBookmark.id);
    appState.clearSessionHistory(project.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });

  it('does not re-archive a cli session after its history entry was removed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-tombstone-1');
    appState.removeSession(project.id, session.id);
    const entry = appState.getSessionHistory(project.id)[0];
    expect(entry).toBeTruthy();

    appState.removeHistoryEntry(project.id, entry.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);

    const revived = appState.addSession(project.id, 'S1-again')!;
    appState.updateSessionCliId(project.id, revived.id, 'cli-tombstone-1');
    appState.removeSession(project.id, revived.id);
    expect(appState.getSessionHistory(project.id)).toHaveLength(0);
  });
});
