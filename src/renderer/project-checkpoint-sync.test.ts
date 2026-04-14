import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: unknown) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    checkpoint: {
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
import { _resetProjectCheckpointSyncForTesting, initProjectCheckpointSync } from './project-checkpoint-sync.js';

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

describe('project checkpoint sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectCheckpointSyncForTesting();
    onChangedHandler = null;
  });

  it('loads checkpoints for the active project and starts watching them', async () => {
    mockGetProjectState.mockResolvedValue({
      checkpoints: [
        {
          id: 'cp-1',
          path: '/proj/.calder/checkpoints/checkpoint-1.json',
          displayName: 'checkpoint-1.json',
          label: 'Checkpoint 1',
          createdAt: '2026-04-13T16:00:00.000Z',
          lastUpdated: '2026-04-13T16:00:00.000Z',
          sessionCount: 1,
          changedFileCount: 2,
        },
      ],
      lastUpdated: '2026-04-13T16:00:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectCheckpointSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectCheckpoints?.checkpoints).toHaveLength(1);
  });

  it('applies live checkpoint updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({
      checkpoints: [],
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectCheckpointSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      checkpoints: [
        {
          id: 'cp-2',
          path: '/proj/.calder/checkpoints/checkpoint-2.json',
          displayName: 'checkpoint-2.json',
          label: 'Checkpoint 2',
          createdAt: '2026-04-13T16:05:00.000Z',
          lastUpdated: '2026-04-13T16:05:00.000Z',
          sessionCount: 2,
          changedFileCount: 4,
        },
      ],
      lastUpdated: '2026-04-13T16:05:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectCheckpoints?.checkpoints[0]?.label).toBe('Checkpoint 2');
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectCheckpointSync();
    initProjectCheckpointSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ checkpoints: [] });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ checkpoints: [] });
    const project = appState.addProject('Calder', '/proj');

    initProjectCheckpointSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      checkpoints: [
        {
          id: 'cp-x',
          path: '/other/.calder/checkpoints/checkpoint-x.json',
          displayName: 'checkpoint-x.json',
          label: 'Checkpoint X',
          createdAt: '2026-04-13T16:10:00.000Z',
          lastUpdated: '2026-04-13T16:10:00.000Z',
          sessionCount: 3,
          changedFileCount: 1,
        },
      ],
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectCheckpoints?.checkpoints).toEqual([]);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ checkpoints: unknown[] }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          checkpoints: [
            {
              id: 'cp-latest',
              path: '/proj/.calder/checkpoints/checkpoint-latest.json',
              displayName: 'checkpoint-latest.json',
              label: 'Checkpoint latest',
              createdAt: '2026-04-13T16:15:00.000Z',
              lastUpdated: '2026-04-13T16:15:00.000Z',
              sessionCount: 1,
              changedFileCount: 1,
            },
          ],
        });
      }
      return Promise.resolve({ checkpoints: [] });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectCheckpointSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectCheckpoints?.checkpoints).toHaveLength(1);

    firstResponse.resolve({ checkpoints: [] });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectCheckpoints?.checkpoints).toHaveLength(1);
  });
});
