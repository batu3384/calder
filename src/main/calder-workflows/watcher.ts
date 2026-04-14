import fs from 'node:fs';
import path from 'node:path';
import type { ProjectWorkflowState } from '../../shared/types.js';
import { discoverProjectWorkflows } from './discovery.js';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentHandler: ((state: ProjectWorkflowState) => void) | null = null;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (!currentProjectPath || !currentHandler) return;
    currentHandler(await discoverProjectWorkflows(currentProjectPath));
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

export function stopProjectWorkflowWatcher(): void {
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

export function startProjectWorkflowWatcher(
  projectPath: string,
  onChange: (state: ProjectWorkflowState) => void,
): void {
  if (projectPath === currentProjectPath && onChange === currentHandler) return;

  stopProjectWorkflowWatcher();
  currentProjectPath = projectPath;
  currentHandler = onChange;

  watchDir(path.join(projectPath, '.calder', 'workflows'));
}
