import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: any) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    task: {
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
import { _resetProjectBackgroundTaskSyncForTesting, initProjectBackgroundTaskSync } from './project-background-task-sync.js';

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

describe('project background task sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectBackgroundTaskSyncForTesting();
    onChangedHandler = null;
  });

  it('loads task queue state for the active project and watches it', async () => {
    mockGetProjectState.mockResolvedValue({
      tasks: [],
      queuedCount: 0,
      runningCount: 0,
      completedCount: 0,
    });
    const project = appState.addProject('Calder', '/proj');

    initProjectBackgroundTaskSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectBackgroundTasks?.queuedCount).toBe(0);
  });

  it('applies live task queue updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({ tasks: [], queuedCount: 0, runningCount: 0, completedCount: 0 });
    const project = appState.addProject('Calder', '/proj');

    initProjectBackgroundTaskSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      tasks: [
        {
          id: 'task:/proj/.calder/tasks/review-ui.json',
          path: '/proj/.calder/tasks/review-ui.json',
          title: 'Review UI',
          status: 'queued',
          summary: 'Check the modal.',
          createdAt: '2026-04-13T20:00:00.000Z',
          lastUpdated: '2026-04-13T20:00:00.000Z',
          artifactCount: 0,
          handoffSummary: '',
        },
      ],
      queuedCount: 1,
      runningCount: 0,
      completedCount: 0,
      lastUpdated: '2026-04-13T20:00:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectBackgroundTasks?.queuedCount).toBe(1);
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectBackgroundTaskSync();
    initProjectBackgroundTaskSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ tasks: [], queuedCount: 0, runningCount: 0, completedCount: 0 });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ tasks: [], queuedCount: 0, runningCount: 0, completedCount: 0 });
    const project = appState.addProject('Calder', '/proj');

    initProjectBackgroundTaskSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      tasks: [],
      queuedCount: 9,
      runningCount: 0,
      completedCount: 0,
      lastUpdated: '2026-04-13T20:10:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectBackgroundTasks?.queuedCount).toBe(0);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{
      tasks: unknown[];
      queuedCount: number;
      runningCount: number;
      completedCount: number;
    }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({ tasks: [], queuedCount: 7, runningCount: 0, completedCount: 0 });
      }
      return Promise.resolve({ tasks: [], queuedCount: 0, runningCount: 0, completedCount: 0 });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectBackgroundTaskSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectBackgroundTasks?.queuedCount).toBe(7);

    firstResponse.resolve({ tasks: [], queuedCount: 1, runningCount: 0, completedCount: 0 });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectBackgroundTasks?.queuedCount).toBe(7);
  });
});
