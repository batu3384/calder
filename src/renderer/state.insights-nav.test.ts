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

describe('toggleBookmark()', () => {
  it('toggles bookmark on a history entry', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-bm-toggle');
    appState.removeSession(project.id, session.id);

    const entry = appState.getSessionHistory(project.id)[0];
    expect(entry.bookmarked).toBeFalsy();

    appState.toggleBookmark(project.id, entry.id);
    expect(appState.getSessionHistory(project.id)[0].bookmarked).toBe(true);

    appState.toggleBookmark(project.id, entry.id);
    expect(appState.getSessionHistory(project.id)[0].bookmarked).toBe(false);
  });

  it('emits history-changed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-bm-emit');
    appState.removeSession(project.id, session.id);
    const entry = appState.getSessionHistory(project.id)[0];
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.toggleBookmark(project.id, entry.id);
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('persists after toggling', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-bm-persist');
    appState.removeSession(project.id, session.id);
    const entry = appState.getSessionHistory(project.id)[0];
    mockSave.mockClear();
    appState.toggleBookmark(project.id, entry.id);
    expect(mockSave).toHaveBeenCalled();
  });

  it('no-op for nonexistent project', () => {
    appState.toggleBookmark('bad-project', 'bad-id');
  });

  it('no-op for nonexistent entry', () => {
    const project = addProject();
    appState.toggleBookmark(project.id, 'nonexistent');
  });

  it('archived entries from same session via /clear get unique IDs', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-first');
    // Simulate /clear: session gets a new CLI session ID, old state is archived
    appState.updateSessionCliId(project.id, session.id, 'cli-second');
    // Close the session — archives again with the new CLI session ID
    appState.removeSession(project.id, session.id);
    const history = appState.getSessionHistory(project.id);
    expect(history).toHaveLength(2);
    // Both entries must have unique IDs
    expect(history[0].id).not.toBe(history[1].id);

    // Bookmarking each entry should only affect that entry
    appState.toggleBookmark(project.id, history[1].id);
    const afterToggle = appState.getSessionHistory(project.id);
    expect(afterToggle[1].bookmarked).toBe(true);
    expect(afterToggle[0].bookmarked).toBeFalsy();
  });
});

