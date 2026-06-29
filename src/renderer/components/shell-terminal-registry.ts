import type { SearchAddon } from '@xterm/addon-search';
import type { Terminal } from '@xterm/xterm';

export interface ShellTerminalSearchInstance {
  terminal: Terminal;
  searchAddon: SearchAddon;
  element: HTMLDivElement;
  projectId: string;
  sessionId: string;
}

const shellInstancesByProjectId = new Map<string, ShellTerminalSearchInstance>();

export function registerShellTerminalInstance(
  projectId: string,
  instance: ShellTerminalSearchInstance,
): void {
  shellInstancesByProjectId.set(projectId, instance);
}

export function unregisterShellTerminalInstance(projectId: string): void {
  shellInstancesByProjectId.delete(projectId);
}

export function getShellTerminalInstance(
  sessionId: string,
): ShellTerminalSearchInstance | undefined {
  const projectId = sessionId.replace('shell-', '');
  return shellInstancesByProjectId.get(projectId);
}
