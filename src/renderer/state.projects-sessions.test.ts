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

import { getCost } from './session-cost.js';
import { _resetForTesting, appState } from './state';
import { addProject, addProjectWithSessions } from './state/appstate-test-support';

const mockGetCost = vi.mocked(getCost);

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

describe('addProject()', () => {
  it('creates project with UUID and sets it active', () => {
    const project = addProject('Foo', '/foo');
    expect(project.id).toBe('uuid-1');
    expect(project.name).toBe('Foo');
    expect(project.path).toBe('/foo');
    expect(project.sessions).toEqual([]);
    expect(project.activeSessionId).toBeNull();
    expect(appState.activeProjectId).toBe('uuid-1');
  });

  it('defaults new projects to the mosaic layout shell', () => {
    const project = addProject('Foo', '/foo');

    expect(project.layout).toMatchObject({
      mode: 'mosaic',
      splitPanes: [],
      splitDirection: 'horizontal',
      browserWidthRatio: 0.38,
      mosaicRatios: {},
    });
  });

  it('emits project-added and project-changed', () => {
    const addedCb = vi.fn();
    const changedCb = vi.fn();
    appState.on('project-added', addedCb);
    appState.on('project-changed', changedCb);
    const project = addProject();
    expect(addedCb).toHaveBeenCalledWith(project);
    expect(changedCb).toHaveBeenCalledTimes(1);
  });
});

describe('removeProject()', () => {
  it('removes the project and falls back to first remaining', () => {
    const p1 = addProject('P1', '/p1');
    const p2 = addProject('P2', '/p2');
    // p2 is active now
    appState.removeProject(p2.id);
    expect(appState.projects).toHaveLength(1);
    expect(appState.activeProjectId).toBe(p1.id);
  });

  it('sets activeProjectId to null when last project removed', () => {
    const p = addProject();
    appState.removeProject(p.id);
    expect(appState.projects).toHaveLength(0);
    expect(appState.activeProjectId).toBeNull();
  });

  it('emits project-removed and project-changed', () => {
    const removedCb = vi.fn();
    const changedCb = vi.fn();
    const p = addProject();
    appState.on('project-removed', removedCb);
    appState.on('project-changed', changedCb);
    appState.removeProject(p.id);
    expect(removedCb).toHaveBeenCalledWith(p.id);
    expect(changedCb).toHaveBeenCalled();
  });

  it('emits session-removed for each session before removing project', () => {
    const sessionRemovedCb = vi.fn();
    const p = addProject();
    const s1 = appState.addSession(p.id, 'S1')!;
    const s2 = appState.addSession(p.id, 'S2')!;
    appState.on('session-removed', sessionRemovedCb);
    appState.removeProject(p.id);
    expect(sessionRemovedCb).toHaveBeenCalledTimes(2);
    expect(sessionRemovedCb).toHaveBeenCalledWith({ projectId: p.id, sessionId: s1.id });
    expect(sessionRemovedCb).toHaveBeenCalledWith({ projectId: p.id, sessionId: s2.id });
  });
});

