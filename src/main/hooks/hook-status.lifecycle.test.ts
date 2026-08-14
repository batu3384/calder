import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isWin } from '../platform';

const STATUS_DIR = path.join('/mock/home', '.calder', 'runtime');
const STATUSLINE_SCRIPT = path.join(STATUS_DIR, isWin ? 'statusline.cmd' : 'statusline.sh');

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  openSync: vi.fn(),
  fstatSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  rmSync: vi.fn(),
  watch: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('electron', () => ({
  BrowserWindow: {},
}));

import * as fs from 'fs';

import {
  cleanupAll,
  cleanupSessionStatus,
  registerSession,
  restartAndResync,
  resyncAllSessions,
  setInspectorEventsMiddleware,
  startWatching,
  stopWatching,
} from './hook-status';

let watchCallback: ((eventType: string, filename: string | null) => void) | null = null;
const mockClose = vi.fn();

const mockSend = vi.fn();
function createMockWin(destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { send: mockSend } } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
  vi.mocked(fs.mkdirSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.writeFileSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readFileSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.openSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.fstatSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.closeSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.readdirSync).mockReturnValue([] as any);
  vi.mocked(fs.statSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.unlinkSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.rmdirSync).mockImplementation(vi.fn() as any);
  vi.mocked(fs.watch).mockImplementation((_path: any, cb: any) => {
    watchCallback = cb;
    return { close: mockClose } as any;
  });

  watchCallback = null;
  mockClose.mockClear();
  mockSend.mockClear();

  // Reset module-level watcher state
  cleanupAll();
  setInspectorEventsMiddleware(null);

  // Clear call counts after cleanup
  vi.clearAllMocks();
  watchCallback = null;

  vi.mocked(fs.watch).mockImplementation((_path: any, cb: any) => {
    watchCallback = cb;
    return { close: mockClose } as any;
  });
});

afterEach(() => {
  // Stop any polling intervals before restoring timers
  cleanupAll();
  vi.useRealTimers();
});

