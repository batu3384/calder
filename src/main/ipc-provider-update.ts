import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';

import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateSummary,
} from '../shared/types/provider';
import { updateAllProviders, installProviderById, updateProviderById } from './provider-updater';

let providerUpdateAbortController: AbortController | null = null;
let providerUpdateInFlight: Promise<ProviderUpdateSummary> | null = null;

const VALID_PROVIDER_IDS = new Set<ProviderId>([
  'claude',
  'codex',
  'copilot',
  'antigravity',
  'qwen',
]);

function assertProviderId(providerId: unknown): asserts providerId is ProviderId {
  if (typeof providerId !== 'string' || !VALID_PROVIDER_IDS.has(providerId as ProviderId)) {
    throw new Error('Unknown CLI provider.');
  }
}

function startProviderUpdateRun(
  event: IpcMainInvokeEvent,
  runner: (
    signal: AbortSignal,
    onProgress: (progressEvent: ProviderUpdateProgressEvent) => void,
  ) => Promise<ProviderUpdateSummary>,
): Promise<ProviderUpdateSummary> {
  if (providerUpdateInFlight) {
    return providerUpdateInFlight;
  }

  const abortController = new AbortController();
  providerUpdateAbortController = abortController;
  providerUpdateInFlight = runner(abortController.signal, (progressEvent) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('provider:update-progress', progressEvent);
    }
  }).finally(() => {
    if (providerUpdateAbortController === abortController) {
      providerUpdateAbortController = null;
    }
    if (providerUpdateInFlight) {
      providerUpdateInFlight = null;
    }
  });
  return providerUpdateInFlight;
}

export function registerProviderUpdateIpcHandlers(): void {
  ipcMain.handle('provider:updateAll', async (event) => {
    return startProviderUpdateRun(event, (signal, onProgress) =>
      updateAllProviders({ signal, onProgress }),
    );
  });

  ipcMain.handle('provider:updateProvider', async (event, providerId: unknown) => {
    assertProviderId(providerId);
    return startProviderUpdateRun(event, (signal, onProgress) =>
      updateProviderById(providerId, { signal, onProgress }),
    );
  });

  ipcMain.handle('provider:installProvider', async (event, providerId: unknown) => {
    assertProviderId(providerId);
    return startProviderUpdateRun(event, (signal, onProgress) =>
      installProviderById(providerId, { signal, onProgress }),
    );
  });

  ipcMain.handle('provider:cancelUpdateAll', async () => {
    if (!providerUpdateAbortController || providerUpdateAbortController.signal.aborted) {
      return { cancelled: false };
    }
    providerUpdateAbortController.abort();
    return { cancelled: true };
  });
}
