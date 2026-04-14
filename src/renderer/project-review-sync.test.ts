import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: unknown) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    review: {
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
import { _resetProjectReviewSyncForTesting, initProjectReviewSync } from './project-review-sync.js';

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

describe('project review sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectReviewSyncForTesting();
    onChangedHandler = null;
  });

  it('loads review findings for the active project and starts watching them', async () => {
    mockGetProjectState.mockResolvedValue({
      reviews: [
        {
          id: 'review:/proj/.calder/reviews/pr-42.md',
          path: '/proj/.calder/reviews/pr-42.md',
          displayName: 'pr-42.md',
          summary: 'PR 42 Findings',
          lastUpdated: '2026-04-13T18:00:00.000Z',
        },
      ],
      lastUpdated: '2026-04-13T18:00:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectReviewSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectReviews?.reviews).toHaveLength(1);
  });

  it('applies live review updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({
      reviews: [],
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectReviewSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      reviews: [
        {
          id: 'review:/proj/.calder/reviews/restore-pass.md',
          path: '/proj/.calder/reviews/restore-pass.md',
          displayName: 'restore-pass.md',
          summary: 'Restore flow findings',
          lastUpdated: '2026-04-13T18:05:00.000Z',
        },
      ],
      lastUpdated: '2026-04-13T18:05:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectReviews?.reviews[0]?.displayName).toBe('restore-pass.md');
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectReviewSync();
    initProjectReviewSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ reviews: [] });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ reviews: [] });
    const project = appState.addProject('Calder', '/proj');

    initProjectReviewSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      reviews: [
        {
          id: 'review:/other/.calder/reviews/other.md',
          path: '/other/.calder/reviews/other.md',
          displayName: 'other.md',
          summary: 'Other project findings',
          lastUpdated: '2026-04-13T18:10:00.000Z',
        },
      ],
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectReviews?.reviews).toEqual([]);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ reviews: unknown[] }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          reviews: [
            {
              id: 'review:/proj/.calder/reviews/latest.md',
              path: '/proj/.calder/reviews/latest.md',
              displayName: 'latest.md',
              summary: 'Latest review findings',
              lastUpdated: '2026-04-13T18:15:00.000Z',
            },
          ],
        });
      }
      return Promise.resolve({ reviews: [] });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectReviewSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectReviews?.reviews).toHaveLength(1);

    firstResponse.resolve({ reviews: [] });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectReviews?.reviews).toHaveLength(1);
  });
});
