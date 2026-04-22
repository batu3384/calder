import { describe, expect, it } from 'vitest';
import type { InitialContextSnapshot, SessionRecord } from '../shared/types/session.js';
import type { ProjectRecord } from '../shared/types/project.js';
import {
  addInsightSnapshotToProject,
  dismissInsightForProject,
  isInsightDismissedForProject,
  reorderProjectSession,
} from './state-session-mutators.js';

function makeSession(id: string): SessionRecord {
  return {
    id,
    name: id,
    cliSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeProject(): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    surface: {
      kind: 'web',
      active: false,
      tabFocus: 'session',
      tabPlacement: 'end',
      tabOrder: ['cli', 'mobile'],
      web: { history: [] },
      cli: { profiles: [], runtime: { status: 'idle' } },
    },
    layout: {
      mode: 'tabs',
      splitPanes: [],
      splitDirection: 'horizontal',
    },
  };
}

describe('state-session-mutators', () => {
  it('adds insight snapshots and caps history at 50 entries', () => {
    const project = makeProject();
    const snapshot = (id: number): InitialContextSnapshot => ({
      sessionId: `session-${id}`,
      timestamp: `2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`,
      totalTokens: id,
      contextWindowSize: 1_000,
      usedPercentage: id,
    });

    for (let i = 1; i <= 55; i++) {
      addInsightSnapshotToProject(project, snapshot(i));
    }

    expect(project.insights?.initialContextSnapshots).toHaveLength(50);
    expect(project.insights?.initialContextSnapshots[0]?.sessionId).toBe('session-6');
    expect(project.insights?.initialContextSnapshots[49]?.sessionId).toBe('session-55');
  });

  it('tracks dismissed insights idempotently', () => {
    const project = makeProject();
    dismissInsightForProject(project, 'insight-1');
    dismissInsightForProject(project, 'insight-1');

    expect(project.insights?.dismissed).toEqual(['insight-1']);
    expect(isInsightDismissedForProject(project, 'insight-1')).toBe(true);
    expect(isInsightDismissedForProject(project, 'insight-2')).toBe(false);
  });

  it('reorders sessions and keeps split panes aligned', () => {
    const project = makeProject();
    project.sessions = [makeSession('a'), makeSession('b'), makeSession('c')];
    project.layout.splitPanes = ['a', 'c'];

    const changed = reorderProjectSession(project, 'c', 0);

    expect(changed).toBe(true);
    expect(project.sessions.map((session) => session.id)).toEqual(['c', 'a', 'b']);
    expect(project.layout.splitPanes).toEqual(['c', 'a']);
  });

  it('does not change order when session is missing', () => {
    const project = makeProject();
    project.sessions = [makeSession('a'), makeSession('b')];

    const changed = reorderProjectSession(project, 'missing', 1);

    expect(changed).toBe(false);
    expect(project.sessions.map((session) => session.id)).toEqual(['a', 'b']);
  });
});
