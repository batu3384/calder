import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MobileSurfaceInspectState, MobileSurfacePaneInstance } from './types.js';

const mockResolveSurfaceTargetSession = vi.fn();
const mockBuildAppliedContextSummary = vi.fn();
const mockFormatAppliedContextTrace = vi.fn();
const mockAppendAppliedContextToPrompt = vi.fn();
const mockDeliverSurfacePrompt = vi.fn();
const mockRenderMobileInspectWorkbench = vi.fn();

vi.mock('../../state.js', () => ({
  appState: {
    resolveSurfaceTargetSession: (...args: unknown[]) => mockResolveSurfaceTargetSession(...args),
  },
}));

vi.mock('../../project-context-prompt.js', () => ({
  buildAppliedContextSummary: (...args: unknown[]) => mockBuildAppliedContextSummary(...args),
  formatAppliedContextTrace: (...args: unknown[]) => mockFormatAppliedContextTrace(...args),
  appendAppliedContextToPrompt: (...args: unknown[]) => mockAppendAppliedContextToPrompt(...args),
}));

vi.mock('../surface-routing.js', () => ({
  deliverSurfacePrompt: (...args: unknown[]) => mockDeliverSurfacePrompt(...args),
}));

vi.mock('./inspect-workbench.js', () => ({
  renderMobileInspectWorkbench: (...args: unknown[]) => mockRenderMobileInspectWorkbench(...args),
}));

import { renderInspectWorkbench, sendInspectToSelectedSession } from './pane.js';

function createInspectState(
  overrides: Partial<MobileSurfaceInspectState> = {},
): MobileSurfaceInspectState {
  return {
    platform: 'ios',
    launching: false,
    capturing: false,
    inspectingPoint: false,
    interacting: false,
    pointInspectToken: 0,
    liveMode: false,
    liveIntervalMs: 1200,
    liveLoopToken: 0,
    liveTimer: null,
    liveFrames: 0,
    liveLastFrameAt: null,
    message: '',
    tone: 'default',
    screenshot: null,
    selectedPoint: null,
    selectedElement: null,
    instruction: '',
    sendError: '',
    contextTrace: [],
    ...overrides,
  };
}

function createInstance(
  overrides: Partial<MobileSurfacePaneInstance> = {},
): MobileSurfacePaneInstance {
  return {
    projectId: 'project-1',
    el: {} as HTMLDivElement,
    statusEl: {} as HTMLDivElement,
    summaryEl: {} as HTMLDivElement,
    progressEl: {} as HTMLDivElement,
    bodyEl: {
      querySelector: () => null,
      prepend: () => {},
    } as unknown as HTMLDivElement,
    refreshBtn: { disabled: false } as HTMLButtonElement,
    loadToken: 0,
    loading: false,
    installState: null,
    lastReport: null,
    lastRefreshedAtMs: 0,
    inspectState: createInspectState(),
    projectProfile: 'unknown',
    autoDetectedPlatform: null,
    ...overrides,
  };
}

