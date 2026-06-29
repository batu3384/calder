import { BrowserWindow, ipcMain } from 'electron';

import type { ProviderId } from '../shared/types/provider';
import { requireKnownProjectPath as requireKnownProjectPathFromPolicy } from './ipc-path-policy';
import { getAllProviderMetas, getProvider, getProviderMeta } from './providers/registry';
import { buildHandoffPrompt } from './providers/resume-handoff';

interface ProviderIpcOps {
  requireKnownProjectPath?: (projectPath: string, contextLabel: string) => string;
}

export function registerProviderIpcHandlers(ops: ProviderIpcOps = {}): void {
  const requireKnownProjectPath = ops.requireKnownProjectPath ?? requireKnownProjectPathFromPolicy;

  ipcMain.handle(
    'provider:getConfig',
    async (_event, providerId: ProviderId, projectPath: string) => {
      const validatedProjectPath = requireKnownProjectPath(projectPath, 'Load provider config');
      const provider = getProvider(providerId);
      return provider.getConfig(validatedProjectPath);
    },
  );

  // Backward compatibility alias
  ipcMain.handle('claude:getConfig', async (_event, projectPath: string) => {
    const validatedProjectPath = requireKnownProjectPath(projectPath, 'Load Claude config');
    const provider = getProvider('claude');
    return provider.getConfig(validatedProjectPath);
  });

  ipcMain.on('config:watchProject', (_event, providerId: ProviderId, projectPath: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    let validatedProjectPath: string;
    try {
      validatedProjectPath = requireKnownProjectPath(projectPath, 'Watch provider config');
    } catch (error) {
      console.warn('Skipped config:watchProject for unknown project path:', {
        providerId,
        projectPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const provider = getProvider(providerId);
    provider.startConfigWatcher?.(win, validatedProjectPath);

    // Ensure old watchers are cleaned up when the window closes
    // to prevent fs.watch/fs.watchFile resource leaks.
    const cleanup = (): void => {
      provider.stopConfigWatcher?.();
    };
    win.once('closed', cleanup);
  });

  ipcMain.handle('provider:getMeta', (_event, providerId: ProviderId) => {
    return getProviderMeta(providerId);
  });

  ipcMain.handle('provider:listProviders', () => {
    return getAllProviderMetas();
  });

  ipcMain.handle(
    'session:buildResumeWithPrompt',
    async (
      _event,
      sourceProviderId: ProviderId,
      sourceCliSessionId: string | null,
      projectPath: string,
      sessionName: string,
    ) => {
      const validatedProjectPath = requireKnownProjectPath(
        projectPath,
        'Build session handoff prompt',
      );
      const sourceProvider = getProvider(sourceProviderId);
      const fromProviderLabel = sourceProvider.meta.displayName;
      let transcriptPath: string | null = null;
      if (sourceCliSessionId && sourceProvider.getTranscriptPath) {
        try {
          transcriptPath = sourceProvider.getTranscriptPath(
            sourceCliSessionId,
            validatedProjectPath,
          );
        } catch (error) {
          console.warn('getTranscriptPath failed:', error);
        }
      }
      return buildHandoffPrompt({ fromProviderLabel, sessionName, transcriptPath });
    },
  );

  ipcMain.handle('provider:checkBinary', (_event, providerId: ProviderId = 'claude') => {
    const provider = getProvider(providerId);
    return provider.validatePrerequisites();
  });
}
