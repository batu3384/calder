import fs from 'node:fs';
import path from 'node:path';
import type { ProjectBackgroundTaskState } from '../../shared/types.js';
import { discoverProjectBackgroundTasks } from './discovery.js';

const DEBOUNCE_MS = 500;

interface BackgroundTaskWatchState {
  callbacks: Set<(state: ProjectBackgroundTaskState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const backgroundTaskWatchStates = new Map<string, BackgroundTaskWatchState>();

function notify(projectPath: string): void {
  const state = backgroundTaskWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = backgroundTaskWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectBackgroundTasks(projectPath);
    const latestState = backgroundTaskWatchStates.get(projectPath);
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: BackgroundTaskWatchState, dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const watcher = fs.watch(dirPath, () => notify(projectPath));
    watcher.on('error', () => {});
    state.dirWatchers.push(watcher);
  } catch {
    // Directory may not exist yet; that is fine for v1.
  }
}

function teardownProjectWatchState(projectPath: string): void {
  const state = backgroundTaskWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  for (const watcher of state.dirWatchers) {
    watcher.close();
  }
  state.dirWatchers = [];
  state.callbacks.clear();
  backgroundTaskWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): BackgroundTaskWatchState {
  const existing = backgroundTaskWatchStates.get(projectPath);
  if (existing) return existing;

  const state: BackgroundTaskWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  backgroundTaskWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'tasks'));
  return state;
}

export function stopProjectBackgroundTaskWatcher(): void {
  for (const projectPath of Array.from(backgroundTaskWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectBackgroundTaskWatcher(
  projectPath: string,
  onChange: (state: ProjectBackgroundTaskState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = backgroundTaskWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
