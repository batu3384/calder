import * as os from 'os';
import * as path from 'path';

import { isMac, isWin } from './platform';
import { loadState } from './store';

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

type AllowedReadPathRule = {
  value: string;
  kind: 'file' | 'dir';
};

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
  const allowedPaths: AllowedReadPathRule[] = [
    { value: path.join(home, '.claude.json'), kind: 'file' },
    { value: path.join(home, '.mcp.json'), kind: 'file' },
    { value: path.join(home, '.claude'), kind: 'dir' },
    { value: path.join(home, '.codex'), kind: 'dir' },
    { value: path.join(home, '.copilot'), kind: 'dir' },
    { value: path.join(home, '.qwen'), kind: 'dir' },
    { value: path.join(home, '.gemini'), kind: 'dir' },
  ];

  if (isMac) {
    allowedPaths.push({ value: '/Library/Application Support/ClaudeCode', kind: 'dir' });
  } else if (isWin) {
    allowedPaths.push({ value: 'C:\\Program Files\\ClaudeCode', kind: 'dir' });
  } else {
    allowedPaths.push({ value: '/etc/claude-code', kind: 'dir' });
  }

  return allowedPaths.some((rule) => {
    if (rule.kind === 'file') {
      return resolvedPath === rule.value;
    }
    return isWithinPrefix(resolvedPath, rule.value);
  });
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
