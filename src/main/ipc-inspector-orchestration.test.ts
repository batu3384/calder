import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockOpenExternal = vi.hoisted(() => vi.fn());
const mockSetInspectorEventsMiddleware = vi.hoisted(() => vi.fn());
const mockCreateAutoApprovalOrchestrator = vi.hoisted(() => vi.fn());
const mockResolveAutoApprovalInput = vi.hoisted(() => vi.fn());
const mockApplySessionOverrideToGovernanceState = vi.hoisted(() => vi.fn());
const mockDiscoverProjectGovernance = vi.hoisted(() => vi.fn());
const mockWritePty = vi.hoisted(() => vi.fn());
const mockAppendAutoApprovalAudit = vi.hoisted(() => vi.fn());
const mockExtractPlaywrightNavigateUrlsFromTerminalChunk = vi.hoisted(() => vi.fn());
const mockShouldMirrorPlaywrightNavigate = vi.hoisted(() => vi.fn());
const mockShouldMirrorPlaywrightNavigateUrl = vi.hoisted(() => vi.fn());
const mockOpenUrlWithBrowserPolicy = vi.hoisted(() => vi.fn());
const mockBuildMiniMaxToolCallRecoveryPrompt = vi.hoisted(() => vi.fn());
const mockShouldTriggerMiniMaxToolCallRecovery = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  shell: {
    openExternal: mockOpenExternal,
  },
}));

vi.mock('./hooks/hook-status', () => ({
  setInspectorEventsMiddleware: mockSetInspectorEventsMiddleware,
}));

vi.mock('./calder-governance/auto-approval-orchestrator', () => ({
  createAutoApprovalOrchestrator: mockCreateAutoApprovalOrchestrator,
}));

vi.mock('./calder-governance/auto-approval-dispatch', () => ({
  resolveAutoApprovalInput: mockResolveAutoApprovalInput,
}));

vi.mock('./ipc-auto-approval-governance', () => ({
  applySessionOverrideToGovernanceState: mockApplySessionOverrideToGovernanceState,
}));

vi.mock('./calder-governance/discovery', () => ({
  discoverProjectGovernance: mockDiscoverProjectGovernance,
}));

vi.mock('./pty-manager', () => ({
  writePty: mockWritePty,
}));

vi.mock('./ipc-playwright-mirror', () => ({
  PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS: 500,
  appendAutoApprovalAudit: mockAppendAutoApprovalAudit,
  extractPlaywrightNavigateUrlsFromTerminalChunk:
    mockExtractPlaywrightNavigateUrlsFromTerminalChunk,
  shouldMirrorPlaywrightNavigate: mockShouldMirrorPlaywrightNavigate,
  shouldMirrorPlaywrightNavigateUrl: mockShouldMirrorPlaywrightNavigateUrl,
}));

vi.mock('./browser-open-policy', () => ({
  openUrlWithBrowserPolicy: mockOpenUrlWithBrowserPolicy,
}));

vi.mock('./minimax-toolcall-recovery', () => ({
  buildMiniMaxToolCallRecoveryPrompt: mockBuildMiniMaxToolCallRecoveryPrompt,
  shouldTriggerMiniMaxToolCallRecovery: mockShouldTriggerMiniMaxToolCallRecovery,
}));

import {
  clearInspectorOrchestrationSession,
  createInspectorOrchestration,
  resetInspectorOrchestrationCaches,
} from './ipc-inspector-orchestration';

function createWindowMock() {
  return {
    isDestroyed: () => false,
    webContents: {
      send: vi.fn(),
    },
  };
}

