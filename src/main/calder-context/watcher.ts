import fs from 'node:fs';
import path from 'node:path';
import type { ProjectContextState } from '../../shared/types.js';
import { discoverProjectContext } from './discovery.js';

const DEBOUNCE_MS = 500;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let watchedFiles: string[] = [];
let dirWatchers: fs.FSWatcher[] = [];
let currentProjectPath: string | null = null;
let currentHandler: ((state: ProjectContextState) => void) | null = null;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (!currentProjectPath || !currentHandler) return;
    currentHandler(await discoverProjectContext(currentProjectPath));
  }, DEBOUNCE_MS);
}

function watchFile(filePath: string): void {
  fs.watchFile(filePath, { interval: 250 }, notify);
  watchedFiles.push(filePath);
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

export function stopProjectContextWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  for (const filePath of watchedFiles) {
    fs.unwatchFile(filePath, notify);
  }
  watchedFiles = [];
  for (const watcher of dirWatchers) {
    watcher.close();
  }
  dirWatchers = [];
  currentProjectPath = null;
  currentHandler = null;
}

export function startProjectContextWatcher(
  projectPath: string,
  onChange: (state: ProjectContextState) => void,
): void {
  if (projectPath === currentProjectPath && onChange === currentHandler) return;

  stopProjectContextWatcher();
  currentProjectPath = projectPath;
  currentHandler = onChange;

  watchFile(path.join(projectPath, 'CLAUDE.md'));
  watchFile(path.join(projectPath, 'CALDER.shared.md'));
  watchFile(path.join(projectPath, '.mcp.json'));
  watchDir(path.join(projectPath, '.calder', 'rules'));
}
