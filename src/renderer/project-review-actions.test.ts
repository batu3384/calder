import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLoad,
  mockSave,
  mockDeliverPromptToTerminalSession,
} = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSave: vi.fn(),
  mockDeliverPromptToTerminalSession: vi.fn(),
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

vi.mock('./components/terminal-pane.js', () => ({
  deliverPromptToTerminalSession: mockDeliverPromptToTerminalSession,
}));

import { appState, _resetForTesting } from './state.js';
import { buildProjectReviewFixPrompt, sendProjectReviewToSelectedSession } from './project-review-actions.js';

describe('project review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
  });

  it('builds a reusable fix prompt from a saved review document', () => {
    const prompt = buildProjectReviewFixPrompt({
      path: '/proj/.calder/reviews/pr-42.md',
      relativePath: '.calder/reviews/pr-42.md',
      title: 'PR 42 Findings',
      contents: '# PR 42 Findings\n\nCrash risk in restore flow.\n',
    });

    expect(prompt).toContain('Address the following saved review findings');
    expect(prompt).toContain('Review findings: PR 42 Findings');
    expect(prompt).toContain('Source: .calder/reviews/pr-42.md');
    expect(prompt).toContain('Crash risk in restore flow.');
  });

  it('omits empty review body sections after trimming', () => {
    const prompt = buildProjectReviewFixPrompt({
      path: '/proj/.calder/reviews/pr-empty.md',
      relativePath: '.calder/reviews/pr-empty.md',
      title: 'PR Empty',
      contents: '   \n   ',
    });

    expect(prompt).toContain('Review findings: PR Empty');
    expect(prompt).not.toContain('\n\n\n');
  });

  it('delivers a saved review prompt to the selected cli session', async () => {
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const project = appState.addProject('Calder', '/proj');
    const session = appState.addSession(project.id, 'Codex Main', undefined, 'codex');
    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        url: 'http://localhost:4173/',
        history: ['http://localhost:4173/'],
      },
      cli: { profiles: [], runtime: { status: 'running' } },
    });
    appState.setProjectContext(project.id, {
      sources: [
        {
          id: 'shared:.calder/rules/testing.hard.md',
          provider: 'shared',
          scope: 'project',
          kind: 'rules',
          path: '/proj/.calder/rules/testing.hard.md',
          displayName: 'testing.hard.md',
          summary: 'Tests are required',
          lastUpdated: '2026-04-13T18:10:00.000Z',
          enabled: true,
          priority: 'hard',
        },
      ],
      sharedRuleCount: 1,
      providerSourceCount: 0,
      lastUpdated: '2026-04-13T18:10:00.000Z',
    });

    const result = await sendProjectReviewToSelectedSession(project.id, {
      path: '/proj/.calder/reviews/pr-42.md',
      relativePath: '.calder/reviews/pr-42.md',
      title: 'PR 42 Findings',
      contents: '# PR 42 Findings\n\nCrash risk in restore flow.\n',
    });

    expect(result).toEqual({ ok: true, targetSessionId: session?.id });
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      session?.id,
      expect.stringContaining('Active preview URL: http://localhost:4173/'),
    );
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      session?.id,
      expect.stringContaining('Project context:\nShared rules: testing.hard.md'),
    );
  });

  it('falls back to the latest preview history entry and reports delivery failure', async () => {
    mockDeliverPromptToTerminalSession.mockResolvedValue(false);

    const project = appState.addProject('Calder', '/proj');
    const session = appState.addSession(project.id, 'Codex Main', undefined, 'codex');
    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        history: ['http://localhost:4173/', 'http://localhost:4173/dashboard'],
      },
      cli: { profiles: [], runtime: { status: 'running' } },
    });

    const result = await sendProjectReviewToSelectedSession(project.id, {
      path: '/proj/.calder/reviews/pr-42.md',
      relativePath: '.calder/reviews/pr-42.md',
      title: 'PR 42 Findings',
      contents: '# PR 42 Findings\n\nCrash risk in restore flow.\n',
    });

    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      session?.id,
      expect.stringContaining('Active preview URL: http://localhost:4173/dashboard'),
    );
    expect(result).toEqual({
      ok: false,
      error: 'Failed to deliver review findings to the selected session.',
    });
  });

  it('sends review findings without preview URL when no web preview is available', async () => {
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const project = appState.addProject('Calder', '/proj');
    const session = appState.addSession(project.id, 'Codex Main', undefined, 'codex');
    appState.setProjectSurface(project.id, {
      kind: 'web',
      active: true,
      web: {
        history: [],
      },
      cli: { profiles: [], runtime: { status: 'running' } },
    });

    const result = await sendProjectReviewToSelectedSession(project.id, {
      path: '/proj/.calder/reviews/pr-43.md',
      relativePath: '.calder/reviews/pr-43.md',
      title: 'PR 43 Findings',
      contents: '# PR 43 Findings\n\nNo preview issues.\n',
    });

    expect(result).toEqual({ ok: true, targetSessionId: session?.id });
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      session?.id,
      expect.not.stringContaining('Active preview URL:'),
    );
  });

  it('returns an error when no selected cli session is available', async () => {
    const project = appState.addProject('Calder', '/proj');
    appState.addDiffViewerSession(project.id, 'src/app.ts', 'working');

    const result = await sendProjectReviewToSelectedSession(project.id, {
      path: '/proj/.calder/reviews/pr-42.md',
      relativePath: '.calder/reviews/pr-42.md',
      title: 'PR 42 Findings',
      contents: '# PR 42 Findings\n',
    });

    expect(result).toEqual({ ok: false, error: 'Open or select a CLI session first.' });
  });
});
