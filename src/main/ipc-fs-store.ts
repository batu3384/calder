import { execSync } from 'child_process';
import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import type { FsReadFileResult } from '../shared/types/fs-read';
import {
  setFileWatcherWindow,
  unwatchFile as unwatchFileForChanges,
  watchFile as watchFileForChanges,
} from './file-watcher';
import { expandUserPath } from './fs-utils';
import { loadState, type PersistedState, saveState } from './store';

/** Maximum file size for fs:readFile (10 MiB). */
export const FS_READ_FILE_MAX_BYTES = 10 * 1024 * 1024;

interface FsStorePolicy {
  isAllowedDirectoryLookupPath: (resolvedPath: string) => boolean;
  isAllowedReadPath: (resolvedPath: string) => boolean;
  isWithinKnownProject: (resolvedPath: string) => boolean;
  sanitizePersistedStateForSave: (state: unknown) => PersistedState;
}

export function registerFsStoreIpcHandlers(policy: FsStorePolicy): void {
  ipcMain.handle('fs:isDirectory', (_event, filePath: string) => {
    try {
      const resolved = path.resolve(expandUserPath(filePath));
      if (!policy.isAllowedDirectoryLookupPath(resolved)) {
        console.warn(`fs:isDirectory blocked: ${resolved} is outside allowed lookup paths`);
        return false;
      }
      return fs.statSync(resolved).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('fs:expandPath', (_event, filePath: string): string => {
    return expandUserPath(filePath);
  });

  ipcMain.handle('fs:listDirs', (_event, dirPath: string, prefix?: string) => {
    try {
      const resolved = path.resolve(expandUserPath(dirPath));
      if (!policy.isAllowedDirectoryLookupPath(resolved)) {
        console.warn(`fs:listDirs blocked: ${resolved} is outside allowed lookup paths`);
        return [];
      }
      const lowerPrefix = prefix?.toLowerCase().trim();
      // Avoid broad directory enumeration outside known project roots.
      if (!policy.isWithinKnownProject(resolved) && !lowerPrefix) {
        return [];
      }
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      return entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            (!lowerPrefix || entry.name.toLowerCase().startsWith(lowerPrefix)),
        )
        .map((entry) => path.join(resolved, entry.name))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 20);
    } catch {
      return [];
    }
  });

  ipcMain.handle('store:load', () => {
    return loadState();
  });

  ipcMain.handle('store:save', (_event, state: unknown) => {
    const sanitizedState = policy.sanitizePersistedStateForSave(state);
    saveState(sanitizedState);
  });

  ipcMain.handle('fs:listFiles', (_event, cwd: string, query: string) => {
    try {
      const resolvedCwd = path.resolve(cwd);
      if (!policy.isWithinKnownProject(resolvedCwd)) {
        return [];
      }
      let files: string[];
      try {
        const output = execSync('git ls-files --cached --others --exclude-standard', {
          cwd: resolvedCwd,
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        files = output.split('\n').filter(Boolean);
      } catch {
        // Not a git repo — fallback to recursive readdir with depth limit
        files = [];
        const IGNORE = new Set([
          'node_modules',
          '.git',
          'dist',
          'build',
          'coverage',
          '.next',
          '__pycache__',
        ]);
        const MAX_DEPTH = 5;
        const MAX_FILES = 5000;
        function walk(dir: string, depth: number): void {
          if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;
          let entries: fs.Dirent[];
          try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            if (files.length >= MAX_FILES) return;
            if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;
            const rel = path.relative(resolvedCwd, path.join(dir, entry.name));
            if (entry.isDirectory()) {
              walk(path.join(dir, entry.name), depth + 1);
            } else {
              files.push(rel);
            }
          }
        }
        walk(resolvedCwd, 0);
      }

      if (query) {
        const lower = query.toLowerCase();
        const exact: string[] = [];
        const startsWith: string[] = [];
        const nameContains: string[] = [];
        const pathContains: string[] = [];
        for (const filePath of files) {
          const fileName = path.basename(filePath).toLowerCase();
          if (fileName === lower) exact.push(filePath);
          else if (fileName.startsWith(lower)) startsWith.push(filePath);
          else if (fileName.includes(lower)) nameContains.push(filePath);
          else if (filePath.toLowerCase().includes(lower)) pathContains.push(filePath);
        }
        files = [...exact, ...startsWith, ...nameContains, ...pathContains];
      }
      return files.slice(0, 50);
    } catch (error) {
      console.warn('fs:listFiles failed:', error);
      return [];
    }
  });

  ipcMain.handle('fs:readFile', (_event, filePath: string): FsReadFileResult => {
    try {
      const resolved = path.resolve(filePath);
      if (!policy.isAllowedReadPath(resolved)) {
        console.warn(`fs:readFile blocked: ${resolved} is not within an allowed path`);
        return {
          ok: false,
          reason: 'blocked',
          message: 'Path is not within an allowed read location',
        };
      }
      let size = 0;
      try {
        size = fs.statSync(resolved).size;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return { ok: false, reason: 'not-found', message: 'File does not exist' };
        }
        throw error;
      }
      if (size > FS_READ_FILE_MAX_BYTES) {
        console.warn(
          `fs:readFile blocked: ${resolved} exceeds ${FS_READ_FILE_MAX_BYTES} bytes (${size})`,
        );
        return {
          ok: false,
          reason: 'too-large',
          message: `File exceeds ${FS_READ_FILE_MAX_BYTES} bytes`,
        };
      }
      return { ok: true, content: fs.readFileSync(resolved, 'utf-8') };
    } catch (error) {
      console.warn('fs:readFile failed:', error);
      const message = error instanceof Error ? error.message : 'Read failed';
      return { ok: false, reason: 'read-error', message };
    }
  });

  ipcMain.on('fs:watchFile', (event, filePath: string) => {
    const resolved = path.resolve(filePath);
    if (!policy.isAllowedReadPath(resolved)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) setFileWatcherWindow(win);
    watchFileForChanges(resolved);
  });

  ipcMain.on('fs:unwatchFile', (_event, filePath: string) => {
    const resolved = path.resolve(filePath);
    unwatchFileForChanges(resolved);
  });
}
