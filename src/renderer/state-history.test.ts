import { describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../shared/types/project-state.js';
import type { SessionRecord } from '../shared/types/session.js';
import {
  archiveSessionToHistory,
  clearProjectHistory,
  removeHistoryEntryFromProject,
  resumeSessionFromHistory,
  suppressHistoryCliSessionId,
} from './state-history.js';

function makeProject(): ProjectRecord {
  return {
    id: 'p1',
    name: 'P',
    path: '/tmp/p',
    sessions: [],
    activeSessionId: null,
    layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
    sessionHistory: [],
  };
}

function makeSession(cliSessionId: string): SessionRecord {
  return {
    id: 's1',
    name: 'Session',
    providerId: 'claude',
    cliSessionId,
    createdAt: new Date().toISOString(),
  };
}

describe('history tombstone', () => {
  it('clearProjectHistory removes bookmarks and suppresses cli ids', () => {
    const project = makeProject();
    archiveSessionToHistory(project, makeSession('cli-a'), null);
    archiveSessionToHistory(project, makeSession('cli-b'), null);
    project.sessionHistory![0].bookmarked = true;

    expect(clearProjectHistory(project)).toBe(true);
    expect(project.sessionHistory).toEqual([]);
    expect(project.suppressedHistoryCliSessionIds).toEqual(['cli-a', 'cli-b']);
  });

  it('does not re-archive a suppressed cliSessionId', () => {
    const project = makeProject();
    archiveSessionToHistory(project, makeSession('cli-x'), null);
    const entryId = project.sessionHistory![0].id;
    removeHistoryEntryFromProject(project, entryId);

    archiveSessionToHistory(project, makeSession('cli-x'), null);
    expect(project.sessionHistory).toEqual([]);
  });

  it('resume from history unsuppresses so close can re-archive', () => {
    const project = makeProject();
    archiveSessionToHistory(project, makeSession('cli-y'), null);
    const entryId = project.sessionHistory![0].id;
    suppressHistoryCliSessionId(project, 'cli-y');

    const result = resumeSessionFromHistory(project, entryId, () => undefined);
    expect(result.created).toBe(true);
    expect(project.suppressedHistoryCliSessionIds).toBeUndefined();

    project.sessions = [];
    archiveSessionToHistory(project, makeSession('cli-y'), null);
    expect(project.sessionHistory).toHaveLength(1);
  });
});
