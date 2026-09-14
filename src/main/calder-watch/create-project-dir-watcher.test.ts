import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProjectDirWatcher } from './create-project-dir-watcher.js';

describe('createProjectDirWatcher', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logs discover failures instead of rejecting when ignoreDiscoverErrors is unset', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'calder-watch-'));
    tmpDirs.push(projectPath);
    const watchRoot = path.join(projectPath, '.calder', 'reviews');
    fs.mkdirSync(watchRoot, { recursive: true });

    const watchListeners: Array<() => void> = [];
    const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(((
      _target: fs.PathLike,
      opts?: unknown,
      listener?: fs.WatchListener<string>,
    ) => {
      const callback = typeof opts === 'function' ? opts : listener;
      if (typeof callback === 'function') {
        watchListeners.push(() => {
          callback('change', 'touch.txt');
        });
      }
      return { close: vi.fn(), on: vi.fn() } as unknown as fs.FSWatcher;
    }) as typeof fs.watch);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const discover = vi.fn().mockRejectedValue(new Error('boom'));
    const watcher = createProjectDirWatcher<{ ok: boolean }>({
      watchDirs: () => [watchRoot],
      discover,
      debounceMs: 0,
    });

    const changes: Array<{ ok: boolean }> = [];
    watcher.start(projectPath, (state) => changes.push(state));
    expect(watchListeners.length).toBeGreaterThan(0);
    for (const fire of watchListeners) fire();
    await vi.waitFor(() => expect(discover).toHaveBeenCalled());

    expect(changes).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    watchSpy.mockRestore();
    watcher.stopAll();
  });
});