describe('addSession()', () => {
  it('creates a session and sets it active', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1', '--verbose')!;
    expect(session).toBeDefined();
    expect(session.name).toBe('S1');
    expect(session.args).toBe('--verbose');
    expect(session.cliSessionId).toBeNull();
    expect(appState.activeProject!.activeSessionId).toBe(session.id);
  });

  it('adds new CLI sessions to splitPanes while in mosaic mode', () => {
    const project = addProject();

    const session = appState.addSession(project.id, 'S1')!;

    expect(appState.activeProject!.layout.mode).toBe('mosaic');
    expect(appState.activeProject!.layout.splitPanes).toEqual([session.id]);
  });

  it('returns undefined for nonexistent project', () => {
    expect(appState.addSession('nonexistent', 'S')).toBeUndefined();
  });

  it('emits session-added and session-changed', () => {
    const addedCb = vi.fn();
    const changedCb = vi.fn();
    const project = addProject();
    appState.on('session-added', addedCb);
    appState.on('session-changed', changedCb);
    appState.addSession(project.id, 'S1');
    expect(addedCb).toHaveBeenCalledTimes(1);
    expect(changedCb).toHaveBeenCalledTimes(1);
  });

  it('uses project defaultArgs when no explicit args provided', () => {
    const project = addProject();
    project.defaultArgs = '--model sonnet';
    const session = appState.addSession(project.id, 'S1')!;
    expect(session.args).toBe('--model sonnet');
  });

  it('explicit args override project defaultArgs', () => {
    const project = addProject();
    project.defaultArgs = '--model sonnet';
    const session = appState.addSession(project.id, 'S1', '--model opus')!;
    expect(session.args).toBe('--model opus');
  });

  it('no args when neither explicit args nor defaultArgs set', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    expect(session.args).toBeUndefined();
  });

  it('uses the persisted default provider when no explicit provider is passed', () => {
    const project = addProject();
    appState.setPreference('defaultProvider', 'antigravity');
    const session = appState.addSession(project.id, 'S1')!;
    expect(session.providerId).toBe('antigravity');
  });

  it('keeps an explicit provider instead of the persisted default provider', () => {
    const project = addProject();
    appState.setPreference('defaultProvider', 'antigravity');
    const session = appState.addSession(project.id, 'S1', undefined, 'codex')!;
    expect(session.providerId).toBe('codex');
  });

  it('lets plan sessions use an explicit provider override instead of the active session provider', () => {
    const project = addProject();
    appState.setPreference('defaultProvider', 'antigravity');
    appState.addSession(project.id, 'Existing', undefined, 'codex');

    const session = (appState as any).addPlanSession(project.id, 'Fix auth modal', 'claude')!;

    expect(session.providerId).toBe('claude');
  });
});

describe('addDiffViewerSession()', () => {
  it('creates a diff-viewer session', () => {
    const project = addProject();
    const session = appState.addDiffViewerSession(project.id, '/path/to/file.ts', 'staged')!;
    expect(session.type).toBe('diff-viewer');
    expect(session.diffFilePath).toBe('/path/to/file.ts');
    expect(session.diffArea).toBe('staged');
    expect(session.name).toBe('file.ts');
  });

  it('deduplicates existing same file+area+worktree', () => {
    const project = addProject();
    const s1 = appState.addDiffViewerSession(project.id, '/f.ts', 'staged', '/wt')!;
    const s2 = appState.addDiffViewerSession(project.id, '/f.ts', 'staged', '/wt')!;
    expect(s2.id).toBe(s1.id);
    expect(appState.activeProject!.sessions).toHaveLength(1);
  });

  it('does not deduplicate different area', () => {
    const project = addProject();
    appState.addDiffViewerSession(project.id, '/f.ts', 'staged');
    appState.addDiffViewerSession(project.id, '/f.ts', 'unstaged');
    expect(appState.activeProject!.sessions).toHaveLength(2);
  });

  it('returns undefined for nonexistent project', () => {
    expect(appState.addDiffViewerSession('nope', '/f', 'staged')).toBeUndefined();
  });
});

describe('addFileReaderSession()', () => {
  it('creates a file-reader session', () => {
    const project = addProject();
    const session = appState.addFileReaderSession(project.id, '/path/to/readme.md')!;
    expect(session.type).toBe('file-reader');
    expect(session.fileReaderPath).toBe('/path/to/readme.md');
    expect(session.name).toBe('readme.md');
  });

  it('deduplicates existing same path', () => {
    const project = addProject();
    const s1 = appState.addFileReaderSession(project.id, '/f.ts')!;
    const s2 = appState.addFileReaderSession(project.id, '/f.ts')!;
    expect(s2.id).toBe(s1.id);
    expect(appState.activeProject!.sessions).toHaveLength(1);
  });

  it('returns undefined for nonexistent project', () => {
    expect(appState.addFileReaderSession('nope', '/f')).toBeUndefined();
  });
});

describe('addMcpInspectorSession()', () => {
  it('creates an mcp-inspector session', () => {
    const project = addProject();
    const session = appState.addMcpInspectorSession(project.id, 'Inspector')!;
    expect(session.type).toBe('mcp-inspector');
    expect(session.name).toBe('Inspector');
  });

  it('returns undefined for nonexistent project', () => {
    expect(appState.addMcpInspectorSession('nope', 'I')).toBeUndefined();
  });
});

