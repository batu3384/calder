import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockSpawnPty = vi.hoisted(() => vi.fn());
const mockSpawnShellPty = vi.hoisted(() => vi.fn());
const mockWritePty = vi.hoisted(() => vi.fn());
const mockResizePty = vi.hoisted(() => vi.fn());
const mockKillPty = vi.hoisted(() => vi.fn());
const mockIsSilencedExit = vi.hoisted(() => vi.fn(() => false));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
}));

vi.mock('./pty-manager', () => ({
  spawnPty: mockSpawnPty,
  spawnShellPty: mockSpawnShellPty,
  writePty: mockWritePty,
  resizePty: mockResizePty,
  killPty: mockKillPty,
  isSilencedExit: mockIsSilencedExit,
}));

import { registerPtyIpcHandlers } from './ipc-pty';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function getOnHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.on registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function createOps(overrides?: Partial<Parameters<typeof registerPtyIpcHandlers>[0]>): Parameters<typeof registerPtyIpcHandlers>[0] {
  return {
    isWithinKnownProject: vi.fn(() => true),
    ensureHookWatcherStarted: vi.fn(),
    registerAutoApprovalSession: vi.fn(),
    unregisterAutoApprovalSession: vi.fn(),
    validateProviderTrackingAndWarn: vi.fn(),
    registerPendingProviderSessionWatchers: vi.fn(),
    mirrorPlaywrightFromPtyData: vi.fn(),
    handlePtySessionExit: vi.fn(),
    ...overrides,
  };
}

describe('ipc pty handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects pty:create when cwd is outside known projects', () => {
    const ops = createOps({ isWithinKnownProject: vi.fn(() => false) });
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send: vi.fn() } }]);
    registerPtyIpcHandlers(ops);

    const createHandler = getHandleHandler('pty:create');
    expect(() => createHandler({}, 's1', '/unknown', null, false, '', 'claude')).toThrow(
      'PTY create requires a known project path',
    );
    expect(mockSpawnPty).not.toHaveBeenCalled();
  });

  it('wires pty:create lifecycle hooks and forwards data/exit events', () => {
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    mockGetAllWindows.mockReturnValue([win]);
    mockIsSilencedExit.mockReturnValue(false);
    mockSpawnPty.mockImplementation((
      _sessionId: string,
      _cwd: string,
      _cliSessionId: string | null,
      _isResume: boolean,
      _extraArgs: string,
      _providerId: string,
      _initialPrompt: string | undefined,
      onData: (data: string) => void,
      onExit: (exitCode: number, signal?: number) => void,
    ) => {
      onData('stdout-chunk');
      onExit(0, 15);
    });
    const ops = createOps();
    registerPtyIpcHandlers(ops);

    const createHandler = getHandleHandler('pty:create');
    createHandler({}, 's2', '/repo', 'cli-s2', false, '--dangerously-skip-permissions', 'codex', 'hello');

    const resolved = path.resolve('/repo');
    expect(ops.ensureHookWatcherStarted).toHaveBeenCalledWith(win);
    expect(ops.registerAutoApprovalSession).toHaveBeenCalledWith('s2', 'codex', resolved);
    expect(ops.validateProviderTrackingAndWarn).toHaveBeenCalledWith(win, 's2', 'codex');
    expect(ops.registerPendingProviderSessionWatchers).toHaveBeenCalledWith('codex', 'cli-s2', 's2', resolved, win);
    expect(ops.mirrorPlaywrightFromPtyData).toHaveBeenCalledWith('s2', resolved, 'stdout-chunk');
    expect(ops.handlePtySessionExit).toHaveBeenCalledWith('s2');
    expect(send).toHaveBeenCalledWith('pty:data', 's2', 'stdout-chunk');
    expect(send).toHaveBeenCalledWith('pty:exit', 's2', 0, 15);
  });

  it('suppresses pty:exit when the PTY exit is marked as silenced', () => {
    const send = vi.fn();
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send } }]);
    mockIsSilencedExit.mockReturnValue(true);
    mockSpawnPty.mockImplementation((
      _sessionId: string,
      _cwd: string,
      _cliSessionId: string | null,
      _isResume: boolean,
      _extraArgs: string,
      _providerId: string,
      _initialPrompt: string | undefined,
      _onData: (data: string) => void,
      onExit: (exitCode: number, signal?: number) => void,
    ) => {
      onExit(0, undefined);
    });
    const ops = createOps();
    registerPtyIpcHandlers(ops);

    const createHandler = getHandleHandler('pty:create');
    createHandler({}, 's3', '/repo', null, false, '', 'claude');

    expect(ops.handlePtySessionExit).toHaveBeenCalledWith('s3');
    expect(send).not.toHaveBeenCalledWith('pty:exit', 's3', 0, undefined);
  });

  it('guards and forwards pty:createShell output/exit', () => {
    const send = vi.fn();
    const win = { isDestroyed: () => false, webContents: { send } };
    mockGetAllWindows.mockReturnValue([win]);
    const ops = createOps();
    registerPtyIpcHandlers(ops);

    const createShellHandler = getHandleHandler('pty:createShell');

    (ops.isWithinKnownProject as ReturnType<typeof vi.fn>).mockReturnValue(false);
    expect(() => createShellHandler({}, 'shell-1', '/outside')).toThrow(
      'PTY shell requires a known project path',
    );

    (ops.isWithinKnownProject as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockSpawnShellPty.mockImplementation((
      _sessionId: string,
      _cwd: string,
      onData: (data: string) => void,
      onExit: (exitCode: number, signal?: number) => void,
    ) => {
      onData('shell-data');
      onExit(3, 9);
    });
    createShellHandler({}, 'shell-2', '/repo');

    expect(mockSpawnShellPty).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('pty:data', 'shell-2', 'shell-data');
    expect(send).toHaveBeenCalledWith('pty:exit', 'shell-2', 3, 9);
  });

  it('delegates write/resize and unregisters auto-approval state on kill', () => {
    const ops = createOps();
    registerPtyIpcHandlers(ops);

    const writeHandler = getOnHandler('pty:write');
    const resizeHandler = getOnHandler('pty:resize');
    const killHandler = getHandleHandler('pty:kill');

    writeHandler({}, 's4', 'ls -la\n');
    resizeHandler({}, 's4', 180, 55);
    killHandler({}, 's4');

    expect(mockWritePty).toHaveBeenCalledWith('s4', 'ls -la\n');
    expect(mockResizePty).toHaveBeenCalledWith('s4', 180, 55);
    expect(ops.unregisterAutoApprovalSession).toHaveBeenCalledWith('s4');
    expect(mockKillPty).toHaveBeenCalledWith('s4');
  });
});
