import fs from 'node:fs';
import path from 'node:path';
import type { ProjectBackgroundTaskState } from '../../shared/types.js';
import { discoverProjectBackgroundTasks } from './discovery.js';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentHandler: ((state: ProjectBackgroundTaskState) => void) | null = null;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (!currentProjectPath || !currentHandler) return;
    currentHandler(await discoverProjectBackgroundTasks(currentProjectPath));
  }, DEBOUNCE_MS);
}

function watchDir(dirPath: string): void {
  try {
    const watcher = fs.watch(dirPath, () => notify());
    watcher.on('error', () => {});
    dirWatchers.push(watcher);
  } catch {
    // Directory may not exist yet; that is fine for v1.
  }
}

export function stopProjectBackgroundTaskWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  for (const watcher of dirWatchers) {
    watcher.close();
  }
  dirWatchers = [];
  currentProjectPath = null;
  currentHandler = null;
}

export function startProjectBackgroundTaskWatcher(
  projectPath: string,
  onChange: (state: ProjectBackgroundTaskState) => void,
): void {
  if (projectPath === currentProjectPath && onChange === currentHandler) return;

  stopProjectBackgroundTaskWatcher();
  currentProjectPath = projectPath;
  currentHandler = onChange;

  watchDir(path.join(projectPath, '.calder', 'tasks'));
}