describe('browser target sessions', () => {
  it('seeds a new browser tab with the previously active cli session as its target', () => {
    const project = addProject();
    const cli = appState.addSession(project.id, 'Coder', undefined, 'codex')!;

    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    expect(browser.browserTargetSessionId).toBe(cli.id);
    expect(appState.resolveBrowserTargetSession(browser.id)?.id).toBe(cli.id);
  });

  it('retargets a browser tab when its chosen cli session is removed', () => {
    const project = addProject();
    const primary = appState.addSession(project.id, 'Primary', undefined, 'claude')!;
    const secondary = appState.addSession(project.id, 'Secondary', undefined, 'codex')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    appState.setBrowserTargetSession(browser.id, secondary.id);
    appState.setActiveSession(project.id, primary.id);
    appState.removeSession(project.id, secondary.id);

    const browserSession = appState.activeProject!.sessions.find(
      (session) => session.id === browser.id,
    )!;
    expect(browserSession.browserTargetSessionId).toBe(primary.id);
    expect(appState.resolveBrowserTargetSession(browser.id)?.id).toBe(primary.id);
  });

  it('lists and resolves targetable surface sessions without using browser-tab state', () => {
    const project = appState.addProject('CLI Demo', '/tmp/cli-demo');
    const first = appState.addSession(project.id, 'First')!;
    const second = appState.addSession(project.id, 'Second')!;

    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      targetSessionId: second.id,
    });

    expect(appState.listSurfaceTargetSessions(project.id).map((session) => session.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(appState.resolveSurfaceTargetSession(project.id)?.id).toBe(second.id);
  });

  it('supports strict target resolution that skips active-session fallback', () => {
    const project = appState.addProject('Strict Routing', '/tmp/strict-routing');
    const first = appState.addSession(project.id, 'First')!;

    expect(appState.resolveSurfaceTargetSession(project.id)?.id).toBe(first.id);
    expect(
      appState.resolveSurfaceTargetSession(project.id, { requireExplicitTarget: true }),
    ).toBeUndefined();

    appState.setSurfaceTargetSession(project.id, first.id);
    expect(
      appState.resolveSurfaceTargetSession(project.id, { requireExplicitTarget: true })?.id,
    ).toBe(first.id);
  });

  it('keeps browser wrapper helpers working through surface state', () => {
    const project = addProject();
    const target = appState.addSession(project.id, 'Claude')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:4173')!;

    appState.setSurfaceTargetSession(project.id, target.id);

    expect(appState.resolveBrowserTargetSession(browser.id)?.id).toBe(target.id);
    expect(appState.listBrowserTargetSessions(browser.id).map((session) => session.id)).toContain(
      target.id,
    );
  });

  it('reuses the current live view session when opening a new embedded browser url', () => {
    const project = addProject();
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    mockSave.mockClear();

    const reused = appState.openUrlInBrowserSurface(project.id, 'http://localhost:4173')!;

    expect(reused.id).toBe(browser.id);
    expect(
      appState.activeProject!.sessions.filter((session) => session.type === 'browser-tab'),
    ).toHaveLength(1);
    expect(appState.activeProject!.activeSessionId).toBe(browser.id);
    expect(appState.activeProject!.surface?.kind).toBe('web');
    expect(appState.activeProject!.surface?.active).toBe(true);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: browser.id,
      url: 'http://localhost:4173',
    });
    expect(appState.activeProject!.surface?.web?.history).toEqual([
      'http://localhost:3000',
      'http://localhost:4173',
    ]);
    expect(
      appState.activeProject!.sessions.find((session) => session.id === browser.id)?.browserTabUrl,
    ).toBe('http://localhost:4173');
    expect(mockSave).toHaveBeenCalled();
  });

  it('prefers the surfaced browser tab even when another browser tab is active', () => {
    const project = addProject();
    const first = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    const second = appState.addBrowserTabSession(project.id, 'http://localhost:3001', {
      dedupeByUrl: false,
    })!;

    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        sessionId: first.id,
        url: first.browserTabUrl,
        history: [first.browserTabUrl!, second.browserTabUrl!],
      },
    });

    mockSave.mockClear();
    const reused = appState.openUrlInBrowserSurface(project.id, 'http://localhost:3002')!;

    expect(reused.id).toBe(first.id);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: first.id,
      url: 'http://localhost:3002',
    });
    expect(
      appState.activeProject!.sessions.find((session) => session.id === first.id)?.browserTabUrl,
    ).toBe('http://localhost:3002');
    expect(
      appState.activeProject!.sessions.find((session) => session.id === second.id)?.browserTabUrl,
    ).toBe('http://localhost:3001');
    expect(mockSave).toHaveBeenCalled();
  });

  it('does not let split pane order override the surfaced browser tab target', () => {
    const project = addProject();
    const first = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    const second = appState.addBrowserTabSession(project.id, 'http://localhost:3001', {
      dedupeByUrl: false,
    })!;
    appState.addSession(project.id, 'Claude');

    appState.activeProject!.layout = {
      mode: 'mosaic',
      splitPanes: [first.id],
      splitDirection: 'horizontal',
      browserWidthRatio: 0.38,
      mosaicRatios: {},
    };

    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        sessionId: second.id,
        url: second.browserTabUrl,
        history: [first.browserTabUrl!, second.browserTabUrl!],
      },
    });

    appState.setActiveSession(project.id, second.id);
    mockSave.mockClear();

    const reused = appState.openUrlInBrowserSurface(project.id, 'http://localhost:3002')!;

    expect(reused.id).toBe(second.id);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: second.id,
      url: 'http://localhost:3002',
    });
    expect(
      appState.activeProject!.sessions.find((session) => session.id === second.id)?.browserTabUrl,
    ).toBe('http://localhost:3002');
    expect(
      appState.activeProject!.sessions.find((session) => session.id === first.id)?.browserTabUrl,
    ).toBe('http://localhost:3000');
    expect(mockSave).toHaveBeenCalled();
  });

  it('synchronizes live view surface metadata when activating a browser tab', () => {
    const project = addProject();
    const first = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    const second = appState.addBrowserTabSession(project.id, 'http://localhost:3001', {
      dedupeByUrl: false,
    })!;

    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        sessionId: first.id,
        url: first.browserTabUrl,
        history: [first.browserTabUrl!],
      },
    });

    mockSave.mockClear();
    appState.setActiveSession(project.id, second.id);

    expect(appState.activeProject!.activeSessionId).toBe(second.id);
    expect(appState.activeProject!.surface?.kind).toBe('web');
    expect(appState.activeProject!.surface?.active).toBe(true);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: second.id,
      url: second.browserTabUrl,
    });
    expect(appState.activeProject!.surface?.web?.history).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
    ]);
    expect(mockSave).toHaveBeenCalled();
  });

  it('can open a distinct browser tab session even when the same url is already open', () => {
    const project = addProject();
    const first = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    mockSave.mockClear();

    const second = appState.addBrowserTabSession(project.id, 'http://localhost:3000', {
      dedupeByUrl: false,
    })!;

    expect(second.id).not.toBe(first.id);
    expect(
      appState.activeProject!.sessions.filter((session) => session.type === 'browser-tab'),
    ).toHaveLength(2);
    expect(appState.activeProject!.activeSessionId).toBe(second.id);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: second.id,
      url: 'http://localhost:3000',
    });
    expect(mockSave).toHaveBeenCalled();
  });

  it('passivates an unreachable browser surface while preserving its history', () => {
    const project = addProject();
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;

    mockSave.mockClear();
    appState.passivateBrowserTabSession(browser.id, 'http://localhost:3000');

    const browserSession = appState.activeProject!.sessions.find(
      (session) => session.id === browser.id,
    )!;
    expect(browserSession.browserTabUrl).toBeUndefined();
    expect(appState.activeProject!.surface?.kind).toBe('web');
    expect(appState.activeProject!.surface?.active).toBe(false);
    expect(appState.activeProject!.surface?.web).toMatchObject({
      sessionId: browser.id,
      url: undefined,
    });
    expect(appState.activeProject!.surface?.web?.history).toEqual(['http://localhost:3000']);
    expect(mockSave).toHaveBeenCalled();
  });

  it('finds the deepest matching project for a cwd when routing browser urls', () => {
    const root = appState.addProject('Root', '/workspace/root');
    const nested = appState.addProject('Nested', '/workspace/root/packages/app');

    const matched = (appState as any).findProjectForPath('/workspace/root/packages/app/src/pages');

    expect(matched?.id).toBe(nested.id);
    expect(matched?.id).not.toBe(root.id);
  });
});

