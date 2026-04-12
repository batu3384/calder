import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

const { STATUS_DIR: MOCK_STATUS_DIR } = vi.hoisted(() => {
  const path = require('path');
  return { STATUS_DIR: path.join('/tmp', 'calder') };
});

vi.mock('./hook-status', () => ({
  STATUS_DIR: MOCK_STATUS_DIR,
}));

import * as path from 'path';
import * as fs from 'fs';
import {
  registerPendingBlackboxSession,
  unregisterBlackboxSession,
  startBlackboxSessionWatcher,
  stopBlackboxSessionWatcher,
} from './blackbox-session-watcher';

const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockWatch = vi.mocked(fs.watch);

function createMockWin(): any {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  stopBlackboxSessionWatcher();
  mockReaddirSync.mockImplementation(() => [] as any);
});

afterEach(() => {
  stopBlackboxSessionWatcher();
  vi.useRealTimers();
});

describe('registerPendingBlackboxSession', () => {
  it('captures the existing session files on first registration', () => {
    mockReaddirSync.mockReturnValueOnce(['blackbox_secure_session_existing.json'] as any);
    registerPendingBlackboxSession('ui-1');
    expect(mockReaddirSync).toHaveBeenCalled();
  });
});

describe('startBlackboxSessionWatcher', () => {
  it('starts fs.watch on ~/.blackboxcli/sessions', () => {
    const mockWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(mockWatcher as any);

    const win = createMockWin();
    startBlackboxSessionWatcher(win);

    expect(mockWatch).toHaveBeenCalledWith(
      path.join('/mock/home', '.blackboxcli', 'sessions'),
      expect.any(Function)
    );
  });
});

describe('session ID assignment via polling', () => {
  it('assigns a new blackbox session file to the oldest pending ui session', () => {
    const mockWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(mockWatcher as any);

    const win = createMockWin();
    startBlackboxSessionWatcher(win);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValue(['blackbox_secure_session_abc.json'] as any);
    mockReadFileSync.mockImplementation((inputPath) => {
      if (String(inputPath).endsWith('blackbox_secure_session_abc.json')) {
        return JSON.stringify({ sessionId: 'bbx-abc-123' }) as any;
      }
      throw new Error('ENOENT');
    });

    registerPendingBlackboxSession('ui-session-1');
    vi.advanceTimersByTime(2000);

    expect(mockMkdirSync).toHaveBeenCalledWith(MOCK_STATUS_DIR, { recursive: true, mode: 0o700 });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(MOCK_STATUS_DIR, 'ui-session-1.sessionid'),
      'bbx-abc-123'
    );
  });

  it('does not assign an already-used blackbox session id twice', () => {
    const mockWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(mockWatcher as any);

    const win = createMockWin();
    startBlackboxSessionWatcher(win);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValue(['blackbox_secure_session_dup.json'] as any);
    mockReadFileSync.mockImplementation(() => JSON.stringify({ sessionId: 'bbx-dup' }) as any);

    registerPendingBlackboxSession('ui-1');
    vi.advanceTimersByTime(2000);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);

    registerPendingBlackboxSession('ui-2');
    vi.advanceTimersByTime(2000);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterBlackboxSession', () => {
  it('removes pending sessions so they are no longer assignable', () => {
    const mockWatcher = { close: vi.fn() };
    mockWatch.mockReturnValue(mockWatcher as any);

    const win = createMockWin();
    startBlackboxSessionWatcher(win);

    mockReaddirSync
      .mockReturnValueOnce([] as any)
      .mockReturnValue(['blackbox_secure_session_orphan.json'] as any);
    mockReadFileSync.mockImplementation(() => JSON.stringify({ sessionId: 'bbx-orphan' }) as any);

    registerPendingBlackboxSession('ui-gone');
    unregisterBlackboxSession('ui-gone');
    vi.advanceTimersByTime(2000);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
