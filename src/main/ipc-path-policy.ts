import * as os from 'os';
import * as path from 'path';
import { loadState } from './store';
import { isMac, isWin } from './platform';

/**
 * Check if a resolved path is within one of the known project directories.
 */
export function isWithinKnownProject(resolvedPath: string): boolean {
  const state = loadState();
  return state.projects.some(p => resolvedPath.startsWith(p.path + path.sep) || resolvedPath === p.path);
}

export function requireKnownProjectPath(projectPath: string, contextLabel: string): string {
  const resolvedPath = path.resolve(projectPath);
  if (!isWithinKnownProject(resolvedPath)) {
    throw new Error(`${contextLabel} requires a known project path`);
  }
  return resolvedPath;
}

export function getActiveProjectPath(): string | undefined {
  const state = loadState();
  if (!state.activeProjectId) return undefined;
  return state.projects.find((candidate) => candidate.id === state.activeProjectId)?.path;
}

function isWithinPrefix(resolvedPath: string, prefix: string): boolean {
  return resolvedPath === prefix || resolvedPath.startsWith(prefix + path.sep);
}

/**
 * Check if a resolved path is allowed for reading:
 * within a known project directory OR a known config location.
 */
export function isAllowedReadPath(resolvedPath: string): boolean {
  // Allow files within known project directories
  if (isWithinKnownProject(resolvedPath)) {
    return true;
  }

  // Allow known config files/directories used by supported CLIs
  const home = os.homedir();
  const allowedPaths = [
    path.join(home, '.claude.json'),
    path.join(home, '.mcp.json'),
    path.join(home, '.claude') + path.sep,
    path.join(home, '.codex') + path.sep,
    path.join(home, '.copilot') + path.sep,
    path.join(home, '.qwen') + path.sep,
    path.join(home, '.mmx') + path.sep,
    path.join(home, '.blackboxcli') + path.sep,
  ];

  if (isMac) {
    allowedPaths.push('/Library/Application Support/ClaudeCode/');
  } else if (isWin) {
    allowedPaths.push('C:\\Program Files\\ClaudeCode\\');
  } else {
    allowedPaths.push('/etc/claude-code/');
  }

  return allowedPaths.some(allowed => resolvedPath === allowed || resolvedPath.startsWith(allowed));
}

export function isAllowedDirectoryLookupPath(resolvedPath: string): boolean {
  if (isAllowedReadPath(resolvedPath)) {
    return true;
  }

  const homePath = path.resolve(os.homedir());
  if (isWithinPrefix(resolvedPath, homePath)) {
    return true;
  }

  if (isMac) {
    return isWithinPrefix(resolvedPath, path.resolve('/Volumes'));
  }

  if (!isWin) {
    return isWithinPrefix(resolvedPath, path.resolve('/mnt')) || isWithinPrefix(resolvedPath, path.resolve('/media'));
  }

  return false;
}