describe('mobile surface pane runtime handlers', () => {
  beforeEach(() => {
    mockResolveSurfaceTargetSession.mockReset();
    mockBuildAppliedContextSummary.mockReset();
    mockFormatAppliedContextTrace.mockReset();
    mockAppendAppliedContextToPrompt.mockReset();
    mockDeliverSurfacePrompt.mockReset();
    mockRenderMobileInspectWorkbench.mockReset();

    mockBuildAppliedContextSummary.mockReturnValue(undefined);
    mockFormatAppliedContextTrace.mockReturnValue(['No provider memory or shared rules applied.']);
    mockAppendAppliedContextToPrompt.mockImplementation((prompt: string) => prompt);
  });

  it('sets a user-facing validation error when inspect prompt inputs are incomplete', async () => {
    const instance = createInstance();
    await sendInspectToSelectedSession(instance);
    expect(instance.inspectState.sendError).toBe('Capture a simulator frame first.');
  });

  it('shows a target-selection error when no explicit surface target exists', async () => {
    const instance = createInstance({
      inspectState: createInspectState({
        screenshot: {
          platform: 'ios',
          success: true,
          message: 'ok',
          dataUrl: 'data:image/png;base64,AA==',
        },
        selectedPoint: { x: 12, y: 34, normalizedX: 0.1, normalizedY: 0.2 },
        instruction: 'Tap here and report result',
      }),
    });
    mockResolveSurfaceTargetSession.mockReturnValue(null);

    await sendInspectToSelectedSession(instance);

    expect(instance.inspectState.sendError).toBe('Select an open session target first.');
    expect(mockResolveSurfaceTargetSession).toHaveBeenCalledWith('project-1', {
      requireExplicitTarget: true,
    });
  });

  it('stores delivery failures from the routed prompt path', async () => {
    const instance = createInstance({
      inspectState: createInspectState({
        screenshot: {
          platform: 'ios',
          success: true,
          message: 'ok',
          dataUrl: 'data:image/png;base64,AA==',
        },
        selectedPoint: { x: 64, y: 96, normalizedX: 0.4, normalizedY: 0.6 },
        instruction: 'Open this control',
      }),
    });
    mockResolveSurfaceTargetSession.mockReturnValue({
      id: 'session-1',
      name: 'Codex Main',
      providerId: 'codex',
    });
    mockBuildAppliedContextSummary.mockReturnValue({ sources: [] });
    mockFormatAppliedContextTrace.mockReturnValue(['trace-line']);
    mockAppendAppliedContextToPrompt.mockImplementation((prompt: string) => `${prompt}\ncontext`);
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: false, error: 'delivery failed' });

    await sendInspectToSelectedSession(instance);

    expect(instance.inspectState.contextTrace).toEqual(['trace-line']);
    expect(instance.inspectState.sendError).toBe('delivery failed');
    expect(mockDeliverSurfacePrompt).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('context'),
    );
  });

  it('updates inspect status when prompt delivery succeeds', async () => {
    const instance = createInstance({
      inspectState: createInspectState({
        screenshot: {
          platform: 'ios',
          success: true,
          message: 'ok',
          dataUrl: 'data:image/png;base64,AA==',
        },
        selectedPoint: { x: 128, y: 256, normalizedX: 0.5, normalizedY: 0.5 },
        instruction: 'Tap the highlighted row',
      }),
    });
    mockResolveSurfaceTargetSession.mockReturnValue({
      id: 'session-2',
      name: 'Codex Main',
      providerId: undefined,
    });
    mockBuildAppliedContextSummary.mockReturnValue(undefined);
    mockFormatAppliedContextTrace.mockReturnValue(['No provider memory or shared rules applied.']);
    mockDeliverSurfacePrompt.mockResolvedValue({ ok: true, targetSessionId: 'session-2' });

    await sendInspectToSelectedSession(instance);

    expect(mockBuildAppliedContextSummary).toHaveBeenCalledWith('project-1', 'claude');
    expect(instance.inspectState.sendError).toBe('');
    expect(instance.inspectState.tone).toBe('success');
    expect(instance.inspectState.message).toBe('Prompt sent to Codex Main.');
  });

  it('delegates render orchestration to the shared inspect workbench module', () => {
    const section = {
      className: 'mobile-surface-group mobile-surface-inspect-group',
    } as unknown as HTMLElement;
    mockRenderMobileInspectWorkbench.mockReturnValue(section);
    const instance = createInstance();
    const report = { checks: [], summary: { ready: 0, warnings: 0, requiredMissing: 0 } } as any;

    const rendered = renderInspectWorkbench(instance, report);

    expect(rendered).toBe(section);
    expect(mockRenderMobileInspectWorkbench).toHaveBeenCalledWith(
      expect.objectContaining({
        instance,
        report,
        platformLabels: expect.objectContaining({
          ios: 'iOS Simulator',
          android: 'Android Emulator',
        }),
        handlers: expect.objectContaining({
          sendInspectToSelectedSession: expect.any(Function),
        }),
      }),
    );
  });
});
