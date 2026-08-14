import fs from 'node:fs';

export interface ProjectDirWatcherOptions<T> {
  debounceMs?: number;
  watchDirs: (projectPath: string) => string[];
  discover: (projectPath: string) => Promise<T>;
  recursive?: boolean;
  ignoreDiscoverErrors?: boolean;
}

interface WatchState<T> {
  callbacks: Set<(state: T) => void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  dirWatchers: fs.FSWatcher[];
}

export function createProjectDirWatcher<T>(options: ProjectDirWatcherOptions<T>): {
  start(projectPath: string, onChange: (state: T) => void): () => void;
  stopAll(): void;
} {
  const debounceMs = options.debounceMs ?? 500;
  const states = new Map<string, WatchState<T>>();

  function notify(projectPath: string): void {
    const state = states.get(projectPath);
    if (!state) return;
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(async () => {
      const activeState = states.get(projectPath);
      if (!activeState || activeState !== state) return;
      const publish = async (): Promise<void> => {
        const nextState = await options.discover(projectPath);
        const latestState = states.get(projectPath);
        if (!latestState || latestState !== state) return;
        for (const callback of latestState.callbacks) {
          callback(nextState);
        }
      };
      if (options.ignoreDiscoverErrors) {
        try {
          await publish();
        } catch {
          // Watchers are best-effort; explicit refresh still works through IPC.
        }
        return;
      }
      await publish();
    }, debounceMs);
  }

  function watchDir(projectPath: string, state: WatchState<T>, dirPath: string): void {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      const listener = () => notify(projectPath);
      let watcher: fs.FSWatcher;
      if (options.recursive) {
        try {
          watcher = fs.watch(dirPath, { recursive: true }, listener);
        } catch {
          watcher = fs.watch(dirPath, listener);
        }
      } else {
        watcher = fs.watch(dirPath, listener);
      }
      if (typeof watcher.on === 'function') {
        watcher.on('error', () => {});
      }
      state.dirWatchers.push(watcher);
    } catch {
      // Directory may not exist yet; that is fine for v1.
    }
  }

  function teardown(projectPath: string): void {
    const state = states.get(projectPath);
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
    states.delete(projectPath);
  }

  function ensure(projectPath: string): WatchState<T> {
    const existing = states.get(projectPath);
    if (existing) return existing;
    const state: WatchState<T> = {
      callbacks: new Set(),
      debounceTimer: null,
      dirWatchers: [],
    };
    states.set(projectPath, state);
    for (const dirPath of options.watchDirs(projectPath)) {
      watchDir(projectPath, state, dirPath);
    }
    return state;
  }

  return {
    start(projectPath, onChange) {
      const state = ensure(projectPath);
      if (!state.callbacks.has(onChange)) {
        state.callbacks.add(onChange);
      }
      return () => {
        const activeState = states.get(projectPath);
        if (!activeState) return;
        activeState.callbacks.delete(onChange);
        if (activeState.callbacks.size === 0) {
          teardown(projectPath);
        }
      };
    },
    stopAll() {
      for (const projectPath of Array.from(states.keys())) {
        teardown(projectPath);
      }
    },
  };
}
