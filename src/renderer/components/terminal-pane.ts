import { Terminal } from '@xterm/xterm';
import { SearchAddon } from '@xterm/addon-search';
import { removeSession } from './surface-services/session-activity.js';
import { removeSession as removeCostSession, type CostInfo } from '../session-cost.js';
import { removeSession as removeContextSession, type ContextWindowInfo } from '../session-context.js';
import type { ProviderId } from '../types.js';
import { getProviderCapabilities, getProviderDisplayName } from './surface-services/provider-availability.js';
import {
  activateOscLink,
  activateWebLink,
  bindTerminalLinkPointerHandlers,
  clearTerminalLinkDispatch,
} from './terminal-pane-links.js';
import {
  attachTerminalInstanceToContainer,
  clearFocusedTerminalInstances,
  fitTerminalInstance,
  hideTerminalInstance,
  setFocusedTerminalInstance,
  showTerminalInstance,
} from './terminal-pane-instance-dom.js';
import { clearPendingPromptTimer, deliverPrompt } from './terminal-pane-prompt-delivery.js';
import {
  clearSpawnFailureOverlay,
  formatSpawnFailureMessage,
  showSpawnFailureOverlay,
} from './terminal-pane-spawn-overlay.js';
import {
  bindTerminalInputAndFocusHandlers,
  createTerminalCore,
  registerTerminalLinkProviders,
} from './terminal-pane-runtime.js';
import { spawnPtySession } from './terminal-pane-spawn-session.js';
import { renderContextDisplay, renderCostDisplay, revealSessionStatusBar } from './terminal-pane-status.js';

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: ReturnType<typeof createTerminalCore>['fitAddon'];
  searchAddon: SearchAddon;
  element: HTMLDivElement;
  sessionId: string;
  projectPath: string;
  cliSessionId: string | null;
  providerId: ProviderId;
  args: string;
  isResume: boolean;
  wasResumed: boolean;
  spawned: boolean;
  exited: boolean;
  pendingPrompt: string | null;
  pendingPromptTimer: ReturnType<typeof setTimeout> | null;
}

const instances = new Map<string, TerminalInstance>();
let focusedSessionId: string | null = null;

function workspaceLabel(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

interface CreateTerminalShellParams {
  sessionId: string;
  projectPath: string;
  providerId: ProviderId;
  effectiveIsResume: boolean;
  caps: ReturnType<typeof getProviderCapabilities>;
}

interface TerminalShellElements {
  element: HTMLDivElement;
  xtermWrap: HTMLDivElement;
}

function createTerminalShell(params: CreateTerminalShellParams): TerminalShellElements {
  const { sessionId, projectPath, providerId, effectiveIsResume, caps } = params;

  const element = document.createElement('div');
  element.className = 'terminal-pane hidden';
  element.dataset.sessionId = sessionId;

  const chrome = document.createElement('div');
  chrome.className = 'terminal-pane-chrome';

  const providerBadge = document.createElement('div');
  providerBadge.className = 'terminal-pane-provider';
  providerBadge.dataset.provider = providerId;
  providerBadge.textContent = getProviderDisplayName(providerId);

  const headerCopy = document.createElement('div');
  headerCopy.className = 'terminal-pane-header-copy';

  const workspace = document.createElement('div');
  workspace.className = 'terminal-pane-title terminal-pane-workspace';
  workspace.textContent = workspaceLabel(projectPath);

  const meta = document.createElement('div');
  meta.className = 'terminal-pane-meta';
  meta.textContent = effectiveIsResume ? 'Restored terminal surface' : 'Live terminal surface';

  headerCopy.appendChild(workspace);
  headerCopy.appendChild(meta);

  const sessionState = document.createElement('div');
  sessionState.className = 'terminal-pane-session';
  sessionState.textContent = effectiveIsResume ? 'linked run' : 'active run';

  chrome.appendChild(providerBadge);
  chrome.appendChild(headerCopy);
  chrome.appendChild(sessionState);
  element.appendChild(chrome);

  const xtermWrap = document.createElement('div');
  xtermWrap.className = 'xterm-wrap';
  element.appendChild(xtermWrap);

  const statusBar = document.createElement('div');
  statusBar.className = 'session-status-bar';
  const contextIndicator = document.createElement('div');
  contextIndicator.className = 'context-indicator';
  const costDisplay = document.createElement('div');
  costDisplay.className = 'cost-display';
  if (caps?.costTracking !== false) {
    costDisplay.textContent = '$0.0000';
  } else {
    costDisplay.classList.add('hidden');
  }
  contextIndicator.classList.toggle('hidden', caps?.contextWindow === false);
  statusBar.appendChild(contextIndicator);
  statusBar.appendChild(costDisplay);
  element.appendChild(statusBar);

  return { element, xtermWrap };
}

export function createTerminalPane(
  sessionId: string,
  projectPath: string,
  cliSessionId: string | null,
  isResume: boolean = false,
  args: string = '',
  providerId: ProviderId = 'claude',
  projectId?: string
): TerminalInstance {
  if (instances.has(sessionId)) {
    return instances.get(sessionId)!;
  }

  const caps = getProviderCapabilities(providerId);
  const effectiveIsResume = isResume && !!cliSessionId && caps?.sessionResume !== false;
  const { element, xtermWrap } = createTerminalShell({
    sessionId,
    projectPath,
    providerId,
    effectiveIsResume,
    caps,
  });
  const { terminal, fitAddon, searchAddon } = createTerminalCore({
    sessionId,
    projectPath,
    activateOscLink: (event, uri) => {
      activateOscLink(terminal, sessionId, uri, projectPath, event);
    },
    activateWebLink: (event, url) => {
      activateWebLink(terminal, sessionId, url, projectPath, event);
    },
  });
  bindTerminalLinkPointerHandlers(terminal, xtermWrap, sessionId, projectPath);
  bindTerminalInputAndFocusHandlers({
    terminal,
    element,
    sessionId,
    writePtyData: (targetSessionId, data) => {
      window.calder.pty.write(targetSessionId, data);
    },
    setFocused,
    getFocusedSessionId: () => focusedSessionId,
  });

  const instance: TerminalInstance = {
    terminal,
    fitAddon,
    searchAddon,
    element,
    sessionId,
    projectPath,
    cliSessionId,
    providerId,
    args,
    isResume: effectiveIsResume,
    wasResumed: effectiveIsResume,
    spawned: false,
    exited: false,
    pendingPrompt: null,
    pendingPromptTimer: null,
  };

  instances.set(sessionId, instance);
  registerTerminalLinkProviders({
    terminal,
    projectPath,
    projectId,
    getRemoteUrl: (targetProjectPath) => window.calder.git.getRemoteUrl(targetProjectPath),
  });
  return instance;
}

export function getTerminalInstance(sessionId: string): TerminalInstance | undefined {
  return instances.get(sessionId);
}

export function setPendingPrompt(sessionId: string, prompt: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.pendingPrompt = prompt;
  }
}

