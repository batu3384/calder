import type { IpcRenderer } from 'electron';

export interface PreloadMcpApi {
  connect(id: string, url: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
  disconnect(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
  listTools(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
  listResources(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
  listPrompts(id: string): Promise<{ success: boolean; data?: unknown; error?: string }>;
  callTool(
    id: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }>;
  readResource(
    id: string,
    uri: string,
  ): Promise<{ success: boolean; data?: unknown; error?: string }>;
  getPrompt(
    id: string,
    name: string,
    args: Record<string, string>,
  ): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export function createPreloadMcpApi(ipcRenderer: IpcRenderer): PreloadMcpApi {
  return {
    connect: (id: string, url: string) => ipcRenderer.invoke('mcp:connect', id, url),
    disconnect: (id: string) => ipcRenderer.invoke('mcp:disconnect', id),
    listTools: (id: string) => ipcRenderer.invoke('mcp:listTools', id),
    listResources: (id: string) => ipcRenderer.invoke('mcp:listResources', id),
    listPrompts: (id: string) => ipcRenderer.invoke('mcp:listPrompts', id),
    callTool: (id: string, name: string, args: Record<string, unknown>) =>
      ipcRenderer.invoke('mcp:callTool', id, name, args),
    readResource: (id: string, uri: string) => ipcRenderer.invoke('mcp:readResource', id, uri),
    getPrompt: (id: string, name: string, args: Record<string, string>) =>
      ipcRenderer.invoke('mcp:getPrompt', id, name, args),
  };
}
