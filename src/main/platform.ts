/**
 * Centralized platform detection and derived constants for the main process.
 *
 * Import `isWin`/`isMac` from here instead of inlining
 * `process.platform === 'win32'` or redefining `isWin` locally. This keeps
 * platform-conditional logic discoverable and prevents drift across modules.
 */

export const isWin = process.platform === 'win32';
export const isMac = process.platform === 'darwin';

/** PATH environment variable separator. */
export const pathSep = isWin ? ';' : ':';

/** Command used to resolve a binary on PATH. */
export const whichCmd = isWin ? 'where' : 'which';

/** Python interpreter used by hook scripts. */
export const pythonBin = isWin ? 'python' : '/usr/bin/python3';