describe('removeSession()', () => {
  it('closing last tab activates previous tab', () => {
    const { project, sessions } = addProjectWithSessions(3);
    // active is the last added session (sessions[2])
    appState.removeSession(project.id, sessions[2].id);
    expect(appState.activeProject!.sessions).toHaveLength(2);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[1].id);
  });

  it('closing middle tab activates previous tab', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.setActiveSession(project.id, sessions[1].id);
    appState.removeSession(project.id, sessions[1].id);
    expect(appState.activeProject!.sessions).toHaveLength(2);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[0].id);
  });

  it('closing first tab activates next tab', () => {
    const { project, sessions } = addProjectWithSessions(3);
    appState.setActiveSession(project.id, sessions[0].id);
    appState.removeSession(project.id, sessions[0].id);
    expect(appState.activeProject!.sessions).toHaveLength(2);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[1].id);
  });

  it('sets activeSessionId to null when last session removed', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.removeSession(project.id, session.id);
    expect(appState.activeProject!.activeSessionId).toBeNull();
  });

  it('clears session from splitPanes', () => {
    const { project, sessions } = addProjectWithSessions(2);
    // default mode is mosaic, so splitPanes are auto-populated
    expect(appState.activeProject!.layout.splitPanes.length).toBeGreaterThan(0);
    appState.removeSession(project.id, sessions[0].id);
    expect(appState.activeProject!.layout.splitPanes).not.toContain(sessions[0].id);
  });

  it('emits session-removed and session-changed', () => {
    const removedCb = vi.fn();
    const changedCb = vi.fn();
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.on('session-removed', removedCb);
    appState.on('session-changed', changedCb);
    appState.removeSession(project.id, session.id);
    expect(removedCb).toHaveBeenCalledWith({ projectId: project.id, sessionId: session.id });
    expect(changedCb).toHaveBeenCalled();
  });
});

