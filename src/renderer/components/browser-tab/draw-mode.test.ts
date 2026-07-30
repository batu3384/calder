import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDeliverBrowserCapturePrompt = vi.fn();
const mockQueueSurfacePromptInNewSession = vi.fn();
const mockQueueSurfacePromptInCustomSession = vi.fn();
const mockResolveBrowserTargetSession = vi.fn();
const mockSaveScreenshot = vi.fn();
const mockGetProviderAvailabilitySnapshot = vi.fn(() => ({}));
const mockResolvePreferredProviderForLaunch = vi.fn(() => 'claude');
const mockAppendAppliedContextToPrompt = vi.fn((prompt: string) => prompt);
const mockBuildAppliedContextSummary = vi.fn(() => undefined);
const mockFormatAppliedContextTrace = vi.fn(() => []);

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: { id: 'project-1' },
    preferences: { defaultProvider: 'claude' },
    resolveBrowserTargetSession: mockResolveBrowserTargetSession,
  },
}));

vi.mock('../surface-services/provider-availability.js', () => ({
  getProviderAvailabilitySnapshot: mockGetProviderAvailabilitySnapshot,
  resolvePreferredProviderForLaunch: mockResolvePreferredProviderForLaunch,
}));

vi.mock('../../project-context-prompt.js', () => ({
  appendAppliedContextToPrompt: mockAppendAppliedContextToPrompt,
  buildAppliedContextSummary: mockBuildAppliedContextSummary,
  formatAppliedContextTrace: mockFormatAppliedContextTrace,
}));

vi.mock('../surface-routing.js', () => ({
  deliverBrowserCapturePrompt: mockDeliverBrowserCapturePrompt,
  queueSurfacePromptInNewSession: mockQueueSurfacePromptInNewSession,
  queueSurfacePromptInCustomSession: mockQueueSurfacePromptInCustomSession,
}));

vi.mock('./viewport.js', () => ({
  getViewportContext: vi.fn(() => ''),
}));

function makeMessageEl() {
  return {
    textContent: '',
    style: { display: 'none' },
  };
}

function makeInstance() {
  const capturePage = vi.fn(async () => ({ toDataURL: () => 'data:image/png;base64,AAAA' }));
  return {
    sessionId: 'browser-1',
    drawInstructionInput: { value: 'Fix this area' },
    drawAttachDimsCheckbox: { checked: false },
    drawErrorEl: makeMessageEl(),
    drawContextTraceEl: makeMessageEl(),
    urlInput: { value: 'https://example.com' },
    drawMode: false,
    drawPanel: { style: { display: 'none' } },
    inspectBtn: { disabled: false },
    recordBtn: { disabled: false },
    drawBtn: { classList: { toggle: vi.fn() } },
    syncToolbarState: vi.fn(),
    webview: { capturePage },
  } as any;
}

describe('draw mode session delivery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (globalThis as any).window = {
      calder: {
        browser: {
          saveScreenshot: mockSaveScreenshot,
        },
      },
    };
  });

  it('does not capture screenshots when no target session is selected', async () => {
    const { sendDrawToSelectedSession } = await import('./draw-mode.js');
    const instance = makeInstance();
    mockResolveBrowserTargetSession.mockReturnValue(null);

    await sendDrawToSelectedSession(instance);

    expect(instance.webview.capturePage).not.toHaveBeenCalled();
    expect(mockSaveScreenshot).not.toHaveBeenCalled();
    expect(mockDeliverBrowserCapturePrompt).not.toHaveBeenCalled();
    expect(instance.drawErrorEl.textContent).toBe('Select an open session target first.');
  });

  it('captures and routes screenshot prompts when a target session exists', async () => {
    const { sendDrawToSelectedSession } = await import('./draw-mode.js');
    const instance = makeInstance();
    mockResolveBrowserTargetSession.mockReturnValue({ id: 'cli-1', providerId: 'claude' });
    mockSaveScreenshot.mockResolvedValue('/tmp/capture.png');
    mockDeliverBrowserCapturePrompt.mockResolvedValue({ ok: true, targetSessionId: 'cli-1' });

    await sendDrawToSelectedSession(instance);

    expect(instance.webview.capturePage).toHaveBeenCalledTimes(1);
    expect(mockSaveScreenshot).toHaveBeenCalledTimes(1);
    expect(mockDeliverBrowserCapturePrompt).toHaveBeenCalledWith(
      'project-1',
      'browser-1',
      expect.stringContaining('See annotated screenshot: /tmp/capture.png'),
      {
        targetSessionId: 'cli-1',
        strictContract: false,
      },
    );
  });

  it('uses the resolved launch provider when queuing a new draw session', async () => {
    const { sendDrawToNewSession } = await import('./draw-mode.js');
    const instance = makeInstance();
    mockResolvePreferredProviderForLaunch.mockReturnValue('codex');
    mockSaveScreenshot.mockResolvedValue('/tmp/capture.png');
    mockQueueSurfacePromptInNewSession.mockReturnValue({ id: 'plan-1', providerId: 'codex' });

    await sendDrawToNewSession(instance);

    expect(mockResolvePreferredProviderForLaunch).toHaveBeenCalled();
    expect(mockBuildAppliedContextSummary).toHaveBeenCalledWith('project-1', 'codex');
    expect(mockQueueSurfacePromptInNewSession).toHaveBeenCalledWith(
      'project-1',
      expect.stringContaining('Draw:'),
      expect.stringContaining('See annotated screenshot: /tmp/capture.png'),
      'codex',
      { strictContract: false },
    );
  });
});
