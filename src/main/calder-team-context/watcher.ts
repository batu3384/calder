import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTeamContextState } from '../../shared/types.js';
import { discoverProjectTeamContext } from './discovery.js';

export function startProjectTeamContextWatcher(
  projectPath: string,
  onChange: (state: ProjectTeamContextState) => void,
): () => void {
  const teamDir = path.join(projectPath, '.calder', 'team');
  const rulesDir = path.join(projectPath, '.calder', 'rules');
  const workflowsDir = path.join(projectPath, '.calder', 'workflows');
  const watchers: fs.FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        onChange(await discoverProjectTeamContext(projectPath));
      } catch {
        // Watchers are best-effort; explicit refresh still works through IPC.
      }
    }, 80);
  };

  for (const dirPath of [teamDir, rulesDir, workflowsDir]) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      watchers.push(fs.watch(dirPath, { recursive: true }, schedule));
    } catch {
      // Some platforms do not support recursive watches for every directory.
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}
