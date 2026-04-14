import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: any) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    teamContext: {
      getProjectState: mockGetProjectState,
      watchProject: mockWatchProject,
      onChanged: vi.fn((handler) => {
        onChangedHandler = handler;
        return vi.fn();
      }),
    },
  },
});

vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'uuid-1'),
});

vi.mock('./session-cost.js', () => ({
  getCost: vi.fn().mockReturnValue(null),
  restoreCost: vi.fn(),
}));

vi.mock('./session-context.js', () => ({
  restoreContext: vi.fn(),
}));

import { appState, _resetForTesting } from './state.js';
import { _resetProjectTeamContextSyncForTesting, initProjectTeamContextSync } from './project-team-context-sync.js';

async function flushTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('project team context sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectTeamContextSyncForTesting();
    onChangedHandler = null;
  });

  it('loads team context state for the active project and watches it', async () => {
    mockGetProjectState.mockResolvedValue({
      spaces: [],
      sharedRuleCount: 0,
      workflowCount: 0,
    });
    const project = appState.addProject('Calder', '/proj');

    initProjectTeamContextSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectTeamContext?.sharedRuleCount).toBe(0);
  });

  it('applies live team context updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({ spaces: [], sharedRuleCount: 0, workflowCount: 0 });
    const project = appState.addProject('Calder', '/proj');

    initProjectTeamContextSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      spaces: [
        {
          id: 'team-context:/proj/.calder/team/spaces/frontend.md',
          path: '/proj/.calder/team/spaces/frontend.md',
          displayName: 'frontend.md',
          summary: 'Frontend Agreements',
          lastUpdated: '2026-04-13T20:00:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 1,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 1,
      lastUpdated: '2026-04-13T20:00:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectTeamContext?.spaces.length).toBe(1);
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectTeamContextSync();
    initProjectTeamContextSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ spaces: [], sharedRuleCount: 0, workflowCount: 0 });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ spaces: [], sharedRuleCount: 0, workflowCount: 0 });
    const project = appState.addProject('Calder', '/proj');

    initProjectTeamContextSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      spaces: [
        {
          id: 'team-context:/other/.calder/team/spaces/backend.md',
          path: '/other/.calder/team/spaces/backend.md',
          displayName: 'backend.md',
          summary: 'Backend agreements',
          lastUpdated: '2026-04-13T20:10:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 0,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 0,
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectTeamContext?.spaces).toEqual([]);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ spaces: unknown[]; sharedRuleCount: number; workflowCount: number }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          spaces: [
            {
              id: 'team-context:/proj/.calder/team/spaces/latest.md',
              path: '/proj/.calder/team/spaces/latest.md',
              displayName: 'latest.md',
              summary: 'Latest context',
              lastUpdated: '2026-04-13T20:15:00.000Z',
              linkedRuleCount: 2,
              linkedWorkflowCount: 1,
            },
          ],
          sharedRuleCount: 2,
          workflowCount: 1,
        });
      }
      return Promise.resolve({ spaces: [], sharedRuleCount: 0, workflowCount: 0 });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectTeamContextSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectTeamContext?.sharedRuleCount).toBe(2);

    firstResponse.resolve({ spaces: [], sharedRuleCount: 0, workflowCount: 0 });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectTeamContext?.sharedRuleCount).toBe(2);
  });
});
