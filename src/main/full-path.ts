import { execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

import { isWin, pathSep } from './platform';

/**
 * Get the full PATH by sourcing the user's login shell.
 * When Electron is launched from macOS Finder/Dock, process.env.PATH
 * is minimal (/usr/bin:/bin:/usr/sbin:/sbin) and misses nvm, homebrew, etc.
 * We resolve this once by running a login shell to get the real PATH.
 */
let cachedFullPath: string | null = null;

export function getFullPath(): string {
  if (cachedFullPath) return cachedFullPath;

  const currentPath = process.env.PATH || '';

  if (isWin) {
    // On Windows, PATH is generally correct — just ensure npm/appdata dirs are present
    const home = os.homedir();
    const extraDirs = [
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, '.local', 'bin'),
    ];
    const pathSet = new Set(currentPath.split(pathSep));
    for (const dir of extraDirs) {
      pathSet.add(dir);
    }
    cachedFullPath = Array.from(pathSet).join(pathSep);
    return cachedFullPath;
  }

  const shell = process.env.SHELL || '/bin/zsh';

  // Try to get the real PATH from a login shell
  try {
    const shellPath = execSync(`${shell} -ilc 'echo __PATH__=$PATH'`, {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, HOME: os.homedir() },
    });
    const match = shellPath.match(/__PATH__=(.+)/);
    if (match && match[1]) {
      cachedFullPath = match[1].trim();
      return cachedFullPath;
    }
  } catch (err) { console.warn('Failed to resolve PATH from login shell:', err); }

  // Fallback: merge current PATH with common directories
  const home = os.homedir();
  const extraDirs = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    '/usr/local/sbin',
    '/opt/homebrew/sbin',
  ];

  const pathSet = new Set(currentPath.split(pathSep));
  for (const dir of extraDirs) {
    pathSet.add(dir);
  }
  cachedFullPath = Array.from(pathSet).join(pathSep);
  return cachedFullPath;
}