describe('resumeFromHistory()', () => {
  it('creates new session from archived entry', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-resume');
    appState.removeSession(project.id, session.id);

    const archived = appState.getSessionHistory(project.id)[0];
    const resumed = appState.resumeFromHistory(project.id, archived.id)!;
    expect(resumed).toBeDefined();
    expect(resumed.cliSessionId).toBe('cli-resume');
    expect(resumed.name).toBe('S1');
    expect(resumed.providerId).toBe('claude');
    expect(resumed.id).not.toBe(session.id); // new id
    expect(resumed.createdAt).toBeDefined(); // has its own createdAt
  });

  it('sets resumed session as active', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-123');
    appState.removeSession(project.id, session.id);

    const archived = appState.getSessionHistory(project.id)[0];
    const resumed = appState.resumeFromHistory(project.id, archived.id)!;
    expect(appState.activeProject!.activeSessionId).toBe(resumed.id);
  });

  it('emits session-added and session-changed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-123');
    appState.removeSession(project.id, session.id);

    const addedCb = vi.fn();
    const changedCb = vi.fn();
    appState.on('session-added', addedCb);
    appState.on('session-changed', changedCb);

    const archived = appState.getSessionHistory(project.id)[0];
    appState.resumeFromHistory(project.id, archived.id);
    expect(addedCb).toHaveBeenCalledTimes(1);
    expect(changedCb).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for nonexistent project', () => {
    expect(appState.resumeFromHistory('nonexistent', 'any')).toBeUndefined();
  });

  it('returns undefined for nonexistent archived id', () => {
    const project = addProject();
    expect(appState.resumeFromHistory(project.id, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined when archived session has no cliSessionId', () => {
    mockCostData(); // need cost data so session gets archived despite no cliSessionId
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    // Don't set cliSessionId
    appState.removeSession(project.id, session.id);

    const archived = appState.getSessionHistory(project.id)[0];
    expect(archived.cliSessionId).toBeNull();
    expect(appState.resumeFromHistory(project.id, archived.id)).toBeUndefined();
  });

  it('activates existing tab instead of creating duplicate when cliSessionId matches', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-dup');
    appState.removeSession(project.id, session.id);

    // Resume once — creates a new tab
    const archived = appState.getSessionHistory(project.id)[0];
    const first = appState.resumeFromHistory(project.id, archived.id)!;
    expect(appState.activeProject!.sessions).toHaveLength(1);

    // Add another session to switch away
    appState.addSession(project.id, 'S2');
    expect(appState.activeProject!.activeSessionId).not.toBe(first.id);

    // Resume same history entry again — should activate existing tab, not create a new one
    const second = appState.resumeFromHistory(project.id, archived.id)!;
    expect(second.id).toBe(first.id);
    expect(appState.activeProject!.sessions).toHaveLength(2); // S1 resumed + S2, not 3
    expect(appState.activeProject!.activeSessionId).toBe(first.id);
  });

  it('does not emit session-added when activating existing tab', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-dup');
    appState.removeSession(project.id, session.id);

    const archived = appState.getSessionHistory(project.id)[0];
    appState.resumeFromHistory(project.id, archived.id);

    const addedCb = vi.fn();
    appState.on('session-added', addedCb);
    appState.resumeFromHistory(project.id, archived.id);
    expect(addedCb).not.toHaveBeenCalled();
  });

  it('persists', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-123');
    appState.removeSession(project.id, session.id);
    mockSave.mockClear();

    const archived = appState.getSessionHistory(project.id)[0];
    appState.resumeFromHistory(project.id, archived.id);
    expect(mockSave).toHaveBeenCalled();
  });

  it('adds resumed session to splitPanes when in mosaic mode', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-swarm');
    appState.removeSession(project.id, session.id);

    // Switch to mosaic mode
    project.layout.mode = 'mosaic';
    project.layout.splitPanes = [];

    const archived = appState.getSessionHistory(project.id)[0];
    const resumed = appState.resumeFromHistory(project.id, archived.id)!;
    expect(resumed).toBeDefined();
    expect(project.layout.splitPanes).toContain(resumed.id);
  });

  it('does not add to splitPanes when in tabs mode', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-tabs');
    appState.removeSession(project.id, session.id);

    project.layout.mode = 'tabs';
    project.layout.splitPanes = [];

    const archived = appState.getSessionHistory(project.id)[0];
    const resumed = appState.resumeFromHistory(project.id, archived.id)!;
    expect(resumed).toBeDefined();
    expect(project.layout.splitPanes).toHaveLength(0);
  });
});

