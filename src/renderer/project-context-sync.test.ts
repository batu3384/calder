import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: unknown) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    context: {
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
import { initProjectContextSync, _resetProjectContextSyncForTesting } from './project-context-sync.js';

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

describe('project context sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectContextSyncForTesting();
    onChangedHandler = null;
  });

  it('loads discovered context for the active project and starts watching it', async () => {
    mockGetProjectState.mockResolvedValue({
      sources: [
        {
          id: 'claude:memory:/proj/CLAUDE.md',
          provider: 'claude',
          scope: 'project',
          kind: 'memory',
          path: '/proj/CLAUDE.md',
          displayName: 'CLAUDE.md',
          summary: 'Claude project instructions',
          lastUpdated: '2026-04-13T12:00:00.000Z',
        },
      ],
      sharedRuleCount: 0,
      providerSourceCount: 1,
      lastUpdated: '2026-04-13T12:00:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectContextSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj');
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectContext?.providerSourceCount).toBe(1);
  });

  it('applies live context updates to the matching project path', async () => {
    mockGetProjectState.mockResolvedValue({
      sources: [],
      sharedRuleCount: 0,
      providerSourceCount: 0,
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectContextSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      sources: [
        {
          id: 'shared:rules:/proj/.calder/rules/testing.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/proj/.calder/rules/testing.md',
          displayName: 'testing.md',
          summary: 'Tests are required',
          lastUpdated: '2026-04-13T12:10:00.000Z',
          priority: 'hard',
        },
      ],
      sharedRuleCount: 1,
      providerSourceCount: 0,
      lastUpdated: '2026-04-13T12:10:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectContext?.sharedRuleCount).toBe(1);
    expect(appState.activeProject?.projectContext?.sources[0]?.displayName).toBe('testing.md');
  });

  it('preserves shared rule toggle state across live discovery refreshes', async () => {
    mockGetProjectState.mockResolvedValue({
      sources: [
        {
          id: 'shared:rules:/proj/.calder/rules/testing.hard.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/proj/.calder/rules/testing.hard.md',
          displayName: 'testing.hard.md',
          summary: 'Tests are required',
          lastUpdated: '2026-04-13T12:10:00.000Z',
          priority: 'hard',
        },
      ],
      sharedRuleCount: 1,
      providerSourceCount: 0,
      lastUpdated: '2026-04-13T12:10:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');
    appState.setProjectContext(project.id, {
      sources: [
        {
          id: 'shared:rules:/proj/.calder/rules/testing.hard.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/proj/.calder/rules/testing.hard.md',
          displayName: 'testing.hard.md',
          summary: 'Tests are required',
          lastUpdated: '2026-04-13T12:10:00.000Z',
          priority: 'hard',
          enabled: false,
        },
      ],
      sharedRuleCount: 0,
      providerSourceCount: 0,
      lastUpdated: '2026-04-13T12:10:00.000Z',
    });

    initProjectContextSync();
    await flushTasks();

    expect(appState.activeProject?.projectContext?.sources[0]?.enabled).toBe(false);
    expect(appState.activeProject?.projectContext?.sharedRuleCount).toBe(0);
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectContextSync();
    initProjectContextSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({ sources: [], sharedRuleCount: 0, providerSourceCount: 0 });
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({ sources: [], sharedRuleCount: 0, providerSourceCount: 0 });
    const project = appState.addProject('Calder', '/proj');

    initProjectContextSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      sources: [
        {
          id: 'shared:rules:/other/.calder/rules/security.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/other/.calder/rules/security.md',
          displayName: 'security.md',
          summary: 'Security checklist',
          lastUpdated: '2026-04-13T12:20:00.000Z',
          priority: 'soft',
        },
      ],
      sharedRuleCount: 1,
      providerSourceCount: 0,
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectContext?.sharedRuleCount).toBe(0);
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ sources: unknown[]; sharedRuleCount: number; providerSourceCount: number }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          sources: [
            {
              id: 'shared:rules:/proj/.calder/rules/latest.md',
              provider: 'shared',
              scope: 'project',
              kind: 'rules',
              path: '/proj/.calder/rules/latest.md',
              displayName: 'latest.md',
              summary: 'Latest rule',
              lastUpdated: '2026-04-13T12:25:00.000Z',
              priority: 'hard',
            },
          ],
          sharedRuleCount: 1,
          providerSourceCount: 0,
        });
      }
      return Promise.resolve({ sources: [], sharedRuleCount: 0, providerSourceCount: 0 });
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectContextSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectContext?.sharedRuleCount).toBe(1);

    firstResponse.resolve({ sources: [], sharedRuleCount: 0, providerSourceCount: 0 });
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectContext?.sharedRuleCount).toBe(1);
  });
});
