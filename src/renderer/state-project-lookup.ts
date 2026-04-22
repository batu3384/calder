import type { ProjectRecord } from '../shared/types/project.js';

function normalizePathForProjectLookup(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

export function findProjectForPath(
  projects: ProjectRecord[],
  inputPath: string | null | undefined,
): ProjectRecord | undefined {
  if (!inputPath) return undefined;
  const target = normalizePathForProjectLookup(inputPath);
  let bestMatch: ProjectRecord | undefined;
  let bestLength = -1;

  for (const project of projects) {
    const projectPath = normalizePathForProjectLookup(project.path);
    if (target !== projectPath && !target.startsWith(`${projectPath}/`)) {
      continue;
    }
    if (projectPath.length > bestLength) {
      bestMatch = project;
      bestLength = projectPath.length;
    }
  }

  return bestMatch;
}
