import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveSurfaceTargetSession = vi.fn();
const mockResolveBrowserTargetSession = vi.fn();
const mockListSurfaceTargetSessions = vi.fn(() => []);
const mockSetBrowserTargetSession = vi.fn();
const mockSetActiveSession = vi.fn();
const mockAddPlanSession = vi.fn();
const mockDeliverPromptToTerminalSession = vi.fn();
const mockSetPendingPrompt = vi.fn();
const mockPromptNewSession = vi.fn();
const mockProjects: unknown[] = [];

vi.mock('../state.js', () => ({
  appState: {
    preferences: {},
    projects: mockProjects,
    resolveSurfaceTargetSession: mockResolveSurfaceTargetSession,
    resolveBrowserTargetSession: mockResolveBrowserTargetSession,
    listSurfaceTargetSessions: mockListSurfaceTargetSessions,
    setBrowserTargetSession: mockSetBrowserTargetSession,
    setActiveSession: mockSetActiveSession,
    addPlanSession: mockAddPlanSession,
  },
}));

vi.mock('./surface-services/provider-availability.js', () => ({
  getProviderAvailabilitySnapshot: vi.fn(() => null),
  resolvePreferredProviderForLaunch: vi.fn(() => 'claude'),
}));

vi.mock('./terminal-pane.js', () => ({
  deliverPromptToTerminalSession: mockDeliverPromptToTerminalSession,
  setPendingPrompt: mockSetPendingPrompt,
}));

vi.mock('./tab-bar/tab-bar.js', () => ({
  promptNewSession: mockPromptNewSession,
}));

describe('surface routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjects.length = 0;
  });

  it('keeps inspect capture delivery on the strict routing contract path', async () => {
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-inspect' });
    mockResolveSurfaceTargetSession.mockReturnValue(undefined);
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverBrowserCapturePrompt } = await import('./surface-routing.js');
    await deliverBrowserCapturePrompt('project-1', 'browser-1', 'fix this button');

    const routedPrompt = mockDeliverPromptToTerminalSession.mock.calls[0]?.[1] as string;
    expect(routedPrompt).toContain('Routing contract (strict):');
    expect(routedPrompt).toContain('fix this button');
  });

  it('delivers browser capture prompts via browser target resolution with active fallback', async () => {
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-2' });
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverBrowserCapturePrompt } = await import('./surface-routing.js');
    const result = await deliverBrowserCapturePrompt(
      'project-1',
      'browser-1',
      'inspect this footer',
    );

    expect(result).toEqual({ ok: true, targetSessionId: 'cli-2' });
    expect(mockResolveBrowserTargetSession).toHaveBeenCalledWith('browser-1');
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      'cli-2',
      expect.stringContaining('inspect this footer'),
    );
    expect(mockSetActiveSession).toHaveBeenCalledWith('project-1', 'cli-2');
    expect(mockSetBrowserTargetSession).toHaveBeenCalledWith('browser-1', 'cli-2');
  });

  it('seeds an explicit browser target when only active-session fallback was available', async () => {
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-active' });
    mockResolveSurfaceTargetSession.mockImplementation((_projectId, options) =>
      options?.requireExplicitTarget ? undefined : { id: 'cli-active' },
    );
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverBrowserCapturePrompt } = await import('./surface-routing.js');
    await deliverBrowserCapturePrompt('project-1', 'browser-1', 'inspect footer');

    expect(mockSetBrowserTargetSession).toHaveBeenCalledWith('browser-1', 'cli-active');
  });

  it('can skip the strict routing contract for draw-style capture prompts', async () => {
    mockListSurfaceTargetSessions.mockReturnValue([{ id: 'cli-1' }]);
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverBrowserCapturePrompt } = await import('./surface-routing.js');
    await deliverBrowserCapturePrompt('project-1', 'browser-1', 'annotate this page', {
      targetSessionId: 'cli-1',
      strictContract: false,
    });

    expect(mockResolveBrowserTargetSession).not.toHaveBeenCalled();
    const routedPrompt = mockDeliverPromptToTerminalSession.mock.calls[0]?.[1] as string;
    expect(routedPrompt).toContain('annotate this page');
    expect(routedPrompt).not.toContain('Routing contract (strict):');
  });

  it('delivers prompts to the selected surface target', async () => {
    mockResolveSurfaceTargetSession.mockReturnValue({ id: 'cli-1' });
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverSurfacePrompt } = await import('./surface-routing.js');
    const result = await deliverSurfacePrompt('project-1', 'inspect this footer');

    expect(result).toEqual({ ok: true, targetSessionId: 'cli-1' });
    expect(mockResolveSurfaceTargetSession).toHaveBeenCalledWith('project-1', {
      requireExplicitTarget: true,
    });
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      'cli-1',
      expect.stringContaining('Routing contract (strict):'),
    );
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      'cli-1',
      expect.stringContaining('inspect this footer'),
    );
    expect(mockSetActiveSession).toHaveBeenCalledWith('project-1', 'cli-1');
  });

  it('queues a new plan session when the caller asks for a new destination', async () => {
    mockAddPlanSession.mockReturnValue({ id: 'plan-1', name: 'Fix footer' });

    const { queueSurfacePromptInNewSession } = await import('./surface-routing.js');
    const session = queueSurfacePromptInNewSession(
      'project-1',
      'Fix footer',
      'inspect this footer',
    );

    expect(session).toEqual({ id: 'plan-1', name: 'Fix footer' });
    expect(mockAddPlanSession).toHaveBeenCalledWith('project-1', 'Fix footer', 'claude');
    expect(mockSetPendingPrompt).toHaveBeenCalledWith(
      'plan-1',
      expect.stringContaining('Routing contract (strict):'),
    );
    expect(mockSetPendingPrompt).toHaveBeenCalledWith(
      'plan-1',
      expect.stringContaining('inspect this footer'),
    );
  });

  it('respects an explicit provider override for new plan sessions', async () => {
    mockAddPlanSession.mockReturnValue({ id: 'plan-2', name: 'Fix footer' });

    const { queueSurfacePromptInNewSession } = await import('./surface-routing.js');
    queueSurfacePromptInNewSession('project-1', 'Fix footer', 'inspect this footer', 'codex');

    expect(mockAddPlanSession).toHaveBeenCalledWith('project-1', 'Fix footer', 'codex');
  });

  it('appends project governance policy to routed prompts', async () => {
    mockProjects.push({
      id: 'project-1',
      projectGovernance: {
        policy: {
          id: 'governance:/proj/.calder/governance/policy.json',
          path: '/proj/.calder/governance/policy.json',
          displayName: 'Project guardrails',
          summary: 'enforced · tools ask · writes ask · network block',
          lastUpdated: '2026-04-13T12:00:00.000Z',
          mode: 'enforced',
          toolPolicy: 'ask',
          writePolicy: 'ask',
          networkPolicy: 'block',
          mcpAllowlistCount: 1,
          providerProfileCount: 0,
        },
      },
    });
    mockResolveSurfaceTargetSession.mockReturnValue({ id: 'cli-1' });
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverSurfacePrompt } = await import('./surface-routing.js');
    await deliverSurfacePrompt('project-1', 'inspect this footer');

    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      'cli-1',
      expect.stringContaining('Project governance policy:'),
    );
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith(
      'cli-1',
      expect.stringContaining('Network policy: block'),
    );
  });
});
