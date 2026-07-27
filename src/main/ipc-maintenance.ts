import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';

import { checkForUpdates, quitAndInstall } from './auto-updater';

export function registerMaintenanceIpcHandlers(): void {
  ipcMain.handle('stats:getCache', () => {
    try {
      const statsPath = `${os.homedir()}/.claude/stats-cache.json`;
      const raw = fs.readFileSync(statsPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  ipcMain.handle('update:checkNow', () => checkForUpdates());
  ipcMain.handle('update:install', () => quitAndInstall());
}