describe('setActiveSession()', () => {
  it('updates activeSessionId and persists', () => {
    const { project, sessions } = addProjectWithSessions(2);
    mockSave.mockClear();
    appState.setActiveSession(project.id, sessions[0].id);
    expect(appState.activeProject!.activeSessionId).toBe(sessions[0].id);
    expect(mockSave).toHaveBeenCalled();
  });
});

describe('setSurfaceTargetSession()', () => {
  it('updates project and browser-tab targets when switching to another cli session', () => {
    const project = addProject();
    const first = appState.addSession(project.id, 'First')!;
    const second = appState.addSession(project.id, 'Second')!;
    const browserA = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    const browserB = appState.addBrowserTabSession(project.id, 'http://localhost:4173', {
      dedupeByUrl: false,
    })!;
    const sessionChanged = vi.fn();
    appState.on('session-changed', sessionChanged);

    appState.setSurfaceTargetSession(project.id, first.id);

    const updatedProject = appState.projects.find((entry) => entry.id === project.id)!;
    expect(updatedProject.surface?.targetSessionId).toBe(first.id);
    expect(
      updatedProject.sessions.find((entry) => entry.id === browserA.id)?.browserTargetSessionId,
    ).toBe(first.id);
    expect(
      updatedProject.sessions.find((entry) => entry.id === browserB.id)?.browserTargetSessionId,
    ).toBe(first.id);
    expect(
      updatedProject.sessions.find((entry) => entry.id === second.id)?.browserTargetSessionId,
    ).toBeUndefined();
    expect(sessionChanged).toHaveBeenCalled();
  });

  it('clears explicit target and browser-tab links when target is set to null', () => {
    const project = addProject();
    const first = appState.addSession(project.id, 'First')!;
    appState.addSession(project.id, 'Second')!;
    const browser = appState.addBrowserTabSession(project.id, 'http://localhost:3000')!;
    appState.setSurfaceTargetSession(project.id, first.id);
    const sessionChanged = vi.fn();
    appState.on('session-changed', sessionChanged);

    appState.setSurfaceTargetSession(project.id, null);

    const updatedProject = appState.projects.find((entry) => entry.id === project.id)!;
    expect(updatedProject.surface?.targetSessionId).toBeUndefined();
    expect(
      updatedProject.sessions.find((entry) => entry.id === browser.id)?.browserTargetSessionId,
    ).toBeUndefined();
    expect(sessionChanged).toHaveBeenCalled();
  });
});

