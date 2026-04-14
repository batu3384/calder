export function toProjectRelativeContextPath(projectPath: string, sourcePath: string): string | null {
  if (!projectPath || !sourcePath) return null;

  if (sourcePath === projectPath) {
    return '';
  }

  const normalizedProject = projectPath.replace(/[\\/]+$/, '');
  const prefixes = [`${normalizedProject}/`, `${normalizedProject}\\`];
  const matchedPrefix = prefixes.find((prefix) => sourcePath.startsWith(prefix));
  if (!matchedPrefix) {
    return null;
  }

  return sourcePath.slice(matchedPrefix.length).replace(/\\/g, '/');
}
