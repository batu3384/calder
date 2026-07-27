import { ipcMain } from 'electron';

import type { ProviderId } from '../shared/types/provider';
import { requireKnownProjectPath as requireKnownProjectPathFromPolicy } from './ipc-path-policy';
import { getAllProviderMetas, getProvider, getProviderMeta } from './providers/registry';
import { clearPrereqCheckCache } from './providers/resolve-binary';
import { buildHandoffPrompt } from './providers/resume-handoff';

interface ProviderIpcOps {
  requireKnownProjectPath?: (projectPath: string, contextLabel: string) => string;
}

export function registerProviderIpcHandlers(ops: ProviderIpcOps = {}): void {
  const requireKnownProjectPath = ops.requireKnownProjectPath ?? requireKnownProjectPathFromPolicy;

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
    // Health refresh must re-discover binaries after external reinstalls.
    provider.clearBinaryCache();
    clearPrereqCheckCache();
    return provider.checkBinaryInstalled();
  });
}
