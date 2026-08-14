import path from 'node:path';

import type { ProjectCheckpointState } from '../../shared/types/project-checkpoint.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectCheckpoints } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectCheckpointState>({
  watchDirs: (projectPath) => [path.join(projectPath, '.calder', 'checkpoints')],
  discover: discoverProjectCheckpoints,
});

export function stopProjectCheckpointWatcher(): void {
  watcher.stopAll();
}

export function startProjectCheckpointWatcher(
  projectPath: string,
  onChange: (state: ProjectCheckpointState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
