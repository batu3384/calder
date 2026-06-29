import type { IpcRenderer } from 'electron';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadGitApi {
  getStatus(path: string): Promise<unknown>;
  getFiles(path: string): Promise<unknown>;
  getDiff(path: string, file: string, area: string): Promise<string>;
  getWorktrees(path: string): Promise<unknown>;
  getRemoteUrl(path: string): Promise<string | null>;
  stageFile(path: string, file: string): Promise<void>;
  unstageFile(path: string, file: string): Promise<void>;
  discardFile(path: string, file: string, area: string): Promise<void>;
  openInEditor(path: string, file: string): Promise<void>;
  listBranches(path: string): Promise<{ name: string; current: boolean }[]>;
  checkoutBranch(path: string, branch: string): Promise<void>;
  createBranch(path: string, branch: string): Promise<void>;
  watchProject(path: string): void;
  onChanged(callback: () => void): () => void;
}

export function createPreloadGitApi(ipcRenderer: IpcRenderer, onChannel: OnChannel): PreloadGitApi {
  return {
    getStatus: (path) => ipcRenderer.invoke('git:getStatus', path),
    getFiles: (path) => ipcRenderer.invoke('git:getFiles', path),
    getDiff: (path: string, file: string, area: string) =>
      ipcRenderer.invoke('git:getDiff', path, file, area),
    getWorktrees: (path: string) => ipcRenderer.invoke('git:getWorktrees', path),
    getRemoteUrl: (path: string) => ipcRenderer.invoke('git:getRemoteUrl', path),
    stageFile: (path: string, file: string) => ipcRenderer.invoke('git:stageFile', path, file),
    unstageFile: (path: string, file: string) => ipcRenderer.invoke('git:unstageFile', path, file),
    discardFile: (path: string, file: string, area: string) =>
      ipcRenderer.invoke('git:discardFile', path, file, area),
    openInEditor: (path: string, file: string) =>
      ipcRenderer.invoke('git:openInEditor', path, file),
    listBranches: (path: string) => ipcRenderer.invoke('git:listBranches', path),
    checkoutBranch: (path: string, branch: string) =>
      ipcRenderer.invoke('git:checkoutBranch', path, branch),
    createBranch: (path: string, branch: string) =>
      ipcRenderer.invoke('git:createBranch', path, branch),
    watchProject: (path: string) => ipcRenderer.send('git:watchProject', path),
    onChanged: (callback: () => void) => onChannel('git:changed', callback),
  };
}
