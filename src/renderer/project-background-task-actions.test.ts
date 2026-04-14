import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLoad,
  mockSave,
  mockDeliverPromptToTerminalSession,
  mockSetPendingPrompt,
} = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockSave: vi.fn(),
  mockDeliverPromptToTerminalSession: vi.fn(),
  mockSetPendingPrompt: vi.fn(),
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
  setPendingPrompt: mockSetPendingPrompt,
}));

import { appState, _resetForTesting } from './state.js';
import { buildProjectBackgroundTaskPrompt, resumeProjectBackgroundTaskInNewSession, sendProjectBackgroundTaskToSelectedSession } from './project-background-task-actions.js';

describe('project background task actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
  });

  it('builds a takeover prompt for queued local tasks', () => {
    const prompt = buildProjectBackgroundTaskPrompt({
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'queued',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: ['dist/report.md'],
      handoff: 'Start from accessibility risks.',
    });

    expect(prompt).toContain('Take over this queued Calder background task.');
    expect(prompt).toContain('Task: Review UI');
    expect(prompt).toContain('Source: .calder/tasks/review-ui.json');
    expect(prompt).toContain('Check the modal.');
    expect(prompt).toContain('Start from accessibility risks.');
  });

  it('sends a queued task to the selected cli session with project governance', async () => {
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);
    const project = appState.addProject('Calder', '/proj');
    const session = appState.addSession(project.id, 'Codex Main', undefined, 'codex');
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

    const result = await sendProjectBackgroundTaskToSelectedSession(project.id, {
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'queued',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: [],
      handoff: '',
    });

    expect(result).toEqual({ ok: true, targetSessionId: session?.id });
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      session?.id,
      expect.stringContaining('Project governance policy:'),
    );
  });

  it('returns an error when no selected cli session is available', async () => {
    const project = appState.addProject('Calder', '/proj');
    appState.addDiffViewerSession(project.id, 'src/app.ts', 'working');

    const result = await sendProjectBackgroundTaskToSelectedSession(project.id, {
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'queued',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: [],
      handoff: '',
    });

    expect(result).toEqual({ ok: false, error: 'Open or select a CLI session first.' });
  });

  it('returns an error when prompt delivery to the selected session fails', async () => {
    mockDeliverPromptToTerminalSession.mockResolvedValue(false);
    const project = appState.addProject('Calder', '/proj');
    appState.addSession(project.id, 'Codex Main', undefined, 'codex');

    const result = await sendProjectBackgroundTaskToSelectedSession(project.id, {
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'queued',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: [],
      handoff: '',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Failed to deliver background task to the selected session.',
    });
  });

  it('resumes a background task in a new plan session with team context and governance', async () => {
    const project = appState.addProject('Calder', '/proj');
    appState.setProjectTeamContext(project.id, {
      spaces: [
        {
          id: 'team-context:/proj/.calder/team/spaces/frontend.md',
          path: '/proj/.calder/team/spaces/frontend.md',
          displayName: 'frontend.md',
          summary: 'Frontend Agreements',
          lastUpdated: '2026-04-13T20:00:00.000Z',
          linkedRuleCount: 1,
          linkedWorkflowCount: 1,
        },
      ],
      sharedRuleCount: 1,
      workflowCount: 1,
    });
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

    const result = resumeProjectBackgroundTaskInNewSession(project.id, {
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'running',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: ['dist/report.md'],
      handoff: 'Pick up from the accessibility pass.',
    });

    expect(result.ok).toBe(true);
    expect(result.targetSessionId).toBeTruthy();
    expect(mockSetPendingPrompt).toHaveBeenCalledWith(
      result.targetSessionId,
      expect.stringContaining('Team context:'),
    );
    expect(mockSetPendingPrompt).toHaveBeenCalledWith(
      result.targetSessionId,
      expect.stringContaining('Project governance policy:'),
    );
  });

  it('returns an error when a new plan session cannot be created', () => {
    const result = resumeProjectBackgroundTaskInNewSession('missing-project', {
      path: '/proj/.calder/tasks/review-ui.json',
      relativePath: '.calder/tasks/review-ui.json',
      title: 'Review UI',
      status: 'running',
      prompt: 'Check the modal.',
      createdAt: '2026-04-13T20:00:00.000Z',
      updatedAt: '2026-04-13T20:00:00.000Z',
      artifacts: [],
      handoff: '',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Unable to create a new CLI session for this task.',
    });
  });
});
