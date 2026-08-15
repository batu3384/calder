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

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const discover = vi.fn().mockRejectedValue(new Error('boom'));
    const watcher = createProjectDirWatcher<{ ok: boolean }>({
      watchDirs: () => [watchRoot],
      discover,
      debounceMs: 0,
    });

    const changes: Array<{ ok: boolean }> = [];
    watcher.start(projectPath, (state) => changes.push(state));
    fs.writeFileSync(path.join(watchRoot, 'touch.txt'), 'x');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(discover).toHaveBeenCalled();
    expect(changes).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    watcher.stopAll();
  });
});
