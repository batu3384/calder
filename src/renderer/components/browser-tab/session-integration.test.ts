import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveBrowserTargetSession = vi.fn();
const mockSetActiveSession = vi.fn();
const mockDeliverPromptToTerminalSession = vi.fn();
const mockDismissInspect = vi.fn();
const mockDismissFlow = vi.fn();

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: { id: 'project-1' },
    preferences: {},
    resolveBrowserTargetSession: mockResolveBrowserTargetSession,
    setActiveSession: mockSetActiveSession,
  },
}));

vi.mock('../../provider-availability.js', () => ({
  getProviderAvailabilitySnapshot: vi.fn(() => null),
  resolvePreferredProviderForLaunch: vi.fn(() => 'claude'),
}));

vi.mock('../tab-bar.js', () => ({
  promptNewSession: vi.fn(),
}));

vi.mock('../terminal-pane.js', () => ({
  deliverPromptToTerminalSession: mockDeliverPromptToTerminalSession,
  setPendingPrompt: vi.fn(),
}));

vi.mock('./inspect-mode.js', () => ({
  buildPrompt: vi.fn(() => 'inspect prompt'),
  dismissInspect: mockDismissInspect,
}));

vi.mock('./flow-recording.js', () => ({
  buildFlowPrompt: vi.fn(() => 'flow prompt'),
  dismissFlow: mockDismissFlow,
}));

function makeMessageEl() {
  return {
    textContent: '',
    style: { display: 'none' },
  };
}

function makeInstance() {
  return {
    sessionId: 'browser-1',
    selectedElement: { tagName: 'button' },
    instructionInput: { value: 'Inspect this' },
    inspectErrorEl: makeMessageEl(),
    flowInstructionInput: { value: 'Replay this flow' },
    flowErrorEl: makeMessageEl(),
  } as any;
}

describe('browser session integration errors', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows an inspect error when no target session is selected', async () => {
    const { sendToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockResolveBrowserTargetSession.mockReturnValue(undefined);

    await sendToSelectedSession(instance);

    expect(instance.inspectErrorEl.textContent).toBe('Select an open session target first.');
    expect(instance.inspectErrorEl.style.display).toBe('block');
    expect(mockDismissInspect).not.toHaveBeenCalled();
  });

  it('shows a flow error when delivery to the selected session fails', async () => {
    const { sendFlowToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-1', name: 'Session 1' });
    mockDeliverPromptToTerminalSession.mockResolvedValue(false);

    await sendFlowToSelectedSession(instance);

    expect(instance.flowErrorEl.textContent).toBe('Failed to deliver prompt to the selected session.');
    expect(instance.flowErrorEl.style.display).toBe('block');
    expect(mockDismissFlow).not.toHaveBeenCalled();
    expect(mockSetActiveSession).not.toHaveBeenCalled();
  });
});
