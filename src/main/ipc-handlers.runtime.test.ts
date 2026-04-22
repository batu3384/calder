import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const orchestrator = {
    registerSession: vi.fn(),
    unregisterSession: vi.fn(),
    setSessionOverride: vi.fn(),
  };
  return {
    ipcHandle: vi.fn(),
    getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    startWatching: vi.fn(),
    cleanupSessionStatus: vi.fn(),
    stopHookWatching: vi.fn(),
    startCodexSessionWatcher: vi.fn(),
    registerPendingCodexSession: vi.fn(),
    unregisterCodexSession: vi.fn(),
    stopCodexSessionWatcher: vi.fn(),
    startCopilotSessionWatcher: vi.fn(),
    registerPendingCopilotSession: vi.fn(),
    unregisterCopilotSession: vi.fn(),
    stopCopilotSessionWatcher: vi.fn(),
    registerMcpHandlers: vi.fn(),
    registerFsStoreIpcHandlers: vi.fn(),
    registerMaintenanceIpcHandlers: vi.fn(),
    registerMcpGovernanceIpcHandlers: vi.fn(),
    registerGitIpcHandlers: vi.fn(),
    registerProviderIpcHandlers: vi.fn(),
    registerProviderUpdateIpcHandlers: vi.fn(),
    registerMobileIpcHandlers: vi.fn(),
    registerCalderIpcHandlers: vi.fn(),
    resetCalderProjectWatchers: vi.fn(),
    registerAppBrowserIpcHandlers: vi.fn(),
    registerCliSurfaceIpcHandlers: vi.fn(),
    registerPtyIpcHandlers: vi.fn(),
    sanitizePersistedStateForSave: vi.fn((value: unknown) => value),
    clearInspectorOrchestrationSession: vi.fn(),
    resetInspectorOrchestrationCaches: vi.fn(),
    createInspectorOrchestration: vi.fn(() => ({
      autoApprovalOrchestrator: orchestrator,
      getGovernanceState: vi.fn(() => ({ mode: 'off' })),
      mirrorPlaywrightFromPtyData: vi.fn(),
    })),
    isWithinKnownProject: vi.fn(() => true),
    isAllowedDirectoryLookupPath: vi.fn(() => true),
    isAllowedReadPath: vi.fn(() => true),
    requireKnownProjectPath: vi.fn((p: string) => p),
    getActiveProjectPath: vi.fn(() => '/repo/project'),
    isAutoApprovalMode: vi.fn(() => true),
    updateAutoApprovalMode: vi.fn(),
    createAppMenu: vi.fn(),
    getProvider: vi.fn(),
    isTrackingHealthy: vi.fn(() => true),
    createCliSurfaceRuntimeManager: vi.fn(() => ({ id: 'runtime' })),
    assertProjectGovernanceAllows: vi.fn(),
    loadState: vi.fn(() => ({
      version: 1,
      projects: [],
      activeProjectId: null,
      preferences: {},
    })),
    orchestrator,
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcHandle },
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
}));

vi.mock('./hooks/hook-status', () => ({
  startWatching: mocks.startWatching,
  cleanupSessionStatus: mocks.cleanupSessionStatus,
  stopWatching: mocks.stopHookWatching,
}));

vi.mock('./codex-session-watcher', () => ({
  startCodexSessionWatcher: mocks.startCodexSessionWatcher,
  registerPendingCodexSession: mocks.registerPendingCodexSession,
  unregisterCodexSession: mocks.unregisterCodexSession,
  stopCodexSessionWatcher: mocks.stopCodexSessionWatcher,
}));

vi.mock('./copilot-session-watcher', () => ({
  startCopilotSessionWatcher: mocks.startCopilotSessionWatcher,
  registerPendingCopilotSession: mocks.registerPendingCopilotSession,
  unregisterCopilotSession: mocks.unregisterCopilotSession,
  stopCopilotSessionWatcher: mocks.stopCopilotSessionWatcher,
}));

