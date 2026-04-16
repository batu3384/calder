import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const state = {
    activeProject: {
      id: 'p1',
      path: '/project',
      sessions: [] as Array<{ id: string; providerId?: 'claude' | 'codex'; type?: string }>,
    },
    activeSession: undefined as { id: string; providerId?: 'claude' | 'codex'; type?: string } | undefined,
  };
  return {
    ...state,
    on: vi.fn(() => () => {}),
    preferences: { sidebarViews: { configSections: true }, language: 'en' as 'en' | 'tr' },
  };
});

vi.mock('../state.js', () => ({
  appState: mockState,
}));

vi.mock('./mcp-add-modal.js', () => ({
  showMcpAddModal: vi.fn(),
}));

describe('getConfigProviderId', () => {
  beforeEach(() => {
    vi.resetModules();
    mockState.activeProject.sessions = [];
    mockState.activeSession = undefined;
    mockState.preferences.language = 'en';
  });

  it('uses the active CLI session provider', async () => {
    mockState.activeSession = { id: 's1', providerId: 'codex' };
    const { getConfigProviderId } = await import('./config-sections.js');
    expect(getConfigProviderId()).toBe('codex');
  });

  it('falls back to the most recent CLI session provider when active session is not CLI', async () => {
    mockState.activeSession = { id: 's2', type: 'diff-viewer' };
    mockState.activeProject.sessions = [
      { id: 's1', providerId: 'claude' },
      { id: 's2', type: 'diff-viewer' },
      { id: 's3', providerId: 'codex' },
    ];
    const { getConfigProviderId } = await import('./config-sections.js');
    expect(getConfigProviderId()).toBe('codex');
  });

  it('defaults to claude when there is no CLI session', async () => {
    mockState.activeProject.sessions = [{ id: 's1', type: 'diff-viewer' }];
    const { getConfigProviderId } = await import('./config-sections.js');
    expect(getConfigProviderId()).toBe('claude');
  });

  it('renders scope badges as cockpit control chips', async () => {
    const mod = await import('./config-sections.js');
    expect(typeof mod.scopeBadge).toBe('function');
    expect(mod.scopeBadge('project')).toContain('control-chip');
    expect(mod.scopeBadge('user')).toContain('scope-badge');
  });

  it('describes integrations as MCP servers instead of a vague integrations bucket', async () => {
    const source = await import('node:fs/promises')
      .then(fs => fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'));

    expect(source).toContain("'MCP Servers'");
    expect(source).toContain('Model Context Protocol');
    expect(source).not.toContain("'Integrations'");
  });

  it('renders toolchain rows with the shared Calder list-row primitive', async () => {
    const source = await import('node:fs/promises')
      .then(fs => fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'));

    expect(source).toContain("el.className = 'config-item config-item-clickable calder-list-row'");
  });

  it('includes an auto-approval control block wired to governance APIs', async () => {
    const source = await import('node:fs/promises')
      .then(fs => fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'));

    expect(source).toContain("'Auto Approval'");
    expect(source).toContain('setAutoApprovalMode');
    expect(source).toContain('setSessionAutoApprovalOverride');
    expect(source).toContain('auto-approval-control');
    expect(source).toContain('Full Auto (All)');
    expect(source).toContain('Session policy is temporary and takes priority');
    expect(source).toContain('Mode Guide');
    expect(source).toContain('auto-approval-mode-guide-toggle');
  });

  it('shows inherit state for project scope instead of mirroring global mode', async () => {
    const source = await import('node:fs/promises')
      .then(fs => fs.readFile(new URL('./config-sections.ts', import.meta.url), 'utf-8'));

    expect(source).toContain('Use Global Default');
    expect(source).toContain('Use Project / Global Default');
    expect(source).toContain('Global Default');
    expect(source).toContain('Project Policy');
    expect(source).toContain('Session Policy');
    expect(source).toContain('Effective Mode');
    expect(source).toContain('PROJECT_INHERIT_VALUE');
    expect(source).toContain('SESSION_INHERIT_VALUE');
    expect(source).toContain('projectSelect.value === PROJECT_INHERIT_VALUE');
    expect(source).toContain('sessionSelect.value === SESSION_INHERIT_VALUE');
  });

  it('derives human-readable auto-approval scope state', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'edit_only',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'edit_only',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Edit Only');
    expect(summary.project).toBe('Use Global Default');
    expect(summary.session).toBe('Use Project / Global Default');
    expect(summary.effectiveSource).toBe('Global default');
    expect(summary.effectiveExplanation).toBe('Project and Session follow higher scope, so Global setting applies.');
    expect(summary.effectiveBehavior).toBe('Auto-approves file edits only.');
  });

  it('describes effective scope when session override is active', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'edit_only',
      projectMode: 'off',
      sessionMode: 'edit_plus_safe_tools',
      effectiveMode: 'edit_plus_safe_tools',
      policySource: 'session',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Edit Only');
    expect(summary.project).toBe('Off');
    expect(summary.session).toBe('Edit + Safe Tools');
    expect(summary.effectiveSource).toBe('Session override');
    expect(summary.effectiveExplanation).toBe('Session override is active, so Session setting applies.');
    expect(summary.effectiveBehavior).toBe('Auto-approves file edits and safe read-only commands.');
  });

  it('shows fallback explanation when nothing is explicitly configured', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'off',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'off',
      policySource: 'fallback',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.effectiveSource).toBe('Fallback default');
    expect(summary.effectiveExplanation).toBe('No explicit setting found; fallback Off applies.');
    expect(summary.effectiveBehavior).toBe('Always asks for approval before actions.');
  });

  it('describes full_auto behavior clearly', async () => {
    const { describeAutoApprovalScopes } = await import('./config-sections.js');
    const summary = describeAutoApprovalScopes({
      globalMode: 'full_auto',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'full_auto',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    });

    expect(summary.global).toBe('Full Auto (All)');
    expect(summary.effectiveBehavior).toBe('Auto-approves every operation, including risky and destructive actions.');
  });

  it('renders concise Turkish metadata summaries for right-rail skills and commands', async () => {
    mockState.preferences.language = 'tr';
    const { localizeConfigMetadataDetail } = await import('./config-sections.js');

    expect(
      localizeConfigMetadataDetail(
        'skill',
        'using-superpowers',
        'Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions',
      ),
    ).toBe('Konuşma başında doğru beceri ve süper güç akışını başlatır.');

    expect(
      localizeConfigMetadataDetail(
        'command',
        'commit',
        'Create well-formatted commits with conventional commit messages',
      ),
    ).toBe('Düzenli commit mesajlarıyla temiz commit oluşturur.');

    expect(
      localizeConfigMetadataDetail('skill', 'unknown-skill', 'Keep original detail'),
    ).toBe('Keep original detail');
  });
});
