import fs from 'node:fs';
import path from 'node:path';
import type { ProjectGovernanceState } from '../../shared/types.js';
import { discoverProjectGovernance } from './discovery.js';

const DEBOUNCE_MS = 500;

interface GovernanceWatchState {
  callbacks: Set<(state: ProjectGovernanceState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const governanceWatchStates = new Map<string, GovernanceWatchState>();

function notify(projectPath: string): void {
  const state = governanceWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = governanceWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectGovernance(projectPath);
    const latestState = governanceWatchStates.get(projectPath);
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: GovernanceWatchState, dirPath: string): void {
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
  const state = governanceWatchStates.get(projectPath);
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
  governanceWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): GovernanceWatchState {
  const existing = governanceWatchStates.get(projectPath);
  if (existing) return existing;

  const state: GovernanceWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  governanceWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder'));
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'governance'));
  return state;
}

export function stopProjectGovernanceWatcher(): void {
  for (const projectPath of Array.from(governanceWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectGovernanceWatcher(
  projectPath: string,
  onChange: (state: ProjectGovernanceState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = governanceWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
