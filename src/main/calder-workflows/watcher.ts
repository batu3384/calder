import path from 'node:path';

import type { ProjectWorkflowState } from '../../shared/types/project-workflow.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectWorkflows } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectWorkflowState>({
  watchDirs: (projectPath) => [path.join(projectPath, '.calder', 'workflows')],
  discover: discoverProjectWorkflows,
});

export function stopProjectWorkflowWatcher(): void {
  watcher.stopAll();
}

export function startProjectWorkflowWatcher(
  projectPath: string,
  onChange: (state: ProjectWorkflowState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
