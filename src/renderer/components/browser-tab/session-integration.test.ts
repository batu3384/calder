import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveBrowserTargetSession = vi.fn();
const mockDeliverSurfacePrompt = vi.fn();
const mockQueueSurfacePromptInNewSession = vi.fn();
const mockQueueSurfacePromptInCustomSession = vi.fn();
const mockDismissInspect = vi.fn();
const mockDismissFlow = vi.fn();

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: {
      id: 'project-1',
      projectContext: {
        sources: [
          {
            id: 'claude:memory:/tmp/demo/CLAUDE.md',
            provider: 'claude',
            scope: 'project',
            kind: 'memory',
            path: '/tmp/demo/CLAUDE.md',
            displayName: 'CLAUDE.md',
            summary: 'Claude repo guidance',
            lastUpdated: '2026-04-13T12:00:00.000Z',
          },
          {
            id: 'shared:rules:/tmp/demo/.calder/rules/testing.hard.md',
            provider: 'shared',
            scope: 'project',
            kind: 'rules',
            path: '/tmp/demo/.calder/rules/testing.hard.md',
            displayName: 'testing.hard.md',
            summary: 'Tests are required',
            lastUpdated: '2026-04-13T12:10:00.000Z',
            priority: 'hard',
          },
        ],
        sharedRuleCount: 1,
        providerSourceCount: 1,
        lastUpdated: '2026-04-13T12:10:00.000Z',
      },
    },
    preferences: { defaultProvider: 'claude' },
    resolveBrowserTargetSession: mockResolveBrowserTargetSession,
  },
}));

vi.mock('../surface-routing.js', () => ({
  deliverSurfacePrompt: mockDeliverSurfacePrompt,
  queueSurfacePromptInNewSession: mockQueueSurfacePromptInNewSession,
  queueSurfacePromptInCustomSession: mockQueueSurfacePromptInCustomSession,
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

  it('delivers inspect prompts to the selected session and focuses that session on success', async () => {
    const { sendToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: true, targetSessionId: 'cli-1' });
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-1', providerId: 'claude' });

    await sendToSelectedSession(instance);

    expect(mockDeliverSurfacePrompt).toHaveBeenCalledWith('project-1', expect.stringContaining('inspect prompt'));
    expect(mockDeliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Project context:'),
    );
    expect(mockDeliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Shared rules: testing.hard.md'),
    );
    expect(mockDismissInspect).toHaveBeenCalledTimes(1);
    expect(instance.inspectErrorEl.textContent).toBe('');
    expect(instance.inspectErrorEl.style.display).toBe('none');
  });

  it('shows an inspect error when no target session is selected', async () => {
    const { sendToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: false, error: 'Select an open session target first.' });

    await sendToSelectedSession(instance);

    expect(instance.inspectErrorEl.textContent).toBe('Select an open session target first.');
    expect(instance.inspectErrorEl.style.display).toBe('block');
    expect(mockDismissInspect).not.toHaveBeenCalled();
  });

  it('shows a flow error when delivery to the selected session fails', async () => {
    const { sendFlowToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: false, error: 'Failed to deliver prompt to the selected session.' });

    await sendFlowToSelectedSession(instance);

    expect(instance.flowErrorEl.textContent).toBe('Failed to deliver prompt to the selected session.');
    expect(instance.flowErrorEl.style.display).toBe('block');
    expect(mockDismissFlow).not.toHaveBeenCalled();
  });

  it('delivers flow prompts to the selected session and focuses that session on success', async () => {
    const { sendFlowToSelectedSession } = await import('./session-integration.js');
    const instance = makeInstance();
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: true, targetSessionId: 'cli-2' });

    await sendFlowToSelectedSession(instance);

    expect(mockDeliverSurfacePrompt).toHaveBeenCalledWith('project-1', 'flow prompt');
    expect(mockDismissFlow).toHaveBeenCalledTimes(1);
    expect(instance.flowErrorEl.textContent).toBe('');
    expect(instance.flowErrorEl.style.display).toBe('none');
  });
});
