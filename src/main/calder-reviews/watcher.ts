import path from 'node:path';

import type { ProjectReviewState } from '../../shared/types/project-review.js';
import { createProjectDirWatcher } from '../calder-watch/create-project-dir-watcher.js';
import { discoverProjectReviews } from './discovery.js';

const watcher = createProjectDirWatcher<ProjectReviewState>({
  watchDirs: (projectPath) => [path.join(projectPath, '.calder', 'reviews')],
  discover: discoverProjectReviews,
});

export function stopProjectReviewWatcher(): void {
  watcher.stopAll();
}

export function startProjectReviewWatcher(
  projectPath: string,
  onChange: (state: ProjectReviewState) => void,
): () => void {
  return watcher.start(projectPath, onChange);
}
