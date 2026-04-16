import fs from 'node:fs';
import path from 'node:path';
import type { ProjectCheckpointState } from '../../shared/types.js';
import { discoverProjectCheckpoints } from './discovery.js';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentHandler: ((state: ProjectCheckpointState) => void) | null = null;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const projectPath = currentProjectPath;
    const handler = currentHandler;
    if (!projectPath || !handler) return;
    const nextState = await discoverProjectCheckpoints(projectPath);
    if (projectPath !== currentProjectPath || handler !== currentHandler) return;
    handler(nextState);
  }, DEBOUNCE_MS);
}

function watchDir(dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const watcher = fs.watch(dirPath, () => notify());
    watcher.on('error', () => {});
    dirWatchers.push(watcher);
  } catch {
    // Directory may not exist yet; that is fine for v1.
  }
}

export function stopProjectCheckpointWatcher(): void {
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

export function startProjectCheckpointWatcher(
  projectPath: string,
  onChange: (state: ProjectCheckpointState) => void,
): void {
  if (projectPath === currentProjectPath && onChange === currentHandler) return;

  stopProjectCheckpointWatcher();
  currentProjectPath = projectPath;
  currentHandler = onChange;

  watchDir(path.join(projectPath, '.calder', 'checkpoints'));
}
