import fs from 'node:fs';
import path from 'node:path';
import type { ProjectCheckpointState } from '../../shared/types.js';
import { discoverProjectCheckpoints } from './discovery.js';

const DEBOUNCE_MS = 500;

interface CheckpointWatchState {
  callbacks: Set<(state: ProjectCheckpointState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const checkpointWatchStates = new Map<string, CheckpointWatchState>();

function notify(projectPath: string): void {
  const state = checkpointWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = checkpointWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectCheckpoints(projectPath);
    const latestState = checkpointWatchStates.get(projectPath);
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: CheckpointWatchState, dirPath: string): void {
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
  const state = checkpointWatchStates.get(projectPath);
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
  checkpointWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): CheckpointWatchState {
  const existing = checkpointWatchStates.get(projectPath);
  if (existing) return existing;

  const state: CheckpointWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  checkpointWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'checkpoints'));
  return state;
}

export function stopProjectCheckpointWatcher(): void {
  for (const projectPath of Array.from(checkpointWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectCheckpointWatcher(
  projectPath: string,
  onChange: (state: ProjectCheckpointState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = checkpointWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
