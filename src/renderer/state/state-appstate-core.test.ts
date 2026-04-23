import { describe, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { ArchivedSession, SessionRecord } from '../../shared/types/session.js';
import { normalizeProjectLayout } from '../state-normalizers.js';
import { resumeHistorySessionForProject } from '../state-appstate-core.js';

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions: [],
    activeSessionId: null,
    layout: normalizeProjectLayout(),
    ...overrides,
  };
}

function makeArchivedSession(overrides: Partial<ArchivedSession> = {}): ArchivedSession {
  return {
    id: 'archived-1',
    name: 'Archived Session',
    providerId: 'claude',
    cliSessionId: 'cli-archived-1',
    createdAt: '2026-04-23T00:00:00.000Z',
    closedAt: '2026-04-23T01:00:00.000Z',
    cost: null,
    ...overrides,
  };
}

function makeLiveSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    name: 'Live Session',
    providerId: 'claude',
    cliSessionId: null,
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('state appstate core resumeHistorySessionForProject', () => {
  it('returns undefined when target project does not exist', () => {
    const pushNav = vi.fn();
    const result = resumeHistorySessionForProject({
      projects: [],
      projectId: 'missing',
      archivedSessionId: 'archived-1',
      pushNav,
    });

    expect(result).toBeUndefined();
    expect(pushNav).not.toHaveBeenCalled();
  });

  it('returns undefined when archive entry is missing or has no cliSessionId', () => {
    const pushNav = vi.fn();
    const project = makeProject({
      sessionHistory: [makeArchivedSession({ id: 'archived-without-cli', cliSessionId: null })],
    });

    const missing = resumeHistorySessionForProject({
      projects: [project],
      projectId: project.id,
      archivedSessionId: 'missing',
      pushNav,
    });
    const invalid = resumeHistorySessionForProject({
      projects: [project],
      projectId: project.id,
      archivedSessionId: 'archived-without-cli',
      pushNav,
    });

    expect(missing).toBeUndefined();
    expect(invalid).toBeUndefined();
    expect(pushNav).not.toHaveBeenCalled();
  });

  it('creates a new session when no matching cli session exists', () => {
    const pushNav = vi.fn();
    const project = makeProject({
      sessionHistory: [makeArchivedSession()],
      layout: normalizeProjectLayout({ mode: 'mosaic', splitPanes: [], splitDirection: 'horizontal' }),
    });

    const result = resumeHistorySessionForProject({
      projects: [project],
      projectId: project.id,
      archivedSessionId: 'archived-1',
      pushNav,
    });

    expect(result).toBeDefined();
    expect(result?.created).toBe(true);
    expect(result?.session.cliSessionId).toBe('cli-archived-1');
    expect(project.activeSessionId).toBe(result?.session.id);
    expect(project.layout.splitPanes).toContain(result?.session.id);
    expect(pushNav).toHaveBeenCalledWith(result?.session.id);
  });

  it('reuses existing session when cli session already exists', () => {
    const pushNav = vi.fn();
    const existing = makeLiveSession({ id: 'existing-session', cliSessionId: 'cli-archived-1' });
    const project = makeProject({
      sessions: [existing],
      sessionHistory: [makeArchivedSession()],
    });

    const result = resumeHistorySessionForProject({
      projects: [project],
      projectId: project.id,
      archivedSessionId: 'archived-1',
      pushNav,
    });

    expect(result).toBeDefined();
    expect(result?.created).toBe(false);
    expect(result?.session.id).toBe(existing.id);
    expect(project.sessions).toHaveLength(1);
    expect(project.activeSessionId).toBe(existing.id);
    expect(pushNav).toHaveBeenCalledWith(existing.id);
  });
});