describe('ipc inspector orchestration runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInspectorOrchestrationCaches();
    mockResolveAutoApprovalInput.mockReturnValue('y');
    mockWritePty.mockReturnValue(true);
    mockOpenUrlWithBrowserPolicy.mockResolvedValue({ ok: true });
    mockExtractPlaywrightNavigateUrlsFromTerminalChunk.mockReturnValue([]);
    mockShouldMirrorPlaywrightNavigate.mockReturnValue(null);
    mockShouldMirrorPlaywrightNavigateUrl.mockReturnValue(false);
    mockShouldTriggerMiniMaxToolCallRecovery.mockReturnValue(false);
    mockBuildMiniMaxToolCallRecoveryPrompt.mockReturnValue('recover');
    mockApplySessionOverrideToGovernanceState.mockImplementation((state: unknown) => state);
    mockDiscoverProjectGovernance.mockResolvedValue({
      autoApproval: {
        globalMode: 'off',
        projectMode: null,
        effectiveMode: 'off',
        policySource: 'global',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    });
  });

  it('wires sendApproval and emitInspectorEvents through orchestrator callbacks', () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => undefined),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    const win = createWindowMock();
    mockGetAllWindows.mockReturnValue([win]);

    createInspectorOrchestration();
    const options = mockCreateAutoApprovalOrchestrator.mock.calls[0]?.[0] as {
      sendApproval: (sessionId: string, providerId: string) => void;
      emitInspectorEvents: (sessionId: string, events: unknown[]) => void;
    };

    options.sendApproval('session-1', 'codex');
    expect(mockResolveAutoApprovalInput).toHaveBeenCalledWith('codex');
    expect(mockWritePty).toHaveBeenCalledWith('session-1', 'y');

    mockWritePty.mockReturnValueOnce(false);
    expect(() => options.sendApproval('session-1', 'codex')).toThrow(
      'Failed to write approval input: missing PTY session (session-1).',
    );

    const events = [{ type: 'status_update', timestamp: Date.now(), message: 'ok' }];
    options.emitInspectorEvents('session-1', events);
    expect(mockAppendAutoApprovalAudit).toHaveBeenCalledWith('session-1', events);
    expect(win.webContents.send).toHaveBeenCalledWith(
      'session:inspectorEvents',
      'session-1',
      events,
    );
  });

  it('routes middleware through auto-approval orchestrator and mirrors Playwright inspector events', () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => undefined),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    const win = createWindowMock();
    mockGetAllWindows.mockReturnValue([win]);
    mockShouldMirrorPlaywrightNavigate.mockReturnValue({
      url: 'https://example.com',
      cwd: '/repo',
      sessionId: 'session-2',
    });

    createInspectorOrchestration();
    const middleware = mockSetInspectorEventsMiddleware.mock.calls[0]?.[0] as (
      sessionId: string,
      events: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
    const inputEvents = [{ type: 'status_update', timestamp: Date.now() }];
    const result = middleware('session-2', inputEvents);

    expect(orchestrator.handleInspectorEvents).toHaveBeenCalledWith('session-2', inputEvents);
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledWith(
      {
        url: 'https://example.com',
        cwd: '/repo',
        sessionId: 'session-2',
        preferEmbedded: true,
      },
      win,
      expect.any(Function),
    );
    expect(result).toHaveLength(2);
    expect(result[1]?.hookEvent).toBe('PlaywrightMirror');
  });

  it('triggers MiniMax recovery prompt on stop events and appends status updates', () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => undefined),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    mockShouldTriggerMiniMaxToolCallRecovery.mockReturnValue(true);
    mockBuildMiniMaxToolCallRecoveryPrompt.mockReturnValue('recover prompt');
    mockGetAllWindows.mockReturnValue([createWindowMock()]);

    createInspectorOrchestration();
    const middleware = mockSetInspectorEventsMiddleware.mock.calls[0]?.[0] as (
      sessionId: string,
      events: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>;
    const result = middleware('session-3', [
      { type: 'stop', last_assistant_message: '<tool_call>' },
    ]);

    expect(mockWritePty).toHaveBeenCalledWith('session-3', 'recover prompt\n');
    expect(result).toHaveLength(2);
    expect(result[1]?.hookEvent).toBe('MiniMaxToolCallRecovery');
  });

  it('derives governance state from project discovery and session override', async () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => 'edit_only'),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    const discovered = {
      autoApproval: {
        globalMode: 'off',
        projectMode: null,
        effectiveMode: 'off',
        policySource: 'global',
        safeToolProfile: 'default-read-only',
        recentDecisions: [],
      },
    };
    const merged = {
      autoApproval: {
        ...discovered.autoApproval,
        effectiveMode: 'edit_only',
      },
    };
    mockDiscoverProjectGovernance.mockResolvedValue(discovered);
    mockApplySessionOverrideToGovernanceState.mockResolvedValue(merged);
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    mockGetAllWindows.mockReturnValue([createWindowMock()]);

    const runtime = createInspectorOrchestration();
    const result = await runtime.getGovernanceState('/repo', 'session-4');

    expect(mockDiscoverProjectGovernance).toHaveBeenCalledWith('/repo');
    expect(orchestrator.getSessionOverride).toHaveBeenCalledWith('session-4');
    expect(mockApplySessionOverrideToGovernanceState).toHaveBeenCalledWith(discovered, 'edit_only');
    expect(result).toEqual(merged);
  });

  it('mirrors Playwright URLs parsed from PTY output and emits inspector events', () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => undefined),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    const win = createWindowMock();
    mockGetAllWindows.mockReturnValue([win]);
    mockExtractPlaywrightNavigateUrlsFromTerminalChunk.mockReturnValue(['https://playwright.dev']);
    mockShouldMirrorPlaywrightNavigateUrl.mockReturnValue(true);

    const runtime = createInspectorOrchestration();
    runtime.mirrorPlaywrightFromPtyData('session-5', '/repo', 'chunk with navigate');

    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledWith(
      {
        url: 'https://playwright.dev',
        cwd: '/repo',
        sessionId: 'session-5',
        preferEmbedded: true,
      },
      win,
      expect.any(Function),
    );
    expect(win.webContents.send).toHaveBeenCalledWith(
      'session:inspectorEvents',
      'session-5',
      expect.arrayContaining([
        expect.objectContaining({
          hookEvent: 'PlaywrightMirror',
        }),
      ]),
    );
  });

  it('clears per-session and global caches for Playwright mirroring decisions', () => {
    const orchestrator = {
      handleInspectorEvents: vi.fn(async () => {}),
      getSessionOverride: vi.fn(() => undefined),
    };
    mockCreateAutoApprovalOrchestrator.mockReturnValue(orchestrator);
    const win = createWindowMock();
    mockGetAllWindows.mockReturnValue([win]);
    mockExtractPlaywrightNavigateUrlsFromTerminalChunk.mockReturnValue(['https://example.com']);
    mockShouldMirrorPlaywrightNavigateUrl.mockImplementation(
      (sessionId: string, _url: string, state: Map<string, unknown>) => {
        if (state.has(sessionId)) return false;
        state.set(sessionId, {
          lastOpenedAt: Date.now(),
          url: 'https://example.com',
          cwd: '/repo',
        });
        return true;
      },
    );

    const runtime = createInspectorOrchestration();
    runtime.mirrorPlaywrightFromPtyData('session-a', '/repo', 'one');
    runtime.mirrorPlaywrightFromPtyData('session-a', '/repo', 'two');
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledTimes(1);

    clearInspectorOrchestrationSession('session-a');
    runtime.mirrorPlaywrightFromPtyData('session-a', '/repo', 'three');
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledTimes(2);

    runtime.mirrorPlaywrightFromPtyData('session-b', '/repo', 'x');
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledTimes(3);
    resetInspectorOrchestrationCaches();
    runtime.mirrorPlaywrightFromPtyData('session-a', '/repo', 'after-reset-a');
    runtime.mirrorPlaywrightFromPtyData('session-b', '/repo', 'after-reset-b');
    expect(mockOpenUrlWithBrowserPolicy).toHaveBeenCalledTimes(5);
  });
});
