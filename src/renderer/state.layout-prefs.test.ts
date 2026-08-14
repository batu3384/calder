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
import { _resetForTesting, appState, MAX_SESSION_NAME_LENGTH } from './state';
import { addProject, addProjectWithSessions } from './state/appstate-test-support';

const mockGetCost = vi.mocked(getCost);

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

describe('updateSessionCost()', () => {
  const sampleCost = {
    totalCostUsd: 2.5,
    totalInputTokens: 1000,
    totalOutputTokens: 400,
    cacheReadTokens: 50,
    cacheCreationTokens: 25,
    totalDurationMs: 3000,
    totalApiDurationMs: 2000,
  };

  it('persists cost data on the session record', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    mockSave.mockClear();
    appState.updateSessionCost(session.id, sampleCost);
    const updated = appState.activeProject!.sessions.find((s) => s.id === session.id)!;
    expect(updated.cost).toEqual(sampleCost);
    expect(mockSave).toHaveBeenCalled();
  });

  it('no-op for nonexistent session', () => {
    addProject();
    mockSave.mockClear();
    appState.updateSessionCost('nonexistent', sampleCost);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('updates cost across projects', () => {
    const p1 = addProject('P1', '/p1');
    const p2 = addProject('P2', '/p2');
    const s1 = appState.addSession(p1.id, 'S1')!;
    appState.addSession(p2.id, 'S2');
    appState.updateSessionCost(s1.id, sampleCost);
    const found = appState.projects
      .find((p) => p.id === p1.id)!
      .sessions.find((s) => s.id === s1.id)!;
    expect(found.cost).toEqual(sampleCost);
  });
});

describe('updateSessionContext()', () => {
  const sampleContext = { totalTokens: 5000, contextWindowSize: 200000, usedPercentage: 2.5 };

  it('persists context data on the session record', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    mockSave.mockClear();
    appState.updateSessionContext(session.id, sampleContext);
    const updated = appState.activeProject!.sessions.find((s) => s.id === session.id)!;
    expect(updated.contextWindow).toEqual(sampleContext);
    expect(mockSave).toHaveBeenCalled();
  });

  it('no-op for nonexistent session', () => {
    addProject();
    mockSave.mockClear();
    appState.updateSessionContext('nonexistent', sampleContext);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('renameSession()', () => {
  it('updates session name and persists', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Old')!;
    mockSave.mockClear();
    appState.renameSession(project.id, session.id, 'New');
    expect(appState.activeSession!.name).toBe('New');
    expect(mockSave).toHaveBeenCalled();
  });

  it('sets userRenamed when passed true', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Old')!;
    appState.renameSession(project.id, session.id, 'Manual', true);
    expect(appState.activeSession!.userRenamed).toBe(true);
  });

  it('does not set userRenamed when param omitted', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Old')!;
    appState.renameSession(project.id, session.id, 'Auto');
    expect(appState.activeSession!.userRenamed).toBeUndefined();
  });

  it('truncates name exceeding MAX_SESSION_NAME_LENGTH', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'Old')!;
    const longName = 'A'.repeat(MAX_SESSION_NAME_LENGTH + 40);
    appState.renameSession(project.id, session.id, longName);
    expect(appState.activeSession!.name).toBe('A'.repeat(MAX_SESSION_NAME_LENGTH));
  });
});

describe('mosaic layout defaults', () => {
  it('includes all CLI sessions in splitPanes by default', () => {
    addProjectWithSessions(8);
    const layout = appState.activeProject!.layout;
    expect(layout.mode).toBe('mosaic');
    expect(layout.splitPanes.length).toBe(8);
  });

  it('starts in mosaic with a single CLI session', () => {
    addProjectWithSessions(1);
    const layout = appState.activeProject!.layout;
    expect(layout.mode).toBe('mosaic');
    expect(layout.splitPanes.length).toBe(1);
  });

  it('stays in mosaic when removing sessions down to 1 pane', () => {
    const { project, sessions } = addProjectWithSessions(2);
    // already in mosaic mode by default
    appState.removeSession(project.id, sessions[0].id);
    const layout = appState.activeProject!.layout;
    expect(layout.mode).toBe('mosaic');
    expect(layout.splitPanes.length).toBe(1);
  });
});