describe('renameSession() history sync', () => {
  it('updates matching history entry name on rename', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Original')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-sync');
    appState.removeSession(project.id, session.id);

    const resumed = appState.resumeFromHistory(
      project.id,
      appState.getSessionHistory(project.id)[0].id,
    )!;
    appState.renameSession(project.id, resumed.id, 'Updated');
    expect(appState.getSessionHistory(project.id)[0].name).toBe('Updated');
  });

  it('emits history-changed on rename', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'cli-sync');
    appState.removeSession(project.id, session.id);

    const resumed = appState.resumeFromHistory(
      project.id,
      appState.getSessionHistory(project.id)[0].id,
    )!;
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.renameSession(project.id, resumed.id, 'New Name');
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('does not affect history when session has no cliSessionId', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    const cb = vi.fn();
    appState.on('history-changed', cb);
    appState.renameSession(project.id, session.id, 'Renamed');
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('addInsightSnapshot()', () => {
  it('creates insights data if not present and stores snapshot', () => {
    const project = addProject();
    const snapshot = {
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      totalTokens: 30000,
      contextWindowSize: 200000,
      usedPercentage: 15,
    };
    appState.addInsightSnapshot(project.id, snapshot);
    expect(project.insights).toBeDefined();
    expect(project.insights!.initialContextSnapshots).toHaveLength(1);
    expect(project.insights!.initialContextSnapshots[0]).toEqual(snapshot);
  });

  it('appends to existing snapshots', () => {
    const project = addProject();
    const s1 = {
      sessionId: 's1',
      timestamp: new Date().toISOString(),
      totalTokens: 10000,
      contextWindowSize: 200000,
      usedPercentage: 5,
    };
    const s2 = {
      sessionId: 's2',
      timestamp: new Date().toISOString(),
      totalTokens: 20000,
      contextWindowSize: 200000,
      usedPercentage: 10,
    };
    appState.addInsightSnapshot(project.id, s1);
    appState.addInsightSnapshot(project.id, s2);
    expect(project.insights!.initialContextSnapshots).toHaveLength(2);
  });

  it('caps at 50 snapshots, keeping most recent', () => {
    const project = addProject();
    for (let i = 0; i < 55; i++) {
      appState.addInsightSnapshot(project.id, {
        sessionId: `s${i}`,
        timestamp: new Date().toISOString(),
        totalTokens: i * 1000,
        contextWindowSize: 200000,
        usedPercentage: i,
      });
    }
    expect(project.insights!.initialContextSnapshots).toHaveLength(50);
    // Should keep the last 50 (indices 5–54)
    expect(project.insights!.initialContextSnapshots[0].sessionId).toBe('s5');
    expect(project.insights!.initialContextSnapshots[49].sessionId).toBe('s54');
  });

  it('persists after adding snapshot', () => {
    const project = addProject();
    mockSave.mockClear();
    appState.addInsightSnapshot(project.id, {
      sessionId: 's1',
      timestamp: '',
      totalTokens: 0,
      contextWindowSize: 200000,
      usedPercentage: 0,
    });
    expect(mockSave).toHaveBeenCalled();
  });

  it('emits insights-changed event', () => {
    const project = addProject();
    const cb = vi.fn();
    appState.on('insights-changed', cb);
    appState.addInsightSnapshot(project.id, {
      sessionId: 's1',
      timestamp: '',
      totalTokens: 0,
      contextWindowSize: 200000,
      usedPercentage: 0,
    });
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('no-op for nonexistent project', () => {
    mockSave.mockClear();
    appState.addInsightSnapshot('nonexistent', {
      sessionId: 's1',
      timestamp: '',
      totalTokens: 0,
      contextWindowSize: 200000,
      usedPercentage: 0,
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('preserves dismissed list when adding snapshots', () => {
    const project = addProject();
    appState.dismissInsight(project.id, 'some-insight');
    appState.addInsightSnapshot(project.id, {
      sessionId: 's1',
      timestamp: '',
      totalTokens: 0,
      contextWindowSize: 200000,
      usedPercentage: 0,
    });
    expect(project.insights!.dismissed).toContain('some-insight');
  });
});

describe('dismissInsight()', () => {
  it('adds insightId to dismissed list', () => {
    const project = addProject();
    appState.dismissInsight(project.id, 'big-initial-context');
    expect(project.insights!.dismissed).toContain('big-initial-context');
  });

  it('creates insights data if not present', () => {
    const project = addProject();
    expect(project.insights).toBeUndefined();
    appState.dismissInsight(project.id, 'test-insight');
    expect(project.insights).toBeDefined();
    expect(project.insights!.initialContextSnapshots).toEqual([]);
  });

  it('does not add duplicate dismissals', () => {
    const project = addProject();
    appState.dismissInsight(project.id, 'big-initial-context');
    appState.dismissInsight(project.id, 'big-initial-context');
    expect(project.insights!.dismissed.filter((d) => d === 'big-initial-context')).toHaveLength(1);
  });

  it('persists after dismissal', () => {
    const project = addProject();
    mockSave.mockClear();
    appState.dismissInsight(project.id, 'test');
    expect(mockSave).toHaveBeenCalled();
  });

  it('emits insights-changed event', () => {
    const project = addProject();
    const cb = vi.fn();
    appState.on('insights-changed', cb);
    appState.dismissInsight(project.id, 'test');
    expect(cb).toHaveBeenCalledWith(project.id);
  });

  it('no-op for nonexistent project', () => {
    mockSave.mockClear();
    appState.dismissInsight('nonexistent', 'test');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('can dismiss multiple different insights', () => {
    const project = addProject();
    appState.dismissInsight(project.id, 'insight-a');
    appState.dismissInsight(project.id, 'insight-b');
    expect(project.insights!.dismissed).toEqual(['insight-a', 'insight-b']);
  });
});

describe('isInsightDismissed()', () => {
  it('returns true for dismissed insight', () => {
    const project = addProject();
    appState.dismissInsight(project.id, 'big-initial-context');
    expect(appState.isInsightDismissed(project.id, 'big-initial-context')).toBe(true);
  });

  it('returns false for non-dismissed insight', () => {
    const project = addProject();
    expect(appState.isInsightDismissed(project.id, 'big-initial-context')).toBe(false);
  });

  it('returns false for nonexistent project', () => {
    expect(appState.isInsightDismissed('nonexistent', 'big-initial-context')).toBe(false);
  });

  it('returns false for project with no insights data', () => {
    const project = addProject();
    expect(project.insights).toBeUndefined();
    expect(appState.isInsightDismissed(project.id, 'anything')).toBe(false);
  });
});

describe('navigateBack()/navigateForward()', () => {
  it('walks backward and forward through visited sessions', () => {
    const { project, sessions } = addProjectWithSessions(3);
    // addSession already pushes each into nav history (S1, S2, S3), active=S3
    expect(project.activeSessionId).toBe(sessions[2].id);

    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[1].id);
    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[0].id);
    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[0].id); // clamped

    appState.navigateForward();
    expect(project.activeSessionId).toBe(sessions[1].id);
    appState.navigateForward();
    expect(project.activeSessionId).toBe(sessions[2].id);
    appState.navigateForward();
    expect(project.activeSessionId).toBe(sessions[2].id); // clamped
  });

  it('truncates the forward stack on a new visit', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.navigateBack();
    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[0].id);

    appState.setActiveSession(project.id, sessions[2].id);
    // Forward stack should be cleared; navigateForward is now a no-op
    appState.navigateForward();
    expect(project.activeSessionId).toBe(sessions[2].id);

    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[0].id);
  });

  it('skips sessions removed from history', () => {
    const { project, sessions } = addProjectWithSessions(3);
    // active=S3, history=[S1,S2,S3]
    appState.removeSession(project.id, sessions[1].id);
    // S2 pruned. History=[S1,S3], active=S3.
    appState.navigateBack();
    expect(project.activeSessionId).toBe(sessions[0].id);
  });

  it('navigates across projects', () => {
    const projectA = addProject('A', '/a');
    const sA = appState.addSession(projectA.id, 'A1')!;
    const projectB = addProject('B', '/b');
    const sB = appState.addSession(projectB.id, 'B1')!;

    expect(appState.activeProjectId).toBe(projectB.id);
    appState.navigateBack();
    expect(appState.activeProjectId).toBe(projectA.id);
    expect(projectA.activeSessionId).toBe(sA.id);

    appState.navigateForward();
    expect(appState.activeProjectId).toBe(projectB.id);
    expect(projectB.activeSessionId).toBe(sB.id);
  });

  it('does not re-push during back/forward navigation', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.navigateBack();
    appState.navigateBack();
    // Should still be able to walk all the way forward to the original tail
    appState.navigateForward();
    appState.navigateForward();
    expect(project.activeSessionId).toBe(sessions[2].id);
  });
});
