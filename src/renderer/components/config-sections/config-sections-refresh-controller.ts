import type { ProviderId } from '../../types.js';

type AppStateEvent = 'project-changed' | 'state-loaded' | 'session-changed' | 'preferences-changed';
type QueueFrame = (callback: FrameRequestCallback) => number;

interface ConfigSectionsRefreshControllerOptions {
  refresh: () => void | Promise<void>;
  applyVisibility: () => void;
  getActiveProjectPath: () => string | undefined;
  getProviderId: () => ProviderId;
  watchProject: (providerId: ProviderId, projectPath: string) => void;
  onConfigChanged: (listener: () => void) => void;
  onAppStateEvent: (event: AppStateEvent, listener: () => void) => void;
  queueFrame?: QueueFrame;
}

export interface ConfigSectionsRefreshController {
  beginRefresh: () => number;
  isCurrentGeneration: (generation: number) => boolean;
  scheduleRefresh: () => void;
  watchActiveProject: () => void;
  init: () => void;
}

const defaultQueueFrame: QueueFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (callback: FrameRequestCallback): number => globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number;

export function createConfigSectionsRefreshController(
  options: ConfigSectionsRefreshControllerOptions,
): ConfigSectionsRefreshController {
  const queueFrame = options.queueFrame ?? defaultQueueFrame;
  let refreshGeneration = 0;
  let refreshQueued = false;

  const scheduleRefresh = (): void => {
    if (refreshQueued) {
      return;
    }
    refreshQueued = true;
    queueFrame(() => {
      refreshQueued = false;
      void options.refresh();
    });
  };

  const watchActiveProject = (): void => {
    const projectPath = options.getActiveProjectPath();
    if (!projectPath) {
      return;
    }
    options.watchProject(options.getProviderId(), projectPath);
  };

  const init = (): void => {
    options.onAppStateEvent('project-changed', () => { watchActiveProject(); scheduleRefresh(); });
    options.onAppStateEvent('state-loaded', () => { watchActiveProject(); scheduleRefresh(); });
    options.onAppStateEvent('session-changed', () => { watchActiveProject(); scheduleRefresh(); });
    options.onAppStateEvent('preferences-changed', () => {
      options.applyVisibility();
      scheduleRefresh();
    });
    options.onConfigChanged(() => scheduleRefresh());
  };

  return {
    beginRefresh: () => ++refreshGeneration,
    isCurrentGeneration: (generation: number) => generation === refreshGeneration,
    scheduleRefresh,
    watchActiveProject,
    init,
  };
}