describe('cycleSession()', () => {
  it('cycles forward', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.setActiveSession(project.id, sessions[0].id);
    appState.cycleSession(1);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[1].id);
  });

  it('cycles backward', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.setActiveSession(project.id, sessions[0].id);
    appState.cycleSession(-1);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[2].id);
  });

  it('wraps around forward', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.setActiveSession(project.id, sessions[2].id);
    appState.cycleSession(1);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[0].id);
  });
});

describe('gotoSession()', () => {
  it('goes to session by index', () => {
    const { sessions } = addProjectWithSessions(3);
    appState.gotoSession(1);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[1].id);
  });

  it('no-op for out-of-bounds index', () => {
    addProjectWithSessions(2);
    const before = appState.activeProject!.activeSessionId;
    appState.gotoSession(5);
    expect(appState.activeProject!.activeSessionId).toBe(before);
  });
});

describe('batch removals', () => {
  it('removeAllSessions removes all sessions', () => {
    const { project } = addProjectWithSessions(3);
    appState.removeAllSessions(project.id);
    expect(appState.activeProject!.sessions).toHaveLength(0);
  });

  it('removeSessionsFromRight removes sessions after given', () => {
    const { project, sessions } = addProjectWithSessions(4);
    appState.removeSessionsFromRight(project.id, sessions[1].id);
    expect(appState.activeProject!.sessions).toHaveLength(2);
    expect(appState.activeProject!.sessions.map((s) => s.id)).toEqual([
      sessions[0].id,
      sessions[1].id,
    ]);
  });

  it('removeSessionsFromLeft removes sessions before given', () => {
    const { project, sessions } = addProjectWithSessions(4);
    appState.removeSessionsFromLeft(project.id, sessions[2].id);
    expect(appState.activeProject!.sessions).toHaveLength(2);
    expect(appState.activeProject!.sessions.map((s) => s.id)).toEqual([
      sessions[2].id,
      sessions[3].id,
    ]);
  });

  it('removeOtherSessions removes all except given', () => {
    const { project, sessions } = addProjectWithSessions(4);
    appState.removeOtherSessions(project.id, sessions[1].id);
    expect(appState.activeProject!.sessions).toHaveLength(1);
    expect(appState.activeProject!.sessions[0].id).toBe(sessions[1].id);
  });
});

