import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const state = {
    activeProject: {
      id: 'p1',
      path: '/project',
      sessions: [] as Array<{ id: string; providerId?: 'claude' | 'codex'; type?: string }>,
    },
    activeSession: undefined as
      | { id: string; providerId?: 'claude' | 'codex'; type?: string }
      | undefined,
  };
  return {
    ...state,
    on: vi.fn(() => () => {}),
    preferences: { sidebarViews: { configSections: true }, language: 'en' as 'en' | 'tr' },
  };
});

vi.mock('../../state.js', () => ({
  appState: mockState,
}));

describe('getActiveCliProviderId', () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.activeProject.sessions = [];
    mockState.activeSession = undefined;
    mockState.preferences.language = 'en';
  });

  it('uses the active CLI session provider', async () => {
    mockState.activeSession = { id: 's1', providerId: 'codex' };
    const { getActiveCliProviderId } = await import('./config-sections.js');
    expect(getActiveCliProviderId()).toBe('codex');
  });

  it('falls back to the most recent CLI session provider when active session is not CLI', async () => {
    mockState.activeSession = { id: 's2', type: 'diff-viewer' };
    mockState.activeProject.sessions = [
      { id: 's1', providerId: 'claude' },
      { id: 's2', type: 'diff-viewer' },
      { id: 's3', providerId: 'codex' },
    ];
    const { getActiveCliProviderId } = await import('./config-sections.js');
    expect(getActiveCliProviderId()).toBe('codex');
  });

  it('defaults to claude when there is no CLI session', async () => {
    mockState.activeProject.sessions = [{ id: 's1', type: 'diff-viewer' }];
    const { getActiveCliProviderId } = await import('./config-sections.js');
    expect(getActiveCliProviderId()).toBe('claude');
  });

  it('no longer renders the MCP/agents/skills/commands toolchain list', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'),
    );

    expect(source).not.toContain("'MCP Servers'");
    expect(source).not.toContain("'Integrations'");
    expect(source).not.toContain('mcpItem');
    expect(source).not.toContain('agentItem');
    expect(source).not.toContain('skillItem');
    expect(source).not.toContain('commandItem');
    expect(source).not.toContain('provider.getConfig');
    expect(source).not.toContain('watchProject');
    expect(source).not.toContain('onConfigChanged');
  });

  it('includes an auto-approval control block wired to governance APIs', async () => {
    const source = await import('node:fs/promises').then(async (fs) => {
      const [configSections, autoApprovalSection, autoApprovalHelpers] = await Promise.all([
        fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'),
        fs.readFile(new URL('./config-sections-auto-approval.ts', import.meta.url), 'utf-8'),
        fs.readFile(
          new URL('./config-sections-auto-approval-controls-helpers.ts', import.meta.url),
          'utf-8',
        ),
      ]);
      return `${configSections}\n${autoApprovalSection}\n${autoApprovalHelpers}`;
    });

    expect(source).toContain("'Auto Approval'");
    expect(source).toContain('setAutoApprovalMode');
    expect(source).toContain('setSessionAutoApprovalOverride');
    expect(source).toContain('auto-approval-select');
    expect(source).toContain('auto-approval-panel');
    expect(source).toContain('host: item');
  });

  it('keeps inherit markers for governance cascade', async () => {
    const source = await import('node:fs/promises').then(async (fs) => {
      const helpers = await fs.readFile(
        new URL('./config-sections-auto-approval-controls-helpers.ts', import.meta.url),
        'utf-8',
      );
      return helpers;
    });

    expect(source).toContain('PROJECT_INHERIT_VALUE');
    expect(source).toContain('SESSION_INHERIT_VALUE');
  });

  it('derives human-readable auto-approval scope state', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'project_edits',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'project_edits',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Auto-approve file edits');
    expect(summary.project).toBe('Follow global default');
    expect(summary.session).toBe('Follow project default');
    expect(summary.effectiveSource).toBe('Global default');
    expect(summary.effectiveExplanation).toBe(
      'Project and Session follow higher scope, so Global setting applies.',
    );
    expect(summary.effectiveBehavior).toBe(
      'Auto-approves in-project file edits only; asks for commands and outside paths.',
    );
    expect(summary.effectiveAutoRuns).toBe('In-project file edits.');
    expect(summary.effectiveStillAsks).toBe(
      'Commands, outside paths, home/global, destructive actions.',
    );
  });

  it('describes effective scope when session override is active', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'project_edits',
      projectMode: 'ask',
      sessionMode: 'session_safe',
      effectiveMode: 'session_safe',
      policySource: 'session',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Auto-approve file edits');
    expect(summary.project).toBe('Ask every time');
    expect(summary.session).toBe('Auto-approve safe actions');
    expect(summary.effectiveSource).toBe('Session override');
    expect(summary.effectiveExplanation).toBe(
      'Session override is active, so Session setting applies.',
    );
    expect(summary.effectiveBehavior).toBe(
      'This session: auto-approve project edits and read-only tools; asks for destructive/unknown.',
    );
    expect(summary.effectiveAutoRuns).toBe(
      'Project edits and safe read-only commands (this session only).',
    );
    expect(summary.effectiveStillAsks).toBe(
      'Write, risky, destructive commands and outside-project paths.',
    );
  });

  it('shows fallback explanation when nothing is explicitly configured', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'ask',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'ask',
      policySource: 'fallback',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.effectiveSource).toBe('Fallback default');
    expect(summary.effectiveExplanation).toBe(
      'No explicit setting found; fallback Ask every time applies.',
    );
    expect(summary.effectiveBehavior).toBe(
      'Asks on every permission request. Calder never changes other CLI settings.',
    );
    expect(summary.effectiveAutoRuns).toBe('Nothing.');
    expect(summary.effectiveStillAsks).toBe('Every edit, command, and tool run.');
  });

  it('describes ask behavior clearly', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'ask',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'ask',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Ask every time');
    expect(summary.effectiveBehavior).toBe(
      'Asks on every permission request. Calder never changes other CLI settings.',
    );
    expect(summary.effectiveAutoRuns).toBe('Nothing.');
    expect(summary.effectiveStillAsks).toBe('Every edit, command, and tool run.');
  });
});
