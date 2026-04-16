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

const PROJECT_CONTEXT_FILES = [
  'CLAUDE.md',
  'CLAUDE.local.md',
  path.join('.claude', 'CLAUDE.md'),
  'AGENTS.md',
  'GEMINI.md',
  'QWEN.md',
  path.join('.github', 'copilot-instructions.md'),
  'CALDER.shared.md',
  '.mcp.json',
] as const;

function notify(): void {
  if (!currentProjectPath || !currentHandler) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const projectPath = currentProjectPath;
    const handler = currentHandler;
    if (!projectPath || !handler) return;
    const nextState = await discoverProjectContext(projectPath);
    // Ignore stale async callbacks that complete after watcher teardown
    // or a project/handler switch.
    if (projectPath !== currentProjectPath || handler !== currentHandler) return;
    handler(nextState);
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

function listSubdirectoriesRecursive(dirPath: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    const directories: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dirPath, entry.name);
      directories.push(fullPath);
      directories.push(...listSubdirectoriesRecursive(fullPath));
    }
    return directories;
  } catch {
    return [];
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

  for (const relativePath of PROJECT_CONTEXT_FILES) {
    watchFile(path.join(projectPath, relativePath));
  }

  watchDir(path.join(projectPath, '.calder', 'rules'));
  watchDir(path.join(projectPath, '.claude'));
  watchDir(path.join(projectPath, '.github'));
  const copilotInstructionsPath = path.join(projectPath, '.github', 'instructions');
  watchDir(copilotInstructionsPath);
  for (const childDirPath of listSubdirectoriesRecursive(copilotInstructionsPath)) {
    watchDir(childDirPath);
  }
}
