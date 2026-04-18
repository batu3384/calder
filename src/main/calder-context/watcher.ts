import fs from 'node:fs';
import path from 'node:path';
import type { ProjectContextState } from '../../shared/types.js';
import { discoverProjectContext } from './discovery.js';

const DEBOUNCE_MS = 500;

interface WatchedFileEntry {
  filePath: string;
  listener: () => void;
}

interface ContextWatchState {
  callbacks: Set<(state: ProjectContextState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  watchedFiles: WatchedFileEntry[];
  dirWatchers: fs.FSWatcher[];
}

const contextWatchStates = new Map<string, ContextWatchState>();

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

function notify(projectPath: string): void {
  const state = contextWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = contextWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectContext(projectPath);
    const latestState = contextWatchStates.get(projectPath);
    // Ignore stale async callbacks that complete after watcher teardown.
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchFile(projectPath: string, state: ContextWatchState, filePath: string): void {
  const listener = () => notify(projectPath);
  fs.watchFile(filePath, { interval: 250 }, listener);
  state.watchedFiles.push({ filePath, listener });
}

function watchDir(projectPath: string, state: ContextWatchState, dirPath: string): void {
  try {
    const watcher = fs.watch(dirPath, () => notify(projectPath));
    watcher.on('error', () => {});
    state.dirWatchers.push(watcher);
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

function teardownProjectWatchState(projectPath: string): void {
  const state = contextWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  for (const watchedFile of state.watchedFiles) {
    fs.unwatchFile(watchedFile.filePath, watchedFile.listener);
  }
  state.watchedFiles = [];
  for (const watcher of state.dirWatchers) {
    watcher.close();
  }
  state.dirWatchers = [];
  state.callbacks.clear();
  contextWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): ContextWatchState {
  const existing = contextWatchStates.get(projectPath);
  if (existing) return existing;

  const state: ContextWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    watchedFiles: [],
    dirWatchers: [],
  };
  contextWatchStates.set(projectPath, state);

  for (const relativePath of PROJECT_CONTEXT_FILES) {
    watchFile(projectPath, state, path.join(projectPath, relativePath));
  }

  watchDir(projectPath, state, path.join(projectPath, '.calder', 'rules'));
  watchDir(projectPath, state, path.join(projectPath, '.claude'));
  watchDir(projectPath, state, path.join(projectPath, '.github'));
  const copilotInstructionsPath = path.join(projectPath, '.github', 'instructions');
  watchDir(projectPath, state, copilotInstructionsPath);
  for (const childDirPath of listSubdirectoriesRecursive(copilotInstructionsPath)) {
    watchDir(projectPath, state, childDirPath);
  }
  return state;
}

export function stopProjectContextWatcher(): void {
  for (const projectPath of Array.from(contextWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectContextWatcher(
  projectPath: string,
  onChange: (state: ProjectContextState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = contextWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
