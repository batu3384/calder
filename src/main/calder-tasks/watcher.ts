import path from 'node:path';

import type { ProjectBackgroundTaskState } from '../../shared/types/project-background-task.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectBackgroundTasks } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectBackgroundTaskState>({
  watchDirs: (projectPath) => [path.join(projectPath, '.calder', 'tasks')],
  discover: discoverProjectBackgroundTasks,
});

export function stopProjectBackgroundTaskWatcher(): void {
  watcher.stopAll();
}

export function startProjectBackgroundTaskWatcher(
  projectPath: string,
  onChange: (state: ProjectBackgroundTaskState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
