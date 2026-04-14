import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  watch: vi.fn(),
}));

import * as fs from 'fs';
import { setFileWatcherWindow, unwatchFile, watchFile } from './file-watcher';

const mockSend = vi.fn();
const watchCallbacks = new Map<string, () => void>();
const closeFns = new Map<string, ReturnType<typeof vi.fn>>();

function createWindow(destroyed = false): any {
  return {
    isDestroyed: () => destroyed,
    webContents: { send: mockSend },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  watchCallbacks.clear();
  closeFns.clear();

  vi.mocked(fs.watch).mockImplementation(((filePath: any, listener: any) => {
    const key = String(filePath);
    const close = vi.fn();
    watchCallbacks.set(key, listener);
    closeFns.set(key, close);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
});

afterEach(() => {
  for (const filePath of watchCallbacks.keys()) {
    unwatchFile(filePath);
    unwatchFile(filePath);
  }
  vi.useRealTimers();
});

describe('file-watcher', () => {
  it('debounces file change notifications to the renderer', () => {
    setFileWatcherWindow(createWindow());
    watchFile('/tmp/watch-a.txt');

    watchCallbacks.get('/tmp/watch-a.txt')?.();
    watchCallbacks.get('/tmp/watch-a.txt')?.();

    vi.advanceTimersByTime(499);
    expect(mockSend).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith('fs:fileChanged', '/tmp/watch-a.txt');
  });

  it('reference-counts duplicate watches and only closes after the last unwatch', () => {
    watchFile('/tmp/watch-b.txt');
    watchFile('/tmp/watch-b.txt');

    expect(fs.watch).toHaveBeenCalledTimes(1);

    unwatchFile('/tmp/watch-b.txt');
    expect(closeFns.get('/tmp/watch-b.txt')).not.toHaveBeenCalled();

    unwatchFile('/tmp/watch-b.txt');
    expect(closeFns.get('/tmp/watch-b.txt')).toHaveBeenCalledTimes(1);
  });

  it('skips notifications when the target window is destroyed', () => {
    setFileWatcherWindow(createWindow(true));
    watchFile('/tmp/watch-c.txt');

    watchCallbacks.get('/tmp/watch-c.txt')?.();
    vi.advanceTimersByTime(500);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('ignores missing or unwatcheable files', () => {
    vi.mocked(fs.watch).mockImplementationOnce((() => {
      throw new Error('ENOENT');
    }) as any);

    expect(() => watchFile('/tmp/missing.txt')).not.toThrow();
    expect(() => unwatchFile('/tmp/missing.txt')).not.toThrow();
  });
});
