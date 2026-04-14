import type { ProjectRecord } from '../shared/types';

const { statusChangeCallbacks, eventCallbacks, mockAppState } = vi.hoisted(() => ({
  statusChangeCallbacks: [] as Array<(sessionId: string, status: string) => void>,
  eventCallbacks: new Map<string, Array<(data?: unknown) => void>>(),
  mockAppState: {
    activeProjectId: null as string | null,
    activeProject: undefined as ProjectRecord | undefined,
    projects: [] as ProjectRecord[],
    on: vi.fn(),
  },
}));

vi.mock('./session-activity', () => ({
  onChange: (cb: (sessionId: string, status: string) => void) => { statusChangeCallbacks.push(cb); },
  getStatus: vi.fn(),
}));

vi.mock('./state', () => ({ appState: mockAppState }));

import {
  init,
  isUnread,
  hasUnreadInProject,
  removeSession,
  onChange,
  _resetForTesting,
} from './session-unread';

function makeSession(id: string, name: string) {
  return {
    id,
    name,
    providerId: 'claude' as const,
    cliSessionId: null,
    createdAt: '2026-04-12T00:00:00.000Z',
  };
}

beforeEach(() => {
  _resetForTesting();
  statusChangeCallbacks.length = 0;
  eventCallbacks.clear();
  mockAppState.projects = [];
  mockAppState.activeProjectId = null;
  mockAppState.activeProject = undefined;
  mockAppState.on.mockImplementation((event: string, cb: (data?: unknown) => void) => {
    const callbacks = eventCallbacks.get(event) ?? [];
    callbacks.push(cb);
    eventCallbacks.set(event, callbacks);
  });
});

function setupProjects(): void {
  mockAppState.projects = [
    {
      id: 'p1',
      name: 'Project 1',
      path: '/tmp/p1',
      sessions: [makeSession('s1', 'Session 1')],
      activeSessionId: 's1',
      layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
    },
    {
      id: 'p2',
      name: 'Project 2',
      path: '/tmp/p2',
      sessions: [makeSession('s2', 'Session 2')],
      activeSessionId: 's2',
      layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
    },
  ] as ProjectRecord[];
  mockAppState.activeProject = mockAppState.projects.find((project) => project.id === mockAppState.activeProjectId);
}

function simulateStatusChange(sessionId: string, status: string): void {
  for (const cb of statusChangeCallbacks) cb(sessionId, status);
}

function emitAppStateEvent(event: string, data?: unknown): void {
  for (const cb of eventCallbacks.get(event) ?? []) cb(data);
}

describe('session-unread', () => {
  it('marks session as unread when it transitions from working to waiting on a non-active project', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2'; // viewing project 2
    init();

    // Transition s1 (in project 1) from working → waiting
    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');

    expect(isUnread('s1')).toBe(true);
    expect(hasUnreadInProject('p1')).toBe(true);
  });

  it('does NOT mark session as unread when it is the active session of the active project', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p1'; // viewing project 1, which has s1 as active
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');

    expect(isUnread('s1')).toBe(false);
  });

  it('marks non-active session as unread even when its project is active', () => {
    mockAppState.projects = [
      {
        id: 'p1',
        name: 'Project 1',
        path: '/tmp/p1',
        sessions: [
          makeSession('s1', 'Session 1'),
          makeSession('s2', 'Session 2'),
        ],
        activeSessionId: 's1', // s1 is active, not s2
        layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
      },
    ] as ProjectRecord[];
    mockAppState.activeProjectId = 'p1';
    init();

    simulateStatusChange('s2', 'working');
    simulateStatusChange('s2', 'waiting');

    expect(isUnread('s2')).toBe(true);
  });

  it('marks active session as unread when its project is NOT the active project', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2'; // viewing p2, not p1
    init();

    // s1 is p1's activeSessionId, but p1 is not the active project
    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');

    expect(isUnread('s1')).toBe(true);
    expect(hasUnreadInProject('p1')).toBe(true);
  });

  it('does not mark unread for non working→waiting transitions', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    init();

    simulateStatusChange('s1', 'waiting');
    simulateStatusChange('s1', 'waiting');

    expect(isUnread('s1')).toBe(false);
  });

  it('marks unread when working transitions to completed', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'completed');

    expect(isUnread('s1')).toBe(true);
  });

  it('marks unread when working transitions to input', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'input');

    expect(isUnread('s1')).toBe(true);
  });

  it('clears unread when active session changes to the unread session', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(isUnread('s1')).toBe(true);

    mockAppState.activeProjectId = 'p1';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p1');
    emitAppStateEvent('session-changed');

    expect(isUnread('s1')).toBe(false);
  });

  it('ignores session-removed events without a sessionId payload', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(isUnread('s1')).toBe(true);

    emitAppStateEvent('session-removed', {});
    expect(isUnread('s1')).toBe(true);
  });

  it('removes unread state when session-removed event includes session id', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(isUnread('s1')).toBe(true);

    emitAppStateEvent('session-removed', { sessionId: 's1' });
    expect(isUnread('s1')).toBe(false);
  });

  it('removeSession clears unread state', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    init();

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(isUnread('s1')).toBe(true);

    removeSession('s1');
    expect(isUnread('s1')).toBe(false);
  });

  it('removeSession on a non-unread session is a silent no-op for listeners', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    mockAppState.activeProject = mockAppState.projects.find((project) => project.id === 'p2');
    init();

    const cb = vi.fn();
    onChange(cb);

    removeSession('s1');
    expect(cb).not.toHaveBeenCalled();
  });

  it('notifies listeners on unread change', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    init();

    const cb = vi.fn();
    onChange(cb);

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');

    expect(cb).toHaveBeenCalled();
  });

  it('stops receiving callbacks after unsubscribe', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    init();

    const cb = vi.fn();
    const unsub = onChange(cb);

    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');
    expect(cb).toHaveBeenCalledTimes(1); // no new calls after unsub
  });

  it('only removes the specific subscriber', () => {
    setupProjects();
    mockAppState.activeProjectId = 'p2';
    init();

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = onChange(cb1);
    onChange(cb2);

    unsub1();
    simulateStatusChange('s1', 'working');
    simulateStatusChange('s1', 'waiting');

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('returns false for unknown projects when checking unread state', () => {
    setupProjects();
    expect(hasUnreadInProject('does-not-exist')).toBe(false);
  });
});
