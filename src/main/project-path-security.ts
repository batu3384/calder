import * as path from 'path';

/** Resolve a user-supplied relative path and ensure it stays inside the project root. */
export function resolvePathWithinProject(projectPath: string, relativePath: string): string {
  const resolvedProjectPath = path.resolve(projectPath);
  const resolvedTarget = path.resolve(resolvedProjectPath, relativePath);
  const relative = path.relative(resolvedProjectPath, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes project root');
  }
  return resolvedTarget;
}
