import type { IpcRenderer } from 'electron';

import type {
  CliProviderMeta,
  ProviderConfig,
  ProviderId,
  ProviderUpdateCancelResult,
  ProviderUpdateProgressEvent,
  ProviderUpdateSummary,
} from '../shared/types/provider';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadProviderApi {
  getConfig(providerId: ProviderId, projectPath: string): Promise<ProviderConfig>;
  getMeta(providerId: ProviderId): Promise<CliProviderMeta>;
  listProviders(): Promise<CliProviderMeta[]>;
  checkBinary(providerId?: ProviderId): Promise<{ ok: boolean; message: string }>;
  updateAll(): Promise<ProviderUpdateSummary>;
  updateProvider(providerId: ProviderId): Promise<ProviderUpdateSummary>;
  installProvider(providerId: ProviderId): Promise<ProviderUpdateSummary>;
  cancelUpdateAll(): Promise<ProviderUpdateCancelResult>;
  onUpdateProgress(callback: (event: ProviderUpdateProgressEvent) => void): () => void;
  watchProject(providerId: ProviderId, projectPath: string): void;
  onConfigChanged(callback: () => void): () => void;
}

export function createPreloadProviderApi(
  ipcRenderer: IpcRenderer,
  onChannel: OnChannel,
): PreloadProviderApi {
  return {
    getConfig: (providerId, projectPath) =>
      ipcRenderer.invoke('provider:getConfig', providerId, projectPath),
    getMeta: (providerId) => ipcRenderer.invoke('provider:getMeta', providerId),
    listProviders: () => ipcRenderer.invoke('provider:listProviders'),
    checkBinary: (providerId) => ipcRenderer.invoke('provider:checkBinary', providerId || 'claude'),
    updateAll: () => ipcRenderer.invoke('provider:updateAll'),
    updateProvider: (providerId) => ipcRenderer.invoke('provider:updateProvider', providerId),
    installProvider: (providerId) => ipcRenderer.invoke('provider:installProvider', providerId),
    cancelUpdateAll: () => ipcRenderer.invoke('provider:cancelUpdateAll'),
    onUpdateProgress: (callback) =>
      onChannel('provider:update-progress', (event) =>
        callback(event as ProviderUpdateProgressEvent),
      ),
    watchProject: (providerId, projectPath) =>
      ipcRenderer.send('config:watchProject', providerId, projectPath),
    onConfigChanged: (callback) => onChannel('config:changed', callback),
  };
}
