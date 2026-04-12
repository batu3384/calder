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
    preferences: { sidebarViews: { configSections: true } },
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
});
