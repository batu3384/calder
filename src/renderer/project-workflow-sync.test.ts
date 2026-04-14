import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: unknown) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    workflow: {
      getProjectState: mockGetProjectState,
      watchProject: mockWatchProject,
      onChanged: vi.fn((callback) => {
        onChangedHandler = callback as (projectPath: string, state: unknown) => void;
        return () => {
          onChangedHandler = null;
        };
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
import { _resetProjectWorkflowSyncForTesting, initProjectWorkflowSync } from './project-workflow-sync.js';

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

describe('project workflow sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectWorkflowSyncForTesting();
    onChangedHandler = null;
  });

  it('loads workflows for the active project and starts watching them', async () => {
    mockGetProjectState.mockResolvedValue({
      workflows: [
        {
          id: 'workflow:/proj/.calder/workflows/review-pr.md',
          path: '/proj/.calder/workflows/review-pr.md',
          displayName: 'review-pr.md',
          summary: 'Review PR',
          lastUpdated: '2026-04-13T15:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-13T15:00:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectWorkflowSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectWorkflows?.workflows).toHaveLength(1);
  });

  it('applies live workflow updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({
      workflows: [],
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectWorkflowSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      workflows: [
        {
          id: 'workflow:/proj/.calder/workflows/fix-tests.md',
          path: '/proj/.calder/workflows/fix-tests.md',
          displayName: 'fix-tests.md',
          summary: 'Fix failing tests',
          lastUpdated: '2026-04-13T15:05:00.000Z',
        },
      ],
      lastUpdated: '2026-04-13T15:05:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectWorkflows?.workflows[0]?.displayName).toBe('fix-tests.md');
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectWorkflowSync();
    initProjectWorkflowSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ workflows: [] });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ workflows: [] });
    const project = appState.addProject('Calder', '/proj');

    initProjectWorkflowSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      workflows: [
        {
          id: 'workflow:/other/.calder/workflows/other.md',
          path: '/other/.calder/workflows/other.md',
          displayName: 'other.md',
          summary: 'Other project workflow',
          lastUpdated: '2026-04-13T15:10:00.000Z',
        },
      ],
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectWorkflows?.workflows).toEqual([]);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ workflows: unknown[] }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          workflows: [
            {
              id: 'workflow:/proj/.calder/workflows/latest.md',
              path: '/proj/.calder/workflows/latest.md',
              displayName: 'latest.md',
              summary: 'Latest workflow',
              lastUpdated: '2026-04-13T15:15:00.000Z',
            },
          ],
        });
      }
      return Promise.resolve({ workflows: [] });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectWorkflowSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectWorkflows?.workflows).toHaveLength(1);

    firstResponse.resolve({ workflows: [] });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectWorkflows?.workflows).toHaveLength(1);
  });
});