export async function spawnTerminal(sessionId: string): Promise<void> {
  const instance = instances.get(sessionId);
  if (!instance || instance.spawned) return;

  instance.spawned = true;
  instance.exited = false;

  // Remove any exit overlay
  clearSpawnFailureOverlay(instance.element);
  try {
    await spawnPtySession(instance);
  } catch (error) {
    // Keep restore/startup failures non-fatal so one broken session does not crash the whole UI.
    instance.spawned = false;
    instance.exited = true;
    showSpawnFailureOverlay({
      element: instance.element,
      sessionId: instance.sessionId,
      details: formatSpawnFailureMessage(error),
      onRetry: spawnTerminal,
    });
    console.error(`[terminal-pane] Failed to spawn terminal session ${sessionId}`, error);
  }
}

export async function deliverPromptToTerminalSession(sessionId: string, prompt: string): Promise<boolean> {
  const instance = instances.get(sessionId);
  if (!instance) return false;

  await deliverPrompt({
    session: instance,
    prompt,
    setPendingPrompt,
    spawnSession: spawnTerminal,
  });
  return true;
}

export function attachToContainer(sessionId: string, container: HTMLElement): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  attachTerminalInstanceToContainer(instance, container);
}

export function showPane(sessionId: string, split: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  showTerminalInstance(instance, split);
}

export function hideAllPanes(): void {
  for (const [, instance] of instances) {
    hideTerminalInstance(instance);
  }
}

export function fitTerminal(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  fitTerminalInstance(sessionId, instance, (targetSessionId, cols, rows) => {
    window.calder.pty.resize(targetSessionId, cols, rows);
  });
}

export function fitAllVisible(): void {
  for (const [sessionId, instance] of instances) {
    if (!instance.element.classList.contains('hidden')) {
      fitTerminal(sessionId);
    }
  }
}

export function getSearchAddon(sessionId: string): SearchAddon | undefined {
  return instances.get(sessionId)?.searchAddon;
}

export function getFocusedSessionId(): string | null {
  return focusedSessionId;
}

export function clearFocused(): void {
  focusedSessionId = null;
  clearFocusedTerminalInstances(instances);
}

export function setFocused(sessionId: string): void {
  focusedSessionId = sessionId;
  setFocusedTerminalInstance(sessionId, instances);
}

export function handlePtyData(sessionId: string, data: string): void {
  const instance = instances.get(sessionId);
  if (instance) {
    instance.terminal.write(data);
  }
}

export function destroyTerminal(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance) return;

  clearPendingPromptTimer(instance);
  window.calder.pty.kill(sessionId);
  instance.terminal.dispose();
  instance.element.remove();
  instances.delete(sessionId);
  clearTerminalLinkDispatch(sessionId);
  removeSession(sessionId);
  removeCostSession(sessionId);
  removeContextSession(sessionId);
}

export function updateCostDisplay(sessionId: string, cost: CostInfo): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (getProviderCapabilities(instance.providerId)?.costTracking === false) return;
  const el = instance.element.querySelector('.cost-display');
  if (!el) return;

  renderCostDisplay(el, cost);
  revealSessionStatusBar(instance.element);
}

export function updateContextDisplay(sessionId: string, info: ContextWindowInfo): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (getProviderCapabilities(instance.providerId)?.contextWindow === false) return;
  const el = instance.element.querySelector('.context-indicator') as HTMLElement | null;
  if (!el) return;

  renderContextDisplay(el, info);
  revealSessionStatusBar(instance.element);
}
