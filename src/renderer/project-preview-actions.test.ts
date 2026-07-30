import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoad, mockSave } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSave: vi.fn(),
}));

vi.stubGlobal('window', {
  calder: {
    store: { load: mockLoad, save: mockSave },
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

import { openPreviewTargetInLiveView, openWorkspaceShellLogs } from './project-preview-actions.js';
import { _resetForTesting, appState } from './state.js';

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

  it('opens workspace shell logs for the selected project', () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setTerminalPanelOpen(false);

    openWorkspaceShellLogs(project.id);

    expect(appState.activeProjectId).toBe(project.id);
    expect(appState.activeProject?.terminalPanelOpen).toBe(true);
  });

  it('returns false when workspace shell logs target a missing project', () => {
    expect(openWorkspaceShellLogs('missing-project')).toBe(false);
  });
});
