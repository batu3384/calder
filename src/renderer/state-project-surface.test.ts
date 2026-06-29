import { describe, expect, it } from 'vitest';

import type { ProjectRecord } from '../shared/types/project-state.js';
import type { SessionRecord } from '../shared/types/session.js';
import { normalizeProjectLayout } from './state-normalizers.js';
import {
  findActiveCliSession,
  isCliSessionRecord,
  repairProjectSurface,
  resolveSurfaceTargetFromProject,
} from './state-project-surface.js';

function cliSession(id: string, overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    name: id,
    cliSessionId: null,
    createdAt: '2026-04-21T00:00:00Z',
    ...overrides,
  };
}

function browserSession(id: string, url: string, overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    name: id,
    type: 'browser-tab',
    browserTabUrl: url,
    cliSessionId: null,
    createdAt: '2026-04-21T00:00:00Z',
    ...overrides,
  };
}

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

describe('state project surface helpers', () => {
  it('classifies only default/claude sessions as CLI targets', () => {
    expect(isCliSessionRecord(cliSession('default'))).toBe(true);
    expect(isCliSessionRecord(cliSession('claude', { type: 'claude' }))).toBe(true);
    expect(isCliSessionRecord(browserSession('browser', 'http://localhost:3000'))).toBe(false);
  });

  it('prefers explicit surface target and can disable active fallback', () => {
    const first = cliSession('cli-1');
    const second = cliSession('cli-2');
    const project = makeProject({
      sessions: [first, second],
      activeSessionId: first.id,
      surface: {
        kind: 'cli',
        active: true,
        targetSessionId: second.id,
      },
    });

    expect(findActiveCliSession(project)?.id).toBe(first.id);
    expect(resolveSurfaceTargetFromProject(project)?.id).toBe(second.id);
    expect(resolveSurfaceTargetFromProject({
      ...project,
      surface: { ...project.surface!, targetSessionId: undefined },
    }, { allowActiveFallback: false })).toBeUndefined();
  });

  it('repairs stale browser target links from the active CLI session', () => {
    const cli = cliSession('cli-1');
    const browser = browserSession('browser-1', 'http://localhost:3000', {
      browserTargetSessionId: 'missing-cli',
    });
    const project = makeProject({
      sessions: [cli, browser],
      activeSessionId: cli.id,
      surface: {
        kind: 'web',
        active: true,
        targetSessionId: 'missing-cli',
        web: {
          sessionId: browser.id,
          url: 'http://stale.local',
          history: ['http://stale.local'],
        },
        cli: { profiles: [], runtime: { status: 'idle' } },
      },
    });

    expect(repairProjectSurface(project)).toBe(true);
    expect(project.surface?.targetSessionId).toBe(cli.id);
    expect(browser.browserTargetSessionId).toBe(cli.id);
    expect(project.surface?.web).toEqual({
      sessionId: browser.id,
      url: 'http://localhost:3000',
      history: ['http://stale.local'],
    });
  });

  it('clears missing targets when no CLI fallback exists', () => {
    const browser = browserSession('browser-1', 'http://localhost:3000', {
      browserTargetSessionId: 'missing-cli',
    });
    const project = makeProject({
      sessions: [browser],
      activeSessionId: browser.id,
      surface: {
        kind: 'web',
        active: true,
        targetSessionId: 'missing-cli',
        web: { sessionId: browser.id, history: [] },
      },
    });

    repairProjectSurface(project);

    expect(project.surface?.targetSessionId).toBeUndefined();
    expect(browser.browserTargetSessionId).toBeUndefined();
  });

  it('passivates stale web surface references when no browser session remains', () => {
    const project = makeProject({
      sessions: [],
      activeSessionId: null,
      surface: {
        kind: 'web',
        active: true,
        targetSessionId: 'missing-cli',
        web: {
          sessionId: 'missing-browser',
          url: 'about:blank',
          history: ['about:blank'],
        },
      },
    });

    expect(repairProjectSurface(project)).toBe(true);
    expect(project.surface).toEqual({
      kind: 'web',
      active: false,
      tabFocus: 'session',
      tabPlacement: 'end',
      tabOrder: ['cli', 'mobile'],
      web: {
        sessionId: undefined,
        url: undefined,
        history: ['about:blank'],
      },
      cli: {
        selectedProfileId: undefined,
        profiles: [],
        runtime: { status: 'idle' },
      },
    });
  });
});