describe('resumeWithProvider()', () => {
  it('creates a new session with a provider-routed resume prompt', async () => {
    const project = addProject();
    const source = appState.addSession(project.id, 'Source Session', undefined, 'claude')!;
    source.cliSessionId = 'cli-source';
    appState.setProjectGovernance(project.id, {
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
    });

    const resumed = await appState.resumeWithProvider(
      project.id,
      { sessionId: source.id },
      'codex',
    );

    expect(resumed).toBeDefined();
    expect(resumed?.providerId).toBe('codex');
    expect(resumed?.cliSessionId).toBeNull();
    expect(resumed?.name).toContain('Source Session');
    expect(resumed?.name).toContain('codex');
    expect(mockBuildResumeWithPrompt).toHaveBeenCalledWith(
      'claude',
      'cli-source',
      '/test',
      'Source Session',
    );
    expect(resumed?.pendingInitialPrompt).toContain('Project governance policy:');
  });

  it('returns undefined when source session cannot be resolved', async () => {
    const project = addProject();

    const resumed = await appState.resumeWithProvider(project.id, {}, 'codex');

    expect(resumed).toBeUndefined();
    expect(mockBuildResumeWithPrompt).not.toHaveBeenCalled();
  });

  it('can resume from an archived session reference', async () => {
    const project = addProject();
    const source = appState.addSession(project.id, 'Archived Source', undefined, 'claude')!;
    appState.updateSessionCliId(project.id, source.id, 'cli-archived');
    appState.removeSession(project.id, source.id);
    const archived = appState.getSessionHistory(project.id)[0];

    const resumed = await appState.resumeWithProvider(
      project.id,
      { archivedSessionId: archived.id },
      'codex',
    );

    expect(resumed).toBeDefined();
    expect(resumed?.providerId).toBe('codex');
    expect(resumed?.name).toContain('Archived Source');
    expect(mockBuildResumeWithPrompt).toHaveBeenCalledWith(
      'claude',
      'cli-archived',
      '/test',
      'Archived Source',
    );
  });
});

describe('updateSessionCliId()', () => {
  it('updates cliSessionId and persists', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    mockSave.mockClear();
    appState.updateSessionCliId(project.id, session.id, 'claude-abc');
    expect(appState.activeSession!.cliSessionId).toBe('claude-abc');
    expect(mockSave).toHaveBeenCalled();
  });

  it('resets userRenamed when cliSessionId changes', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;
    appState.updateSessionCliId(project.id, session.id, 'claude-abc');
    appState.renameSession(project.id, session.id, 'Custom', true);
    expect(appState.activeSession!.userRenamed).toBe(true);
    // Simulate /clear: new cliSessionId
    appState.updateSessionCliId(project.id, session.id, 'claude-xyz');
    expect(appState.activeSession!.userRenamed).toBe(false);
  });
});

describe('deprecated session id wrappers', () => {
  it('updateSessionClaudeId delegates to updateSessionCliId', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;

    appState.updateSessionClaudeId(project.id, session.id, 'cli-legacy');

    expect(appState.activeSession?.cliSessionId).toBe('cli-legacy');
  });
});

describe('hasSession()', () => {
  it('returns true for existing sessions and false otherwise', () => {
    const project = addProject();
    const session = appState.addSession(project.id, 'S1')!;

    expect(appState.hasSession(session.id)).toBe(true);
    expect(appState.hasSession('missing-session')).toBe(false);
  });
});
