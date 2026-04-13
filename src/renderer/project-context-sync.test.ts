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
});
