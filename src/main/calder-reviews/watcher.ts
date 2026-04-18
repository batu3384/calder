import fs from 'node:fs';
import path from 'node:path';
import type { ProjectReviewState } from '../../shared/types.js';
import { discoverProjectReviews } from './discovery.js';

const DEBOUNCE_MS = 500;

interface ReviewWatchState {
  callbacks: Set<(state: ProjectReviewState) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

const reviewWatchStates = new Map<string, ReviewWatchState>();

function notify(projectPath: string): void {
  const state = reviewWatchStates.get(projectPath);
  if (!state) return;
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(async () => {
    const activeState = reviewWatchStates.get(projectPath);
    if (!activeState || activeState !== state) return;
    const nextState = await discoverProjectReviews(projectPath);
    const latestState = reviewWatchStates.get(projectPath);
    if (!latestState || latestState !== state) return;
    for (const callback of latestState.callbacks) {
      callback(nextState);
    }
  }, DEBOUNCE_MS);
}

function watchDir(projectPath: string, state: ReviewWatchState, dirPath: string): void {
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
  const state = reviewWatchStates.get(projectPath);
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
  reviewWatchStates.delete(projectPath);
}

function ensureProjectWatchState(projectPath: string): ReviewWatchState {
  const existing = reviewWatchStates.get(projectPath);
  if (existing) return existing;

  const state: ReviewWatchState = {
    callbacks: new Set(),
    debounceTimer: null,
    dirWatchers: [],
  };
  reviewWatchStates.set(projectPath, state);
  watchDir(projectPath, state, path.join(projectPath, '.calder', 'reviews'));
  return state;
}

export function stopProjectReviewWatcher(): void {
  for (const projectPath of Array.from(reviewWatchStates.keys())) {
    teardownProjectWatchState(projectPath);
  }
}

export function startProjectReviewWatcher(
  projectPath: string,
  onChange: (state: ProjectReviewState) => void,
): () => void {
  const state = ensureProjectWatchState(projectPath);
  if (!state.callbacks.has(onChange)) {
    state.callbacks.add(onChange);
  }

  return () => {
    const activeState = reviewWatchStates.get(projectPath);
    if (!activeState) return;
    activeState.callbacks.delete(onChange);
    if (activeState.callbacks.size === 0) {
      teardownProjectWatchState(projectPath);
    }
  };
}
