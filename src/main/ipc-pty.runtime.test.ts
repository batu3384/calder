import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockSpawnPty = vi.hoisted(() => vi.fn());
const mockSpawnShellPty = vi.hoisted(() => vi.fn());
const mockWritePty = vi.hoisted(() => vi.fn());
const mockHasPtySession = vi.hoisted(() => vi.fn());
const mockKillPty = vi.hoisted(() => vi.fn());
const mockResizePty = vi.hoisted(() => vi.fn());
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
  hasPtySession: mockHasPtySession,
  killPty: mockKillPty,
  resizePty: mockResizePty,
  isSilencedExit: mockIsSilencedExit,
}));

import { registerPtyIpcHandlers } from './ipc-pty';

function getHandleHandler(channel: string): (...args: unknown[]) => unknown {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

function getOnHandler(channel: string): (...args: unknown[]) => unknown {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.on registration for ${channel}`);
  }
  return call[1] as (...args: unknown[]) => unknown;
}

describe('ipc pty runtime handlers', () => {
  const ops = {
    assertProjectGovernanceAllows: vi.fn(async () => {}),
    isWithinKnownProject: vi.fn(() => true),
    ensureHookWatcherStarted: vi.fn(),
    registerAutoApprovalSession: vi.fn(),
    unregisterAutoApprovalSession: vi.fn(),
    validateProviderTrackingAndWarn: vi.fn(),
    registerPendingProviderSessionWatchers: vi.fn(),
    mirrorPlaywrightFromPtyData: vi.fn(),
    handlePtySessionExit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send: vi.fn() } }]);
    registerPtyIpcHandlers(ops);
  });

  it('blocks pty:create when governance rejects shell access', async () => {
    ops.assertProjectGovernanceAllows.mockRejectedValueOnce(
      new Error('Governance policy blocked Spawn CLI session: blocked'),
    );
    const create = getHandleHandler('pty:create');

    await expect(
      create({}, 'sess-1', '/repo/project', null, false, '', 'claude'),
    ).rejects.toThrow('Governance policy blocked Spawn CLI session');

    expect(mockSpawnPty).not.toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo/project', {
      kind: 'write',
      label: 'Spawn CLI session',
    });
  });

  it('blocks pty:createShell when governance rejects shell access', async () => {
    ops.assertProjectGovernanceAllows.mockRejectedValueOnce(
      new Error('Governance policy blocked Spawn shell session: blocked'),
    );
    const createShell = getHandleHandler('pty:createShell');

    await expect(createShell({}, 'sess-shell', '/repo/project')).rejects.toThrow(
      'Governance policy blocked Spawn shell session',
    );

    expect(mockSpawnShellPty).not.toHaveBeenCalled();
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo/project', {
      kind: 'write',
      label: 'Spawn shell session',
    });
  });

  it('throws when pty:create runs without an application window', async () => {
    mockGetAllWindows.mockReturnValueOnce([]);
    const create = getHandleHandler('pty:create');

    await expect(create({}, 'sess-1', '/repo/project', null, false, '', 'claude')).rejects.toThrow(
      'PTY create requires an application window',
    );
    expect(mockSpawnPty).not.toHaveBeenCalled();
  });

  it('ignores pty:write for unknown sessions', () => {
    mockHasPtySession.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const write = getOnHandler('pty:write');

    write({}, 'missing-session', 'ls\r');

    expect(mockWritePty).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('pty:write ignored unknown session: missing-session');
    warnSpy.mockRestore();
  });
});
