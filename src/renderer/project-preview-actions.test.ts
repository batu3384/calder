import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLoad,
  mockSave,
  mockRestartCliSurface,
} = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSave: vi.fn(),
  mockRestartCliSurface: vi.fn(),
}));

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
    cliSurface: { restart: mockRestartCliSurface },
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
import {
  describePreviewRuntimeHealth,
  focusCliPreviewSurface,
  openPreviewTargetInLiveView,
  openWorkspaceShellLogs,
  restartPreviewRuntime,
} from './project-preview-actions.js';

describe('project preview actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
  });

  it('opens a local preview target in live view', () => {
    const project = appState.addProject('Calder', '/proj');

    const session = openPreviewTargetInLiveView(project.id, 'http://localhost:4173/');

    expect(session?.type).toBe('browser-tab');
    expect(session?.browserTabUrl).toBe('http://localhost:4173/');
    expect(appState.activeProject?.surface?.kind).toBe('web');
    expect(appState.activeProject?.surface?.web?.url).toBe('http://localhost:4173/');
  });

  it('focuses the cli preview surface without dropping existing runtime state', () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: { history: ['http://localhost:4173/'] },
      cli: {
        profiles: [{ id: 'preview', name: 'Preview', command: 'npm', args: ['run', 'dev'] }],
        selectedProfileId: 'preview',
        runtime: {
          status: 'running',
          selectedProfileId: 'preview',
          command: 'npm',
          args: ['run', 'dev'],
          cwd: '/proj',
        },
      },
    });

    const focused = focusCliPreviewSurface(project.id);

    expect(focused).toBe(true);
    expect(appState.activeProject?.surface?.kind).toBe('cli');
    expect(appState.activeProject?.surface?.active).toBe(true);
    expect(appState.activeProject?.surface?.cli?.runtime?.status).toBe('running');
  });

  it('opens workspace shell logs for the selected project', () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setTerminalPanelOpen(false);

    openWorkspaceShellLogs(project.id);

    expect(appState.activeProjectId).toBe(project.id);
    expect(appState.activeProject?.terminalPanelOpen).toBe(true);
  });

  it('restarts the preview runtime through the cli surface bridge', async () => {
    mockRestartCliSurface.mockResolvedValue(undefined);
    const project = appState.addProject('Calder', '/proj');

    const result = await restartPreviewRuntime(project.id);

    expect(result).toEqual({ ok: true });
    expect(mockRestartCliSurface).toHaveBeenCalledWith(project.id);
  });

  it('returns safe defaults when preview actions target a missing project or restart fails', async () => {
    mockRestartCliSurface.mockRejectedValue(new Error('boom'));

    expect(focusCliPreviewSurface('missing-project')).toBe(false);
    expect(openWorkspaceShellLogs('missing-project')).toBe(false);
    await expect(restartPreviewRuntime('missing-project')).resolves.toEqual({
      ok: false,
      error: 'Project not found.',
    });

    const project = appState.addProject('Calder', '/proj');
    await expect(restartPreviewRuntime(project.id)).resolves.toEqual({
      ok: false,
      error: 'Failed to restart preview runtime.',
    });
  });

  it('summarizes preview runtime health from the current cli surface state', () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      web: { history: ['http://localhost:4173/'] },
      cli: {
        profiles: [{ id: 'dev', name: 'Dev server', command: 'npm', args: ['run', 'dev'] }],
        selectedProfileId: 'dev',
        runtime: {
          status: 'error',
          selectedProfileId: 'dev',
          command: 'npm',
          args: ['run', 'dev'],
          cwd: '/proj',
          lastExitCode: 1,
          lastError: 'Port 4173 is already in use',
        },
      },
    });

    expect(describePreviewRuntimeHealth(project.id)).toEqual({
      tone: 'danger',
      statusLabel: 'Error',
      detail: 'npm run dev',
      lastExitLabel: 'Exited with code 1',
      lastErrorLabel: 'Port 4173 is already in use',
    });
  });

  it('summarizes healthy, warning, and muted runtime states', () => {
    const project = appState.addProject('Calder', '/proj');

    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      web: { history: [] },
      cli: {
        profiles: [],
        runtime: {
          status: 'starting',
          command: 'npm',
          args: ['run', 'dev'],
          cwd: '/proj',
        },
      },
    });
    expect(describePreviewRuntimeHealth(project.id)).toEqual({
      tone: 'healthy',
      statusLabel: 'Starting',
      detail: 'npm run dev',
      lastExitLabel: undefined,
      lastErrorLabel: undefined,
    });

    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      web: { history: [] },
      cli: {
        profiles: [],
        runtime: {
          status: 'idle',
          command: 'npm',
          args: ['run', 'dev'],
          cwd: '/proj',
          lastExitCode: 2,
        },
      },
    });
    expect(describePreviewRuntimeHealth(project.id)).toEqual({
      tone: 'warning',
      statusLabel: 'Idle',
      detail: 'npm run dev',
      lastExitLabel: 'Exited with code 2',
      lastErrorLabel: undefined,
    });

    appState.setProjectSurface(project.id, {
      kind: 'cli',
      active: true,
      web: { history: [] },
      cli: {
        profiles: [],
        runtime: {
          status: 'stopped',
        },
      },
    });
    expect(describePreviewRuntimeHealth(project.id)).toEqual({
      tone: 'warning',
      statusLabel: 'Stopped',
      detail: 'No preview command selected',
      lastExitLabel: undefined,
      lastErrorLabel: undefined,
    });
  });
});
