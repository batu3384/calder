import path from 'node:path';

import type { ProjectTeamContextState } from '../../shared/types/project-team-context.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectTeamContext } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectTeamContextState>({
  debounceMs: 80,
  recursive: true,
  ignoreDiscoverErrors: true,
  watchDirs: (projectPath) => [
    path.join(projectPath, '.calder', 'team'),
    path.join(projectPath, '.calder', 'rules'),
    path.join(projectPath, '.calder', 'workflows'),
  ],
  discover: discoverProjectTeamContext,
});

export function stopProjectTeamContextWatcher(): void {
  watcher.stopAll();
}

export function startProjectTeamContextWatcher(
  projectPath: string,
  onChange: (state: ProjectTeamContextState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
