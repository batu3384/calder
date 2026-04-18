import fs from 'node:fs';
import path from 'node:path';
import type { ProjectWorkflowState } from '../../shared/types.js';
import { discoverProjectWorkflows } from './discovery.js';

const DEBOUNCE_MS = 500;

interface WorkflowWatchState {
  callbacks: Set<(state: ProjectWorkflowState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const workflowWatchStates = new Map<string, WorkflowWatchState>();

function notify(projectPath: string): void {
  const state = workflowWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = workflowWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectWorkflows(projectPath);
    const latestState = workflowWatchStates.get(projectPath);
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: WorkflowWatchState, dirPath: string): void {
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
  const state = workflowWatchStates.get(projectPath);
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
  workflowWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): WorkflowWatchState {
  const existing = workflowWatchStates.get(projectPath);
  if (existing) return existing;

  const state: WorkflowWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  workflowWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'workflows'));
  return state;
}

export function stopProjectWorkflowWatcher(): void {
  for (const projectPath of Array.from(workflowWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectWorkflowWatcher(
  projectPath: string,
  onChange: (state: ProjectWorkflowState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = workflowWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
