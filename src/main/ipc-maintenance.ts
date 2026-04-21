import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import type { ProviderId, SettingsValidationResult } from '../shared/types/provider';
import { checkForUpdates, quitAndInstall } from './auto-updater';
import { getProvider } from './providers/registry';
import { isTrackingHealthy } from '../shared/tracking-health';

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

  ipcMain.handle('settings:reinstall', (_event, providerId: ProviderId = 'claude') => {
    try {
      const provider = getProvider(providerId);
      provider.reinstallSettings();
      const validation = provider.validateSettings();
      return { success: isTrackingHealthy(provider.meta, validation) };
    } catch (error) {
      console.error('settings:reinstall failed:', error);
      return { success: false };
    }
  });

  ipcMain.handle('settings:validate', (_event, providerId: ProviderId = 'claude'): SettingsValidationResult => {
    const provider = getProvider(providerId);
    return provider.validateSettings();
  });
}
