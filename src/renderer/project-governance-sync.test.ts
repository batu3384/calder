import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();
const mockGetProjectState = vi.fn();
const mockWatchProject = vi.fn();
let onChangedHandler: ((projectPath: string, state: unknown) => void) | null = null;

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    governance: {
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
import { _resetProjectGovernanceSyncForTesting, initProjectGovernanceSync } from './project-governance-sync.js';

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

describe('project governance sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    _resetProjectGovernanceSyncForTesting();
    onChangedHandler = null;
  });

  it('loads governance policy for the active project and starts watching it', async () => {
    mockGetProjectState.mockResolvedValue({
      policy: {
        id: 'governance:/proj/.calder/governance/policy.json',
        path: '/proj/.calder/governance/policy.json',
        displayName: 'Project guardrails',
        summary: 'advisory · tools ask · writes ask · network ask',
        lastUpdated: '2026-04-13T20:00:00.000Z',
        mode: 'advisory',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'ask',
        mcpAllowlistCount: 0,
        providerProfileCount: 0,
      },
      lastUpdated: '2026-04-13T20:00:00.000Z',
    });

    const project = appState.addProject('Calder', '/proj');

    initProjectGovernanceSync();
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledWith('/proj');
    expect(mockGetProjectState).toHaveBeenCalledWith('/proj', undefined);
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.policy?.displayName).toBe('Project guardrails');
  });

  it('applies live governance updates to the matching project', async () => {
    mockGetProjectState.mockResolvedValue({});
    const project = appState.addProject('Calder', '/proj');

    initProjectGovernanceSync();
    await flushTasks();

    onChangedHandler?.('/proj', {
      policy: {
        id: 'governance:/proj/.calder/governance/policy.json',
        path: '/proj/.calder/governance/policy.json',
        displayName: 'Strict mode',
        summary: 'enforced · tools ask · writes ask · network block',
        lastUpdated: '2026-04-13T20:05:00.000Z',
        mode: 'enforced',
        toolPolicy: 'ask',
        writePolicy: 'ask',
        networkPolicy: 'block',
        mcpAllowlistCount: 2,
        providerProfileCount: 1,
      },
      lastUpdated: '2026-04-13T20:05:00.000Z',
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.policy?.networkPolicy).toBe('block');
  });

  it('re-resolves governance for the active CLI session when live updates arrive', async () => {
    let includeSessionOverride = false;
    mockGetProjectState.mockImplementation(async () => (
      includeSessionOverride
        ? {
            autoApproval: {
              globalMode: 'off',
              projectMode: 'edit_only',
              sessionMode: 'full_auto',
              effectiveMode: 'full_auto',
              policySource: 'session',
              safeToolProfile: 'default-read-only',
              recentDecisions: [],
            },
          }
        : {
            autoApproval: {
              globalMode: 'off',
              effectiveMode: 'off',
              policySource: 'fallback',
              safeToolProfile: 'default-read-only',
              recentDecisions: [],
            },
          }
    ));

    const project = appState.addProject('Calder', '/proj');
    const session = appState.addSession(project.id, 'Codex Main', undefined, 'codex');

    initProjectGovernanceSync();
    await flushTasks();

    includeSessionOverride = true;
    onChangedHandler?.('/proj', {
      autoApproval: {
        globalMode: 'off',
        projectMode: 'edit_only',
        effectiveMode: 'edit_only',
        policySource: 'project',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    });
    await flushTasks();

    expect(mockGetProjectState).toHaveBeenLastCalledWith('/proj', session?.id);
    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.autoApproval).toMatchObject({
      sessionMode: 'full_auto',
      effectiveMode: 'full_auto',
      policySource: 'session',
    });
  });

  it('handles initialization without an active project and ignores duplicate init calls', async () => {
    initProjectGovernanceSync();
    initProjectGovernanceSync();
    await flushTasks();

    expect(mockWatchProject).not.toHaveBeenCalled();
    expect(mockGetProjectState).not.toHaveBeenCalled();

    mockGetProjectState.mockResolvedValue({});
    appState.addProject('Calder', '/proj');
    await flushTasks();

    expect(mockWatchProject).toHaveBeenCalledTimes(1);
    expect(mockGetProjectState).toHaveBeenCalled();
    expect(mockGetProjectState.mock.calls.every(([projectPath]) => projectPath === '/proj')).toBe(true);
  });

  it('ignores live updates for unknown project paths', async () => {
    mockGetProjectState.mockResolvedValue({});
    const project = appState.addProject('Calder', '/proj');

    initProjectGovernanceSync();
    await flushTasks();

    onChangedHandler?.('/other', {
      policy: {
        id: 'governance:/other/.calder/governance/policy.json',
        path: '/other/.calder/governance/policy.json',
        displayName: 'Other policy',
        summary: 'advisory',
        lastUpdated: '2026-04-13T20:10:00.000Z',
        mode: 'advisory',
        toolPolicy: 'allow',
        writePolicy: 'allow',
        networkPolicy: 'allow',
        mcpAllowlistCount: 0,
        providerProfileCount: 0,
      },
    });

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.policy).toBeUndefined();
  });

  it('keeps only the latest async response when active project changes rapidly', async () => {
    const firstResponse = createDeferred<{ policy?: unknown }>();
    let pendingFirstRequest = true;

    mockGetProjectState.mockImplementation((projectPath: string) => {
      if (projectPath === '/proj' && pendingFirstRequest) {
        pendingFirstRequest = false;
        return firstResponse.promise;
      }
      if (projectPath === '/proj') {
        return Promise.resolve({
          policy: {
            id: 'governance:/proj/.calder/governance/policy.json',
            path: '/proj/.calder/governance/policy.json',
            displayName: 'Latest policy',
            summary: 'enforced',
            lastUpdated: '2026-04-13T20:15:00.000Z',
            mode: 'enforced',
            toolPolicy: 'ask',
            writePolicy: 'ask',
            networkPolicy: 'block',
            mcpAllowlistCount: 2,
            providerProfileCount: 1,
          },
        });
      }
      return Promise.resolve({});
    });

    const project = appState.addProject('Calder', '/proj');
    initProjectGovernanceSync();

    appState.setActiveProject(project.id);
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.policy?.displayName).toBe('Latest policy');

    firstResponse.resolve({});
    await flushTasks();

    expect(appState.projects.find((entry) => entry.id === project.id)?.projectGovernance?.policy?.displayName).toBe('Latest policy');
  });
});
