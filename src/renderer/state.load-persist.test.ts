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

import { restoreContext } from './session-context.js';
import { getCost, restoreCost } from './session-cost.js';
import { _resetForTesting, appState } from './state';
import { addProject } from './state/appstate-test-support';

const mockGetCost = vi.mocked(getCost);
const mockRestoreCost = vi.mocked(restoreCost);
const mockRestoreContext = vi.mocked(restoreContext);

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

describe('_resetForTesting()', () => {
  it('restores default state and drops prior listeners', () => {
    const project = addProject('Dirty', '/dirty');
    appState.addSession(project.id, 'S1');
    appState.setPreference('debugMode', true);

    const prefsListener = vi.fn();
    appState.on('preferences-changed', prefsListener);
    appState.setPreference('notificationsDesktop', false);
    expect(prefsListener).toHaveBeenCalledTimes(1);

    _resetForTesting();

    expect(appState.projects).toEqual([]);
    expect(appState.activeProjectId).toBeNull();
    expect(appState.preferences).toMatchObject({
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      debugMode: false,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
    });

    appState.setPreference('debugMode', true);
    expect(prefsListener).toHaveBeenCalledTimes(1);
  });
});

describe('load()', () => {
  it('loads persisted state from store', async () => {
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [],
          activeSessionId: null,
          layout: { mode: 'tabs' as const, splitPanes: [], splitDirection: 'horizontal' as const },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: true, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    expect(appState.projects).toHaveLength(1);
    expect(appState.activeProjectId).toBe('p1');
    expect(appState.preferences.soundOnSessionWaiting).toBe(true);
  });

  it('normalizes legacy swarm layouts into mosaic layouts on load', async () => {
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [
            {
              id: 's1',
              name: 'One',
              cliSessionId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 's2',
              name: 'Two',
              cliSessionId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          activeSessionId: 's1',
          layout: {
            mode: 'swarm' as const,
            splitPanes: ['s1', 's2'],
            splitDirection: 'horizontal' as const,
          },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: true, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);

    await appState.load();

    expect(appState.activeProject!.layout).toMatchObject({
      mode: 'mosaic',
      splitPanes: ['s1', 's2'],
      splitDirection: 'horizontal',
      browserWidthRatio: 0.38,
      mosaicRatios: {},
    });
  });

  it('normalizes legacy split layouts into mosaic layouts on load', async () => {
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [
            {
              id: 's1',
              name: 'One',
              cliSessionId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 's2',
              name: 'Two',
              cliSessionId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          activeSessionId: 's1',
          layout: {
            mode: 'split' as const,
            splitPanes: ['s1', 's2'],
            splitDirection: 'vertical' as const,
          },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: true, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);

    await appState.load();

    expect(appState.activeProject!.layout).toMatchObject({
      mode: 'mosaic',
      splitPanes: ['s1', 's2'],
      splitDirection: 'vertical',
      browserWidthRatio: 0.38,
      mosaicRatios: {},
    });
  });

  it('handles null return from store (keeps defaults)', async () => {
    mockLoad.mockResolvedValue(null);
    await appState.load();
    expect(appState.projects).toEqual([]);
    expect(appState.activeProjectId).toBeNull();
  });

  it('merges defaults for forward compatibility', async () => {
    const persisted = {
      version: 2,
      projects: [],
      activeProjectId: null,
      preferences: { soundOnSessionWaiting: true },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    // debugMode should be filled in from defaults
    expect(appState.preferences.debugMode).toBe(false);
    expect(appState.preferences.soundOnSessionWaiting).toBe(true);
  });

  it('emits state-loaded event', async () => {
    mockLoad.mockResolvedValue(null);
    const cb = vi.fn();
    appState.on('state-loaded', cb);
    await appState.load();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('restores persisted cost data into session-cost module', async () => {
    const costData = {
      totalCostUsd: 1.5,
      totalInputTokens: 500,
      totalOutputTokens: 200,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
      totalDurationMs: 1000,
      totalApiDurationMs: 800,
    };
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [
            {
              id: 's1',
              name: 'S1',
              cliSessionId: 'cli-1',
              createdAt: '2026-01-01',
              cost: costData,
            },
            { id: 's2', name: 'S2', cliSessionId: null, createdAt: '2026-01-02' },
          ],
          activeSessionId: 's1',
          layout: { mode: 'tabs' as const, splitPanes: [], splitDirection: 'horizontal' as const },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: false, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    expect(mockRestoreCost).toHaveBeenCalledOnce();
    expect(mockRestoreCost).toHaveBeenCalledWith('s1', costData);
  });

  it('restores persisted context window data into session-context module', async () => {
    const contextData = { totalTokens: 5000, contextWindowSize: 200000, usedPercentage: 2.5 };
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [
            {
              id: 's1',
              name: 'S1',
              cliSessionId: null,
              createdAt: '2026-01-01',
              contextWindow: contextData,
            },
          ],
          activeSessionId: 's1',
          layout: { mode: 'tabs' as const, splitPanes: [], splitDirection: 'horizontal' as const },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: false, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    expect(mockRestoreContext).toHaveBeenCalledOnce();
    expect(mockRestoreContext).toHaveBeenCalledWith('s1', contextData);
  });

  it('deduplicates history entry IDs on load', async () => {
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [],
          activeSessionId: null,
          layout: { mode: 'tabs' as const, splitPanes: [], splitDirection: 'horizontal' as const },
          sessionHistory: [
            {
              id: 'dup-id',
              name: 'Entry1',
              providerId: 'claude',
              cliSessionId: 'cli-a',
              createdAt: '2026-01-01',
              closedAt: '2026-01-01',
              cost: null,
            },
            {
              id: 'dup-id',
              name: 'Entry2',
              providerId: 'claude',
              cliSessionId: 'cli-b',
              createdAt: '2026-01-02',
              closedAt: '2026-01-02',
              cost: null,
            },
            {
              id: 'unique-id',
              name: 'Entry3',
              providerId: 'claude',
              cliSessionId: 'cli-c',
              createdAt: '2026-01-03',
              closedAt: '2026-01-03',
              cost: null,
            },
          ],
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: false, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    const history = appState.getSessionHistory('p1');
    expect(history).toHaveLength(3);
    // First entry keeps its ID, second gets a new one
    expect(history[0].id).toBe('dup-id');
    expect(history[1].id).not.toBe('dup-id');
    expect(history[2].id).toBe('unique-id');
    // All IDs are now unique
    const ids = new Set(history.map((h) => h.id));
    expect(ids.size).toBe(3);
  });

  it('does not call restoreCost for sessions without cost', async () => {
    const persisted = {
      version: 2,
      projects: [
        {
          id: 'p1',
          name: 'Proj',
          path: '/proj',
          sessions: [{ id: 's1', name: 'S1', cliSessionId: null, createdAt: '2026-01-01' }],
          activeSessionId: 's1',
          layout: { mode: 'tabs' as const, splitPanes: [], splitDirection: 'horizontal' as const },
        },
      ],
      activeProjectId: 'p1',
      preferences: { soundOnSessionWaiting: false, debugMode: false },
    };
    mockLoad.mockResolvedValue(persisted);
    await appState.load();
    expect(mockRestoreCost).not.toHaveBeenCalled();
  });

  it('hydrates a web surface from an existing browser session record', async () => {
    mockLoad.mockResolvedValue({
      version: 2,
      activeProjectId: 'project-1',
      preferences: {},
      projects: [
        {
          id: 'project-1',
          name: 'Demo',
          path: '/tmp/demo',
          activeSessionId: 'browser-1',
          layout: {
            mode: 'mosaic' as const,
            splitPanes: [],
            splitDirection: 'horizontal' as const,
          },
          sessions: [
            {
              id: 'claude-1',
              name: 'Claude',
              type: 'claude' as const,
              providerId: 'claude' as const,
              cliSessionId: 'cli-1',
              createdAt: '2026-04-12T09:00:00.000Z',
            },
            {
              id: 'browser-1',
              name: 'Live View',
              type: 'browser-tab' as const,
              cliSessionId: null,
              browserTabUrl: 'http://localhost:3000',
              browserTargetSessionId: 'claude-1',
              createdAt: '2026-04-12T09:01:00.000Z',
            },
          ],
        },
      ],
    });

    await appState.load();
    const project = appState.activeProject!;

    expect(project.surface).toEqual(
      expect.objectContaining({
        kind: 'web',
        active: true,
        targetSessionId: 'claude-1',
        web: expect.objectContaining({
          sessionId: 'browser-1',
          url: 'http://localhost:3000',
        }),
      }),
    );
  });

  it('repairs stale persisted surface refs and persists the migrated state', async () => {
    mockLoad.mockResolvedValue({
      version: 2,
      activeProjectId: 'project-1',
      starPromptDismissed: true,
      preferences: {},
      projects: [
        {
          id: 'project-1',
          name: 'Demo',
          path: '/tmp/demo',
          activeSessionId: null,
          layout: {
            mode: 'mosaic' as const,
            splitPanes: [],
            splitDirection: 'horizontal' as const,
          },
          sessions: [],
          surface: {
            kind: 'web' as const,
            active: true,
            targetSessionId: 'missing-cli',
            web: {
              sessionId: 'missing-browser',
              url: 'about:blank',
              history: ['about:blank'],
            },
          },
        },
      ],
    });

    await appState.load();

    expect(appState.activeProject?.surface).toMatchObject({
      kind: 'web',
      active: false,
      web: {
        sessionId: undefined,
        url: undefined,
        history: ['about:blank'],
      },
    });
    expect(appState.activeProject?.surface?.targetSessionId).toBeUndefined();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].projects[0].surface).toMatchObject({
      kind: 'web',
      active: false,
      web: {
        sessionId: undefined,
        url: undefined,
        history: ['about:blank'],
      },
    });
    expect(mockSave.mock.calls[0][0].projects[0].surface.targetSessionId).toBeUndefined();
  });
});

describe('persist()', () => {
  it('calls store.save after addProject', () => {
    addProject();
    expect(mockSave).toHaveBeenCalled();
    const savedState = mockSave.mock.calls[0][0];
    expect(savedState.projects).toHaveLength(1);
  });

  it('calls store.save after addSession', () => {
    const project = addProject();
    mockSave.mockClear();
    appState.addSession(project.id, 'S1');
    expect(mockSave).toHaveBeenCalled();
  });

  it('serializes saves and coalesces rapid persists to the latest snapshot', async () => {
    const completions: Array<() => void> = [];
    let inFlight = 0;
    let maxInFlight = 0;

    mockSave.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          completions.push(() => {
            inFlight -= 1;
            resolve();
          });
        }),
    );

    addProject();
    appState.setSidebarWidth(100);
    appState.setSidebarWidth(200);
    appState.setSidebarWidth(300);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(completions).toHaveLength(1);

    completions[0]();
    await Promise.resolve();

    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(mockSave.mock.calls[1][0].sidebarWidth).toBe(300);
  });

  it('logs save errors and continues future persists', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rejectFirstSave: ((reason?: unknown) => void) | null = null;

    mockSave
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectFirstSave = reject;
          }),
      )
      .mockResolvedValue(undefined);

    addProject();
    appState.setSidebarWidth(42);

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(rejectFirstSave).not.toBeNull();

    rejectFirstSave!(new Error('boom'));
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('Failed to persist renderer state:', expect.any(Error));
    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(mockSave.mock.calls[2][0].sidebarWidth).toBe(42);

    warnSpy.mockRestore();
  });
});

describe('getters', () => {
  it('projects returns empty array by default', () => {
    expect(appState.projects).toEqual([]);
  });

  it('activeProjectId returns null by default', () => {
    expect(appState.activeProjectId).toBeNull();
  });

  it('activeProject returns undefined when no projects', () => {
    expect(appState.activeProject).toBeUndefined();
  });

  it('activeSession returns undefined when no project', () => {
    expect(appState.activeSession).toBeUndefined();
  });

  it('activeProject returns the active project', () => {
    const project = addProject('My Proj', '/my');
    expect(appState.activeProject).toBeDefined();
    expect(appState.activeProject!.id).toBe(project.id);
  });

  it('activeSession returns the active session', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    expect(appState.activeSession).toBeDefined();
    expect(appState.activeSession!.id).toBe(session.id);
  });

  it('sidebarWidth returns undefined by default', () => {
    expect(appState.sidebarWidth).toBeUndefined();
  });
});