describe('hook-status', () => {
  describe('resyncAllSessions', () => {
    it('processes all matching files in dir', () => {
      const win = createMockWin();
      registerSession('s1');
      registerSession('s2');
      registerSession('s3');
      vi.mocked(fs.readdirSync).mockReturnValue([
        's1.status',
        's2.sessionid',
        's3.cost',
        'unrelated.txt',
      ] as any);

      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce('waiting') // s1.status
        .mockReturnValueOnce('claude-sess-1') // s2.sessionid
        .mockReturnValueOnce(JSON.stringify({ cost: {} })); // s3.cost

      resyncAllSessions(win);

      expect(mockSend).toHaveBeenCalledWith('session:hookStatus', 's1', 'waiting', '');
      expect(mockSend).toHaveBeenCalledWith('session:cliSessionId', 's2', 'claude-sess-1');
      expect(mockSend).toHaveBeenCalledWith('session:claudeSessionId', 's2', 'claude-sess-1');
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's3', { cost: {} });
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    it('is a no-op on destroyed window', () => {
      const win = createMockWin(true);
      resyncAllSessions(win);

      expect(fs.readdirSync).not.toHaveBeenCalled();
    });

    it('handles missing directory gracefully', () => {
      const win = createMockWin();
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => resyncAllSessions(win)).not.toThrow();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('restartAndResync', () => {
    it('calls both restartWatcher and resyncAllSessions', () => {
      const win = createMockWin();
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);

      restartAndResync(win);

      expect(fs.watch).toHaveBeenCalledWith(STATUS_DIR, expect.any(Function));
      expect(fs.readdirSync).toHaveBeenCalledWith(STATUS_DIR);
    });
  });

  describe('cleanupSessionStatus', () => {
    it('unlinks all 6 file types', () => {
      cleanupSessionStatus('sess-1');

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.status'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.sessionid'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.cost'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.toolfailure'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'sess-1.events'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'sess-1.provider_sync.json'),
      );
      expect(fs.unlinkSync).toHaveBeenCalledTimes(6);
    });

    it('also unlinks dynamic tool failure artifacts for the session', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        'sess-1-ab12cd.toolfailure',
        'sess-2-ef34gh.toolfailure',
        'other.txt',
      ] as any);

      cleanupSessionStatus('sess-1');

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'sess-1-ab12cd.toolfailure'),
      );
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'sess-2-ef34gh.toolfailure'),
      );
    });

    it('handles errors when files do not exist', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => cleanupSessionStatus('sess-1')).not.toThrow();
    });
  });

  describe('polling fallback', () => {
    it('re-processes a file recreated with the same mtime after it disappeared', () => {
      const win = createMockWin();
      registerSession('s1');
      const costPayload = { cost: { total: 1 }, context_window: {} };

      vi.mocked(fs.readdirSync)
        .mockReturnValueOnce(['s1.cost'] as any)
        .mockReturnValueOnce([] as any)
        .mockReturnValueOnce(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costPayload));

      startWatching(win);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(2, 'session:costData', 's1', costPayload);
    });

    it('skips stat/read work for files that belong to unknown sessions', () => {
      const win = createMockWin();
      registerSession('s1');

      vi.mocked(fs.readdirSync).mockReturnValue(['unknown.cost', 's1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ cost: { total: 1 }, context_window: {} }),
      );

      startWatching(win);
      vi.advanceTimersByTime(2000);

      expect(fs.statSync).toHaveBeenCalledTimes(1);
      expect(fs.statSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 's1.cost'));
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's1', {
        cost: { total: 1 },
        context_window: {},
      });
    });

    it('processes first-seen session files during polling when watch misses the event', () => {
      const win = createMockWin();
      registerSession('s1');

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.sessionid'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);
      vi.mocked(fs.readFileSync).mockReturnValue('cli-session-1');

      startWatching(win);
      vi.advanceTimersByTime(2000);

      expect(mockSend).toHaveBeenCalledWith('session:cliSessionId', 's1', 'cli-session-1');
      expect(mockSend).toHaveBeenCalledWith('session:claudeSessionId', 's1', 'cli-session-1');
    });

    it('detects changed files on poll interval', () => {
      const win = createMockWin();
      registerSession('s1');

      // First poll seeds mtimes
      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      startWatching(win);

      // Advance to trigger first poll — seeds mtimes, no handleFileChange
      vi.advanceTimersByTime(2000);
      expect(mockSend).not.toHaveBeenCalled();

      // Now file has changed mtime
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 2000 } as any);
      const costData = { cost: { total: 0.5 }, context_window: {} };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(costData));

      vi.advanceTimersByTime(2000);
      expect(mockSend).toHaveBeenCalledWith('session:costData', 's1', costData);
    });

    it('skips files with unchanged mtime', () => {
      const win = createMockWin();

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      startWatching(win);

      // Seed mtimes
      vi.advanceTimersByTime(2000);

      // Same mtime — no change
      vi.advanceTimersByTime(2000);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('stops polling on cleanupAll', () => {
      const win = createMockWin();
      startWatching(win);
      cleanupAll();

      vi.mocked(fs.readdirSync).mockReturnValue(['s1.cost'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: 1000 } as any);

      vi.advanceTimersByTime(4000);
      expect(fs.statSync).not.toHaveBeenCalled();
    });

    it('stopWatching keeps inspector middleware for next watcher start', () => {
      const win = createMockWin();
      startWatching(win);
      registerSession('abc123');

      setInspectorEventsMiddleware((_, events) => [...events, { type: 'marker' } as any]);

      stopWatching();
      startWatching(win);
      registerSession('abc123');

      const payload = '{"type":"permission_request"}\n';
      const payloadSize = Buffer.byteLength(payload);

      vi.mocked(fs.openSync).mockReturnValue(23 as any);
      vi.mocked(fs.fstatSync).mockReturnValue({ size: payloadSize } as any);
      vi.mocked(fs.readSync).mockImplementation((_fd: any, buffer: any) => {
        Buffer.from(payload, 'utf-8').copy(buffer as Buffer);
        return payloadSize as any;
      });

      watchCallback!('change', 'abc123.events');
      expect(mockSend).toHaveBeenCalledWith('session:inspectorEvents', 'abc123', [
        { type: 'permission_request' },
        { type: 'marker' },
      ]);
    });
  });

  describe('cleanupAll', () => {
    it('removes provider quota cache artifacts', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([
        'anthropic.quota.json',
        'zai.quota.json',
        'statusline.refresh.lock',
        'statusline.refresh.zai.lock',
      ] as any);

      cleanupAll();

      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'anthropic.quota.json'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'zai.quota.json'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'statusline.refresh.lock'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'statusline.refresh.zai.lock'),
      );
    });

    it('closes watcher and removes transient runtime artifacts only', () => {
      const win = createMockWin();
      startWatching(win);
      vi.clearAllMocks();

      vi.mocked(fs.readdirSync).mockReturnValue([
        'a.status',
        'b.sessionid',
        'c.cost',
        'sess-1.provider_sync.json',
        'status_writer.py',
        'statusline.py',
        isWin ? 'statusline.cmd' : 'statusline.sh',
        'other.log',
      ] as any);

      cleanupAll();

      expect(mockClose).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'a.status'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'b.sessionid'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(STATUS_DIR, 'c.cost'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(STATUS_DIR, 'sess-1.provider_sync.json'),
      );
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(STATUS_DIR, 'status_writer.py'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(STATUS_DIR, 'statusline.py'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(STATUSLINE_SCRIPT);
      expect(fs.rmSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledTimes(4);
    });

    it('handles missing directory gracefully', () => {
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => cleanupAll()).not.toThrow();
    });
  });
});
