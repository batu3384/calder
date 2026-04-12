import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveSurfaceTargetSession = vi.fn();
const mockSetActiveSession = vi.fn();
const mockAddPlanSession = vi.fn();
const mockDeliverPromptToTerminalSession = vi.fn();
const mockSetPendingPrompt = vi.fn();
const mockPromptNewSession = vi.fn();

vi.mock('../state.js', () => ({
  appState: {
    preferences: {},
    resolveSurfaceTargetSession: mockResolveSurfaceTargetSession,
    setActiveSession: mockSetActiveSession,
    addPlanSession: mockAddPlanSession,
  },
}));

vi.mock('../provider-availability.js', () => ({
  getProviderAvailabilitySnapshot: vi.fn(() => null),
  resolvePreferredProviderForLaunch: vi.fn(() => 'claude'),
}));

vi.mock('./terminal-pane.js', () => ({
  deliverPromptToTerminalSession: mockDeliverPromptToTerminalSession,
  setPendingPrompt: mockSetPendingPrompt,
}));

vi.mock('./tab-bar.js', () => ({
  promptNewSession: mockPromptNewSession,
}));

describe('surface routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers prompts to the selected surface target', async () => {
    mockResolveSurfaceTargetSession.mockReturnValue({ id: 'cli-1' });
    mockDeliverPromptToTerminalSession.mockResolvedValue(true);

    const { deliverSurfacePrompt } = await import('./surface-routing.js');
    const result = await deliverSurfacePrompt('project-1', 'inspect this footer');

    expect(result).toEqual({ ok: true, targetSessionId: 'cli-1' });
    expect(mockDeliverPromptToTerminalSession).toHaveBeenCalledWith('cli-1', 'inspect this footer');
    expect(mockSetActiveSession).toHaveBeenCalledWith('project-1', 'cli-1');
  });

  it('queues a new plan session when the caller asks for a new destination', async () => {
    mockAddPlanSession.mockReturnValue({ id: 'plan-1', name: 'Fix footer' });

    const { queueSurfacePromptInNewSession } = await import('./surface-routing.js');
    const session = queueSurfacePromptInNewSession('project-1', 'Fix footer', 'inspect this footer');

    expect(session).toEqual({ id: 'plan-1', name: 'Fix footer' });
    expect(mockAddPlanSession).toHaveBeenCalledWith('project-1', 'Fix footer', 'claude');
    expect(mockSetPendingPrompt).toHaveBeenCalledWith('plan-1', 'inspect this footer');
  });
});