vi.mock('./mcp-ipc-handlers', () => ({ registerMcpHandlers: mocks.registerMcpHandlers }));
vi.mock('./ipc-fs-store', () => ({ registerFsStoreIpcHandlers: mocks.registerFsStoreIpcHandlers }));
vi.mock('./ipc-maintenance', () => ({ registerMaintenanceIpcHandlers: mocks.registerMaintenanceIpcHandlers }));
vi.mock('./ipc-mcp-governance', () => ({ registerMcpGovernanceIpcHandlers: mocks.registerMcpGovernanceIpcHandlers }));
vi.mock('./ipc-git', () => ({ registerGitIpcHandlers: mocks.registerGitIpcHandlers }));
vi.mock('./ipc-provider', () => ({ registerProviderIpcHandlers: mocks.registerProviderIpcHandlers }));
vi.mock('./ipc-provider-update', () => ({ registerProviderUpdateIpcHandlers: mocks.registerProviderUpdateIpcHandlers }));
vi.mock('./ipc-mobile', () => ({ registerMobileIpcHandlers: mocks.registerMobileIpcHandlers }));
vi.mock('./ipc-calder', () => ({
  registerCalderIpcHandlers: mocks.registerCalderIpcHandlers,
  resetCalderProjectWatchers: mocks.resetCalderProjectWatchers,
}));
vi.mock('./ipc-app-browser', () => ({ registerAppBrowserIpcHandlers: mocks.registerAppBrowserIpcHandlers }));
vi.mock('./ipc-cli-surface', () => ({ registerCliSurfaceIpcHandlers: mocks.registerCliSurfaceIpcHandlers }));
vi.mock('./ipc-pty', () => ({ registerPtyIpcHandlers: mocks.registerPtyIpcHandlers }));
vi.mock('./ipc-state-sanitizer', () => ({ sanitizePersistedStateForSave: mocks.sanitizePersistedStateForSave }));
vi.mock('./ipc-inspector-orchestration', () => ({
  clearInspectorOrchestrationSession: mocks.clearInspectorOrchestrationSession,
  createInspectorOrchestration: mocks.createInspectorOrchestration,
  resetInspectorOrchestrationCaches: mocks.resetInspectorOrchestrationCaches,
}));
vi.mock('./ipc-path-policy', () => ({
  getActiveProjectPath: mocks.getActiveProjectPath,
  isAllowedDirectoryLookupPath: mocks.isAllowedDirectoryLookupPath,
  isAllowedReadPath: mocks.isAllowedReadPath,
  isWithinKnownProject: mocks.isWithinKnownProject,
  requireKnownProjectPath: mocks.requireKnownProjectPath,
}));
vi.mock('./ipc-auto-approval-governance', () => ({
  isAutoApprovalMode: mocks.isAutoApprovalMode,
  updateAutoApprovalMode: mocks.updateAutoApprovalMode,
}));
vi.mock('./menu', () => ({ createAppMenu: mocks.createAppMenu }));
vi.mock('./providers/registry', () => ({ getProvider: mocks.getProvider }));
vi.mock('../shared/tracking-health', () => ({ isTrackingHealthy: mocks.isTrackingHealthy }));
vi.mock('./cli-surface-runtime', () => ({ createCliSurfaceRuntimeManager: mocks.createCliSurfaceRuntimeManager }));
vi.mock('./calder-governance/enforcement', () => ({ assertProjectGovernanceAllows: mocks.assertProjectGovernanceAllows }));
vi.mock('./store', () => ({ loadState: mocks.loadState }));

import { registerIpcHandlers, resetHookWatcher } from './ipc-handlers';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadState.mockReturnValue({
    version: 1,
    projects: [],
    activeProjectId: null,
    preferences: {},
  });
  resetHookWatcher();
});

