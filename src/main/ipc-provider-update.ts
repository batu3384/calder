import { ipcMain } from 'electron';
import type { ProviderUpdateSummary } from '../shared/types/provider';
import { updateAllProviders } from './provider-updater';

let providerUpdateAbortController: AbortController | null = null;
let providerUpdateInFlight: Promise<ProviderUpdateSummary> | null = null;

export function registerProviderUpdateIpcHandlers(): void {
  ipcMain.handle('provider:updateAll', async (event) => {
    if (providerUpdateInFlight) {
      return providerUpdateInFlight;
    }

    const abortController = new AbortController();
    providerUpdateAbortController = abortController;
    providerUpdateInFlight = updateAllProviders({
      signal: abortController.signal,
      onProgress: (progressEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('provider:update-progress', progressEvent);
        }
      },
    }).finally(() => {
      if (providerUpdateAbortController === abortController) {
        providerUpdateAbortController = null;
      }
      if (providerUpdateInFlight) {
        providerUpdateInFlight = null;
      }
    });
    return providerUpdateInFlight;
  });

  ipcMain.handle('provider:cancelUpdateAll', async () => {
    if (!providerUpdateAbortController || providerUpdateAbortController.signal.aborted) {
      return { cancelled: false };
    }
    providerUpdateAbortController.abort();
    return { cancelled: true };
  });
}
