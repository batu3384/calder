import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTeamContextState } from '../../shared/types/project.js';
import { discoverProjectTeamContext } from './discovery.js';

const DEBOUNCE_MS = 80;

interface TeamContextWatchState {
  callbacks: Set<(state: ProjectTeamContextState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const teamContextWatchStates = new Map<string, TeamContextWatchState>();

function notify(projectPath: string): void {
  const state = teamContextWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = teamContextWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    try {
      const nextState = await discoverProjectTeamContext(projectPath);
      const latestState = teamContextWatchStates.get(projectPath);
      if (!latestState || latestState !== state) return;
      for (const callback of latestState.callbacks) {
        callback(nextState);
      }
    } catch {
      // Watchers are best-effort; explicit refresh still works through IPC.
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: TeamContextWatchState, dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    try {
      state.dirWatchers.push(fs.watch(dirPath, { recursive: true }, () => notify(projectPath)));
    } catch {
      // Some platforms do not support recursive directory watching.
      // Fall back to a standard watch so top-level changes still refresh.
      state.dirWatchers.push(fs.watch(dirPath, () => notify(projectPath)));
    }
  } catch {
    // Some platforms do not support recursive watches for every directory.
  }
}

function teardownProjectWatchState(projectPath: string): void {
  const state = teamContextWatchStates.get(projectPath);
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
  teamContextWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): TeamContextWatchState {
  const existing = teamContextWatchStates.get(projectPath);
  if (existing) return existing;

  const state: TeamContextWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  teamContextWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'team'));
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'rules'));
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'workflows'));
  return state;
}

export function stopProjectTeamContextWatcher(): void {
  for (const projectPath of Array.from(teamContextWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectTeamContextWatcher(
  projectPath: string,
  onChange: (state: ProjectTeamContextState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = teamContextWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