describe('ipc-handlers runtime', () => {
  it('resetHookWatcher clears long-lived watcher services', () => {
    resetHookWatcher();

    expect(mocks.stopHookWatching).toHaveBeenCalled();
    expect(mocks.stopCodexSessionWatcher).toHaveBeenCalled();
    expect(mocks.stopCopilotSessionWatcher).toHaveBeenCalled();
    expect(mocks.resetCalderProjectWatchers).toHaveBeenCalled();
    expect(mocks.resetInspectorOrchestrationCaches).toHaveBeenCalled();
  });

  it('registerIpcHandlers wires PTY callbacks and menu rebuild handler', () => {
    registerIpcHandlers();

    expect(mocks.registerPtyIpcHandlers).toHaveBeenCalledTimes(1);
    const ptyOps = mocks.registerPtyIpcHandlers.mock.calls[0]?.[0] as {
      ensureHookWatcherStarted(win: unknown): void;
      registerPendingProviderSessionWatchers(providerId: string, cliSessionId: string | null, sessionId: string, cwd: string, win: unknown): void;
      handlePtySessionExit(sessionId: string): void;
    };
    expect(ptyOps).toBeTruthy();

    const win = { webContents: { send: vi.fn() } };
    ptyOps.ensureHookWatcherStarted(win);
    ptyOps.ensureHookWatcherStarted(win);
    expect(mocks.startWatching).toHaveBeenCalledTimes(1);

    ptyOps.registerPendingProviderSessionWatchers('codex', null, 's1', '/repo/project', win);
    expect(mocks.startCodexSessionWatcher).toHaveBeenCalledWith(win);
    expect(mocks.registerPendingCodexSession).toHaveBeenCalledWith('s1', { cwd: '/repo/project' });

    ptyOps.registerPendingProviderSessionWatchers('copilot', null, 's2', '/repo/project', win);
    expect(mocks.startCopilotSessionWatcher).toHaveBeenCalledWith(win);
    expect(mocks.registerPendingCopilotSession).toHaveBeenCalledWith('s2', { cwd: '/repo/project' });

    ptyOps.registerPendingProviderSessionWatchers('codex', 'cli-1', 's1', '/repo/project', win);
    ptyOps.registerPendingProviderSessionWatchers('copilot', 'cli-2', 's2', '/repo/project', win);
    ptyOps.registerPendingProviderSessionWatchers('claude', null, 's1', '/repo/project', win);
    expect(mocks.startCodexSessionWatcher).toHaveBeenCalledTimes(1);
    expect(mocks.startCopilotSessionWatcher).toHaveBeenCalledTimes(1);

    ptyOps.handlePtySessionExit('session-17');
    expect(mocks.cleanupSessionStatus).toHaveBeenCalledWith('session-17');
    expect(mocks.unregisterCodexSession).toHaveBeenCalledWith('session-17');
    expect(mocks.unregisterCopilotSession).toHaveBeenCalledWith('session-17');
    expect(mocks.orchestrator.unregisterSession).toHaveBeenCalledWith('session-17');
    expect(mocks.clearInspectorOrchestrationSession).toHaveBeenCalledWith('session-17');

    const menuCall = mocks.ipcHandle.mock.calls.find((call) => call[0] === 'menu:rebuild');
    expect(menuCall).toBeTruthy();
    const menuHandler = menuCall?.[1] as (event: unknown, debugMode: boolean) => void;
    menuHandler({}, true);
    expect(mocks.createAppMenu).toHaveBeenCalledWith(true);

    expect(mocks.registerFsStoreIpcHandlers).toHaveBeenCalledWith(expect.objectContaining({
      isAllowedDirectoryLookupPath: mocks.isAllowedDirectoryLookupPath,
      isAllowedReadPath: mocks.isAllowedReadPath,
      isWithinKnownProject: mocks.isWithinKnownProject,
      sanitizePersistedStateForSave: mocks.sanitizePersistedStateForSave,
    }));
  });

  it('validateProviderTrackingAndWarn skips Claude auto-heal when consent is declined for foreign statusline', () => {
    registerIpcHandlers();
    const ptyOps = mocks.registerPtyIpcHandlers.mock.calls[0]?.[0] as {
      validateProviderTrackingAndWarn(win: { webContents: { send: (channel: string, payload: unknown) => void } }, sessionId: string, providerId: string): void;
    };

    const provider = {
      meta: { capabilities: { hookStatus: true } },
      validateSettings: vi.fn(() => ({ statusLine: 'foreign', hooks: 'partial' })),
      reinstallSettings: vi.fn(),
    };
    mocks.getProvider.mockReturnValue(provider);
    mocks.loadState.mockReturnValue({
      version: 1,
      projects: [],
      activeProjectId: null,
      preferences: { statusLineConsent: 'declined' },
    });
    mocks.isTrackingHealthy.mockReturnValue(false);

    const send = vi.fn();
    ptyOps.validateProviderTrackingAndWarn({ webContents: { send } }, 'sess-1', 'claude');

    expect(provider.reinstallSettings).not.toHaveBeenCalled();
    expect(provider.validateSettings).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('settings:warning', {
      sessionId: 'sess-1',
      providerId: 'claude',
      statusLine: 'foreign',
      hooks: 'partial',
    });
  });

  it('validateProviderTrackingAndWarn auto-heals then warns when still unhealthy', () => {
    registerIpcHandlers();
    const ptyOps = mocks.registerPtyIpcHandlers.mock.calls[0]?.[0] as {
      validateProviderTrackingAndWarn(win: { webContents: { send: (channel: string, payload: unknown) => void } }, sessionId: string, providerId: string): void;
    };

    const provider = {
      meta: { capabilities: { hookStatus: true } },
      validateSettings: vi.fn(() => ({ statusLine: 'foreign', hooks: 'partial' })),
      reinstallSettings: vi.fn(),
    };
    mocks.getProvider.mockReturnValue(provider);
    mocks.loadState.mockReturnValue({
      version: 1,
      projects: [],
      activeProjectId: null,
      preferences: { statusLineConsent: 'granted' },
    });
    mocks.isTrackingHealthy.mockReturnValueOnce(false).mockReturnValueOnce(false);

    const send = vi.fn();
    ptyOps.validateProviderTrackingAndWarn({ webContents: { send } }, 'sess-1', 'claude');

    expect(provider.reinstallSettings).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('settings:warning', {
      sessionId: 'sess-1',
      providerId: 'claude',
      statusLine: 'foreign',
      hooks: 'partial',
    });
  });

  it('setSessionAutoApprovalOverride delegates to inspector orchestrator override API', () => {
    registerIpcHandlers();

    const calderOps = mocks.registerCalderIpcHandlers.mock.calls[0]?.[0] as {
      setSessionAutoApprovalOverride(sessionId: string, mode: string | null): void;
    };
    calderOps.setSessionAutoApprovalOverride('s55', 'full_auto');

    expect(mocks.orchestrator.setSessionOverride).toHaveBeenCalledWith('s55', 'full_auto');
  });
});
