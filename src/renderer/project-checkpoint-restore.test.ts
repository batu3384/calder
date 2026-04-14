import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
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

import { appState, _resetForTesting } from './state.js';
import type { ProjectCheckpointDocument } from '../shared/types.js';

function buildCheckpointDocument(overrides: Partial<ProjectCheckpointDocument> = {}): ProjectCheckpointDocument {
  return {
    schemaVersion: 1,
    id: 'checkpoint:2026-04-13T18:00:00.000Z:manual',
    label: 'Before risky refactor',
    createdAt: '2026-04-13T18:00:00.000Z',
    project: {
      name: 'Calder',
      path: '/proj',
    },
    activeSessionId: 'browser-old',
    sessionCount: 2,
    changedFileCount: 3,
    sessions: [
      {
        id: 'cli-old',
        name: 'Main session',
        providerId: 'claude',
        cliSessionId: 'cli-restore-1',
      },
      {
        id: 'browser-old',
        name: 'Local app',
        type: 'browser-tab',
        cliSessionId: null,
        browserTabUrl: 'http://localhost:3000',
        browserTargetSessionId: 'cli-old',
      },
    ],
    surface: {
      kind: 'web',
      active: true,
      targetSessionId: 'cli-old',
      webUrl: 'http://localhost:3000',
      webSessionId: 'browser-old',
      cliStatus: 'idle',
    },
    projectContext: {
      sharedRuleCount: 2,
      providerSourceCount: 1,
    },
    projectWorkflows: {
      workflowCount: 3,
    },
    git: {
      isGitRepo: true,
      branch: 'main',
      ahead: 0,
      behind: 0,
      changedFiles: [],
    },
    ...overrides,
  };
}

describe('project checkpoint restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    _resetForTesting();
  });

  it('restores missing cli and browser sessions without removing current work', () => {
    const project = appState.addProject('Calder', '/proj');
    const current = appState.addSession(project.id, 'Current task', undefined, 'codex')!;
    const checkpoint = buildCheckpointDocument();

    appState.restoreProjectCheckpoint(project.id, checkpoint);

    const nextProject = appState.projects.find((entry) => entry.id === project.id)!;
    expect(nextProject.sessions.map((session) => session.name)).toEqual([
      'Current task',
      'Main session',
      'localhost',
    ]);

    const restoredCli = nextProject.sessions.find((session) => session.cliSessionId === 'cli-restore-1');
    const restoredBrowser = nextProject.sessions.find((session) => session.type === 'browser-tab' && session.browserTabUrl === 'http://localhost:3000');

    expect(restoredCli?.providerId).toBe('claude');
    expect(restoredBrowser?.browserTargetSessionId).toBe(restoredCli?.id);
    expect(nextProject.activeSessionId).toBe(restoredBrowser?.id);
    expect(nextProject.surface).toMatchObject({
      kind: 'web',
      active: true,
      targetSessionId: restoredCli?.id,
      web: {
        sessionId: restoredBrowser?.id,
        url: 'http://localhost:3000',
      },
    });
    expect(nextProject.sessions.some((session) => session.id === current.id)).toBe(true);
  });

  it('reuses existing resumed cli sessions instead of duplicating them', () => {
    const project = appState.addProject('Calder', '/proj');
    const existing = appState.addSession(project.id, 'Existing restore', undefined, 'claude')!;
    appState.updateSessionCliId(project.id, existing.id, 'cli-restore-1');
    const checkpoint = buildCheckpointDocument({
      activeSessionId: 'cli-old',
      surface: {
        kind: 'cli',
        active: true,
        targetSessionId: 'cli-old',
        cliStatus: 'running',
      },
    });

    appState.restoreProjectCheckpoint(project.id, checkpoint);

    const nextProject = appState.projects.find((entry) => entry.id === project.id)!;
    const restoredMatches = nextProject.sessions.filter((session) => session.cliSessionId === 'cli-restore-1');

    expect(restoredMatches).toHaveLength(1);
    expect(nextProject.activeSessionId).toBe(existing.id);
    expect(nextProject.surface?.targetSessionId).toBe(existing.id);
  });

  it('restores diff and file reader surfaces with their saved metadata', () => {
    const project = appState.addProject('Calder', '/proj');
    const checkpoint = buildCheckpointDocument({
      activeSessionId: 'reader-old',
      sessions: [
        {
          id: 'diff-old',
          name: 'pane.ts',
          type: 'diff-viewer',
          cliSessionId: null,
          diffFilePath: '/proj/src/renderer/components/browser-tab/pane.ts',
          diffArea: 'working',
          worktreePath: '/proj',
        },
        {
          id: 'reader-old',
          name: 'README.md',
          type: 'file-reader',
          cliSessionId: null,
          fileReaderPath: '/proj/README.md',
          fileReaderLine: 88,
        },
      ],
      surface: {
        kind: 'cli',
        active: false,
        cliStatus: 'idle',
      },
    });

    appState.restoreProjectCheckpoint(project.id, checkpoint);

    const nextProject = appState.projects.find((entry) => entry.id === project.id)!;
    const diffSession = nextProject.sessions.find((session) => session.type === 'diff-viewer');
    const readerSession = nextProject.sessions.find((session) => session.type === 'file-reader');

    expect(diffSession).toMatchObject({
      diffFilePath: '/proj/src/renderer/components/browser-tab/pane.ts',
      diffArea: 'working',
      worktreePath: '/proj',
    });
    expect(readerSession).toMatchObject({
      fileReaderPath: '/proj/README.md',
      fileReaderLine: 88,
    });
    expect(nextProject.activeSessionId).toBe(readerSession?.id);
  });

  it('can replace the current session layout with the checkpoint snapshot', () => {
    const removedCb = vi.fn();
    const project = appState.addProject('Calder', '/proj');
    const currentCli = appState.addSession(project.id, 'Current task', undefined, 'codex')!;
    const currentReader = appState.addFileReaderSession(project.id, '/proj/notes.md', 12)!;
    appState.on('session-removed', removedCb);

    const checkpoint = buildCheckpointDocument();

    appState.restoreProjectCheckpoint(project.id, checkpoint, 'replace');

    const nextProject = appState.projects.find((entry) => entry.id === project.id)!;
    expect(nextProject.sessions.map((session) => session.name)).toEqual([
      'Main session',
      'localhost',
    ]);
    expect(nextProject.sessions.some((session) => session.id === currentCli.id)).toBe(false);
    expect(nextProject.sessions.some((session) => session.id === currentReader.id)).toBe(false);

    const restoredCli = nextProject.sessions.find((session) => session.cliSessionId === 'cli-restore-1');
    expect(nextProject.layout.splitPanes).toEqual([restoredCli?.id]);
    expect(removedCb).toHaveBeenCalledTimes(2);
    expect(removedCb).toHaveBeenCalledWith({ projectId: project.id, sessionId: currentCli.id });
    expect(removedCb).toHaveBeenCalledWith({ projectId: project.id, sessionId: currentReader.id });
  });
});
