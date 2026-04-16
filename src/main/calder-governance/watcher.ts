import fs from 'node:fs';
import path from 'node:path';
import type { ProjectGovernanceState } from '../../shared/types.js';
import { discoverProjectGovernance } from './discovery.js';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentHandler: ((state: ProjectGovernanceState) => void) | null = null;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const projectPath = currentProjectPath;
    const handler = currentHandler;
    if (!projectPath || !handler) return;
    const nextState = await discoverProjectGovernance(projectPath);
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

export function stopProjectGovernanceWatcher(): void {
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

export function startProjectGovernanceWatcher(
  projectPath: string,
  onChange: (state: ProjectGovernanceState) => void,
): void {
  if (projectPath === currentProjectPath && onChange === currentHandler) return;

  stopProjectGovernanceWatcher();
  currentProjectPath = projectPath;
  currentHandler = onChange;

  watchDir(path.join(projectPath, '.calder'));
  watchDir(path.join(projectPath, '.calder', 'governance'));
}
