import path from 'node:path';

import type { ProjectGovernanceState } from '../../shared/types/governance.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectGovernance } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectGovernanceState>({
  watchDirs: (projectPath) => [
    path.join(projectPath, '.calder'),
    path.join(projectPath, '.calder', 'governance'),
  ],
  discover: discoverProjectGovernance,
});

export function stopProjectGovernanceWatcher(): void {
  watcher.stopAll();
}

export function startProjectGovernanceWatcher(
  projectPath: string,
  onChange: (state: ProjectGovernanceState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