describe('reorderSession()', () => {
  it('moves session to a different index', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.reorderSession(project.id, sessions[0].id, 2);
    const ids = appState.activeProject!.sessions.map((s) => s.id);
    expect(ids).toEqual([sessions[1].id, sessions[2].id, sessions[0].id]);
  });

  it('no-op when fromIndex === toIndex', () => {
    const { project, sessions } = addProjectWithSessions(3);
    mockSave.mockClear();
    appState.reorderSession(project.id, sessions[1].id, 1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('syncs splitPanes order when reordering sessions', () => {
    const { project, sessions } = addProjectWithSessions(3);
    // already in mosaic mode by default
    const panesBefore = [...appState.activeProject!.layout.splitPanes];
    expect(panesBefore).toContain(sessions[0].id);
    expect(panesBefore).toContain(sessions[1].id);
    expect(panesBefore).toContain(sessions[2].id);

    // Move first session to last position
    appState.reorderSession(project.id, sessions[0].id, 2);
    const panesAfter = appState.activeProject!.layout.splitPanes;
    const sessionIds = appState.activeProject!.sessions.map((s) => s.id);
    // splitPanes should follow sessions order
    expect(panesAfter).toEqual(sessionIds);
  });
});

describe('preferences', () => {
  it('setPreference updates and persists', () => {
    appState.setPreference('debugMode', true);
    expect(appState.preferences.debugMode).toBe(true);
    expect(mockSave).toHaveBeenCalled();
  });

  it('setPreference emits preferences-changed', () => {
    const cb = vi.fn();
    appState.on('preferences-changed', cb);
    appState.setPreference('soundOnSessionWaiting', true);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('mosaic layout ratios', () => {
  it('persists a clamped browser width ratio and emits layout-changed', () => {
    const project = addProject();
    const cb = vi.fn();
    appState.on('layout-changed', cb);
    mockSave.mockClear();

    (appState as any).setBrowserWidthRatio(project.id, 0.9);

    expect(appState.activeProject!.layout.browserWidthRatio).toBe(0.7);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalled();
  });

  it('persists a clamped named mosaic ratio and emits layout-changed', () => {
    const project = addProject();
    const cb = vi.fn();
    appState.on('layout-changed', cb);
    mockSave.mockClear();

    (appState as any).setMosaicRatio(project.id, 'focus-left-main', 0.1);

    expect(appState.activeProject!.layout.mosaicRatios).toEqual({ 'focus-left-main': 0.2 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('setSidebarWidth()', () => {
  it('sets sidebarWidth and persists', () => {
    appState.setSidebarWidth(300);
    expect(appState.sidebarWidth).toBe(300);
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('toggleSidebar()', () => {
  it('toggles sidebarCollapsed, persists, and emits', () => {
    expect(appState.sidebarCollapsed).toBe(false);
    const cb = vi.fn();
    appState.on('sidebar-toggled', cb);
    appState.toggleSidebar();
    expect(appState.sidebarCollapsed).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalled();
  });

  it('toggles back to false', () => {
    appState.toggleSidebar(); // true
    appState.toggleSidebar(); // false
    expect(appState.sidebarCollapsed).toBe(false);
  });
});

describe('setTerminalPanelOpen()', () => {
  it('sets terminalPanelOpen on active project and emits', () => {
    addProject();
    const cb = vi.fn();
    appState.on('terminal-panel-changed', cb);
    appState.setTerminalPanelOpen(true);
    expect(appState.activeProject!.terminalPanelOpen).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalled();
  });

  it('no-op when no active project', () => {
    mockSave.mockClear();
    appState.setTerminalPanelOpen(true);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('setTerminalPanelHeight()', () => {
  it('sets terminalPanelHeight on active project', () => {
    addProject();
    appState.setTerminalPanelHeight(250);
    expect(appState.activeProject!.terminalPanelHeight).toBe(250);
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('on() / event system', () => {
  it('returns an unsubscribe function that works', () => {
    const cb = vi.fn();
    const unsub = appState.on('project-changed', cb);
    addProject();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    addProject();
    expect(cb).toHaveBeenCalledTimes(1); // not called again
  });
});

describe('setActiveProject()', () => {
  it('sets activeProjectId and emits project-changed', () => {
    const p1 = addProject('P1', '/p1');
    addProject('P2', '/p2');
    const cb = vi.fn();
    appState.on('project-changed', cb);
    appState.setActiveProject(p1.id);
    expect(appState.activeProjectId).toBe(p1.id);
    expect(cb).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('project domain setters', () => {
  it('updates each project domain and emits project-changed for active project', () => {
    const project = addProject('Domains', '/domains');
    appState.setActiveProject(project.id);
    const changed = vi.fn();
    appState.on('project-changed', changed);

    appState.setProjectContext(project.id, {
      sources: [
        {
          id: 'shared-rules',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '.agents/rules.md',
          displayName: 'Rules',
          summary: 'Shared rules',
          lastUpdated: '2026-04-22T00:00:00.000Z',
        },
      ],
      sharedRuleCount: 0,
      providerSourceCount: 999,
    });
    appState.setProjectWorkflows(project.id, {
      workflows: [
        {
          id: 'workflow-1',
          path: '.agents/workflows/release.md',
          displayName: 'Release',
          summary: 'Release checklist',
          lastUpdated: '2026-04-22T00:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-22T00:00:00.000Z',
    });
    appState.setProjectTeamContext(project.id, {
      spaces: [
        {
          id: 'space-1',
          path: '.agents/team/backend.md',
          displayName: 'Backend',
          summary: 'Backend ownership',
          lastUpdated: '2026-04-22T00:00:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 1,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 1,
    });
    appState.setProjectReviews(project.id, {
      reviews: [
        {
          id: 'review-1',
          path: '.agents/reviews/security.md',
          displayName: 'Security review',
          summary: 'Security rubric',
          lastUpdated: '2026-04-22T00:00:00.000Z',
        },
      ],
    });
    appState.setProjectGovernance(project.id, {
      policy: {
        id: 'governance:/domains/.calder/governance/policy.json',
        path: '/domains/.calder/governance/policy.json',
        displayName: 'Project policy',
        summary: 'advisory · tools ask · writes ask · network ask',
        lastUpdated: '2026-04-22T00:00:00.000Z',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
        mcpAllowlistCount: 0,
        providerProfileCount: 0,
      },
    });
    appState.setProjectBackgroundTasks(project.id, {
      tasks: [
        {
          id: 'task-1',
          path: '.agents/tasks/follow-up.md',
          title: 'Follow-up',
          status: 'queued',
          summary: 'Ship remaining cleanup',
          createdAt: '2026-04-22T00:00:00.000Z',
          lastUpdated: '2026-04-22T00:00:00.000Z',
          artifactCount: 0,
          handoffSummary: 'Pending',
        },
      ],
      queuedCount: 1,
      runningCount: 0,
      completedCount: 0,
    });
    appState.setProjectCheckpoints(project.id, {
      checkpoints: [
        {
          id: 'checkpoint-1',
          path: '.calder/checkpoints/checkpoint-1.json',
          displayName: 'Checkpoint 1',
          label: 'Before cleanup',
          createdAt: '2026-04-22T00:00:00.000Z',
          lastUpdated: '2026-04-22T00:00:00.000Z',
          sessionCount: 3,
          changedFileCount: 2,
          restoreSummary: '3 sessions, 2 changed files',
        },
      ],
    });

    expect(appState.activeProject?.projectContext?.sharedRuleCount).toBe(1);
    expect(appState.activeProject?.projectContext?.providerSourceCount).toBe(0);
    expect(appState.activeProject?.projectWorkflows?.workflows).toHaveLength(1);
    expect(appState.activeProject?.projectTeamContext?.spaces).toHaveLength(1);
    expect(appState.activeProject?.projectReviews?.reviews).toHaveLength(1);
    expect(appState.activeProject?.projectGovernance?.policy?.displayName).toBe('Project policy');
    expect(appState.activeProject?.projectBackgroundTasks?.tasks).toHaveLength(1);
    expect(appState.activeProject?.projectCheckpoints?.checkpoints).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(7);
  });

  it('does not emit when normalized project domain state is unchanged', () => {
    const project = addProject('Domains', '/domains');
    appState.setActiveProject(project.id);
    const changed = vi.fn();
    appState.on('project-changed', changed);

    const workflows = {
      workflows: [
        {
          id: 'workflow-1',
          path: '.agents/workflows/release.md',
          displayName: 'Release',
          summary: 'Release checklist',
          lastUpdated: '2026-04-22T00:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-22T00:00:00.000Z',
    };

    appState.setProjectWorkflows(project.id, workflows);
    appState.setProjectWorkflows(project.id, {
      ...workflows,
      workflows: [...workflows.workflows],
    });

    expect(changed).toHaveBeenCalledTimes(1);
  });
});
