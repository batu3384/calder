import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', () => ({
  watch: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import * as fs from 'fs';
import { execFile } from 'child_process';
import { notifyGitChanged, startGitWatcher, stopGitWatcher } from './git-watcher';

const mockSend = vi.fn();
const watchCallbacks = new Map<string, (_event: string, filename: string | null) => void>();
const closeFns: Array<ReturnType<typeof vi.fn>> = [];

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
  closeFns.length = 0;

  vi.mocked(execFile).mockImplementation(((
    _cmd: string,
    _args: readonly string[],
    _options: { cwd: string; timeout: number },
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(null, '.git\n', '');
  }) as any);

  vi.mocked(fs.watch).mockImplementation(((filePath: any, optionsOrListener: any, maybeListener: any) => {
    const listener = typeof optionsOrListener === 'function' ? optionsOrListener : maybeListener;
    const close = vi.fn();
    closeFns.push(close);
    watchCallbacks.set(String(filePath), listener);
    return {
      close,
      on: vi.fn().mockReturnThis(),
    } as any;
  }) as any);
});

afterEach(() => {
  stopGitWatcher();
  vi.useRealTimers();
});

describe('git-watcher', () => {
  it('watches the git directory, refs, working tree, and HEAD file', async () => {
    await startGitWatcher(createWindow(), '/repo/project');

    expect(execFile).toHaveBeenCalledWith(
      'git',
      ['rev-parse', '--git-dir'],
      { cwd: '/repo/project', timeout: 3000 },
      expect.any(Function),
    );
    expect(watchCallbacks.has('/repo/project/.git')).toBe(true);
    expect(watchCallbacks.has('/repo/project/.git/refs')).toBe(true);
    expect(watchCallbacks.has('/repo/project')).toBe(true);
    expect(watchCallbacks.has('/repo/project/.git/HEAD')).toBe(true);
  });

  it('debounces git change notifications', () => {
    startGitWatcher(createWindow(), '/repo/project');
    notifyGitChanged();
    notifyGitChanged();

    vi.advanceTimersByTime(299);
    expect(mockSend).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith('git:changed');
  });

  it('ignores working tree changes inside ignored directories', async () => {
    await startGitWatcher(createWindow(), '/repo/project');

    watchCallbacks.get('/repo/project')?.('change', 'node_modules/pkg/index.js');
    watchCallbacks.get('/repo/project')?.('change', '.cache/build.txt');
    vi.advanceTimersByTime(300);

    expect(mockSend).not.toHaveBeenCalled();

    watchCallbacks.get('/repo/project')?.('change', 'src/app.ts');
    vi.advanceTimersByTime(300);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith('git:changed');
  });

  it('does not restart watchers for the same project and cleans up on stop', async () => {
    await startGitWatcher(createWindow(), '/repo/project');
    vi.mocked(fs.watch).mockClear();

    await startGitWatcher(createWindow(), '/repo/project');
    expect(fs.watch).not.toHaveBeenCalled();

    stopGitWatcher();
    expect(closeFns.every((close) => close.mock.calls.length === 1)).toBe(true);
  });
});
