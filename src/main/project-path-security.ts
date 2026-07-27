import * as fs from 'fs';
import * as path from 'path';

function tryRealpath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

/**
 * Resolve a user-supplied relative path and ensure it stays inside the project root.
 * Existing targets are realpath'd so symlink escape cannot leave the project.
 */
export function resolvePathWithinProject(projectPath: string, relativePath: string): string {
  const resolvedProjectPath = tryRealpath(path.resolve(projectPath));
  const resolvedTarget = path.resolve(resolvedProjectPath, relativePath);
  const relative = path.relative(resolvedProjectPath, resolvedTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes project root');
  }

  try {
    const realTarget = fs.realpathSync(resolvedTarget);
    const realRelative = path.relative(resolvedProjectPath, realTarget);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw new Error('Path escapes project root');
    }
    return realTarget;
  } catch (error) {
    if (error instanceof Error && error.message === 'Path escapes project root') {
      throw error;
    }
    // Missing target: ensure nearest existing ancestor stays inside the project.
    let parent = path.dirname(resolvedTarget);
    while (parent.startsWith(resolvedProjectPath)) {
      try {
        const realParent = fs.realpathSync(parent);
        const parentRelative = path.relative(resolvedProjectPath, realParent);
        if (parentRelative.startsWith('..') || path.isAbsolute(parentRelative)) {
          throw new Error('Path escapes project root');
        }
        break;
      } catch (parentError) {
        if (parentError instanceof Error && parentError.message === 'Path escapes project root') {
          throw parentError;
        }
        const next = path.dirname(parent);
        if (next === parent) break;
        parent = next;
      }
    }
    return resolvedTarget;
  }
}

/** True when filePath is outside projectPath (lexical + realpath when resolvable). */
export function pathEscapesProject(
  filePath: string | null | undefined,
  projectPath: string | null | undefined,
): boolean {
  if (!filePath || !projectPath) return true;
  try {
    const relative = path.isAbsolute(filePath)
      ? path.relative(tryRealpath(path.resolve(projectPath)), tryRealpath(path.resolve(filePath)))
      : path.relative(
          tryRealpath(path.resolve(projectPath)),
          resolvePathWithinProject(projectPath, filePath),
        );
    return relative.startsWith('..') || path.isAbsolute(relative);
  } catch {
    return true;
  }
}

/** Resolve a relative path for project writes; rejects symlink escape outside the project root. */
export function projectWritePath(projectPath: string, relativePath: string): string {
  return resolvePathWithinProject(projectPath, relativePath);
}
