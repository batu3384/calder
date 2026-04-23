import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { removeSession } from '../session-activity.js';
import { removeSession as removeCostSession, type CostInfo } from '../session-cost.js';
import { removeSession as removeContextSession, type ContextWindowInfo } from '../session-context.js';
import type { ProviderId } from '../types.js';
import { getProviderCapabilities, getProviderDisplayName } from '../provider-availability.js';
import { FilePathLinkProvider, GithubLinkProvider } from './terminal-link-provider.js';
import {
  activateOscLink,
  activateWebLink,
  bindTerminalLinkPointerHandlers,
  clearTerminalLinkDispatch,
} from './terminal-pane-links.js';
import { clearPendingPromptTimer, deliverPrompt } from './terminal-pane-prompt-delivery.js';
import {
  clearSpawnFailureOverlay,
  formatSpawnFailureMessage,
  showSpawnFailureOverlay,
} from './terminal-pane-spawn-overlay.js';
import { spawnPtySession } from './terminal-pane-spawn-session.js';
import { renderContextDisplay, renderCostDisplay, revealSessionStatusBar } from './terminal-pane-status.js';
import { attachClipboardCopyHandler } from './terminal-utils.js';

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
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

interface TerminalCore {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

function createTerminalCore(sessionId: string, projectPath: string): TerminalCore {
  const terminal = new Terminal({
    theme: {
      background: '#000000',
      foreground: '#e0e0e0',
      cursor: '#e94560',
      selectionBackground: '#ff6b85a6',
      black: '#000000',
      red: '#e94560',
      green: '#0f9b58',
      yellow: '#f4b400',
      blue: '#4285f4',
      magenta: '#ab47bc',
      cyan: '#00acc1',
      white: '#e0e0e0',
    },
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace",
    cursorBlink: true,
    allowProposedApi: true,
    linkHandler: {
      activate: (event, uri) => {
        activateOscLink(terminal, sessionId, uri, projectPath, event);
      },
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  terminal.loadAddon(new WebLinksAddon((event, url) => {
    activateWebLink(terminal, sessionId, url, projectPath, event);
  }));

  return { terminal, fitAddon, searchAddon };
}

function bindTerminalInputAndFocusHandlers(
  terminal: Terminal,
  element: HTMLDivElement,
  sessionId: string,
): void {
  // Send CSI u encoding for Shift+Enter so Claude CLI treats it as newline
  attachClipboardCopyHandler(terminal, (e) => {
    if (e.shiftKey && e.key === 'Enter') {
      if (e.type === 'keydown') window.calder.pty.write(sessionId, '\x1b[13;2u');
      e.preventDefault();
      return false;
    }
  });

  // Handle user input → PTY
  terminal.onData((data) => {
    window.calder.pty.write(sessionId, data);
  });

  // Focus tracking
  element.addEventListener('mousedown', () => {
    setFocused(sessionId);
  });
  terminal.onData(() => {
    if (focusedSessionId !== sessionId) {
      setFocused(sessionId);
    }
  });
}

function registerTerminalLinkProviders(terminal: Terminal, projectPath: string, projectId?: string): void {
  // Register file path link provider for Cmd+Click
  if (projectId) {
    terminal.registerLinkProvider(new FilePathLinkProvider(projectId, terminal));
  }

  // Register GitHub #123 link provider
  window.calder.git.getRemoteUrl(projectPath).then((repoUrl) => {
    if (repoUrl) {
      terminal.registerLinkProvider(new GithubLinkProvider(repoUrl, terminal));
    }
  });
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
  const { terminal, fitAddon, searchAddon } = createTerminalCore(sessionId, projectPath);
  bindTerminalLinkPointerHandlers(terminal, xtermWrap, sessionId, projectPath);
  bindTerminalInputAndFocusHandlers(terminal, element, sessionId);

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
  registerTerminalLinkProviders(terminal, projectPath, projectId);
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

  const xtermWrap = instance.element.querySelector('.xterm-wrap')!;
  if (!xtermWrap.querySelector('.xterm')) {
    container.appendChild(instance.element);
    instance.terminal.open(xtermWrap as HTMLElement);

    // Try WebGL, fall back silently
    try {
      const webglAddon = new WebglAddon();
      instance.terminal.loadAddon(webglAddon);
    } catch {
      // WebGL not available, software renderer works fine
    }
  } else {
    // Always re-append to ensure correct DOM order (appendChild moves existing children)
    container.appendChild(instance.element);
  }
}

export function showPane(sessionId: string, split: boolean): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  instance.element.classList.remove('hidden');
  if (split) {
    instance.element.classList.add('split');
  } else {
    instance.element.classList.remove('split');
  }
}

export function hideAllPanes(): void {
  for (const [, instance] of instances) {
    instance.element.classList.add('hidden');
    instance.element.classList.remove('swarm-dimmed', 'swarm-unread');
  }
}

export function fitTerminal(sessionId: string): void {
  const instance = instances.get(sessionId);
  if (!instance || instance.element.classList.contains('hidden')) return;

  try {
    instance.fitAddon.fit();
    const { cols, rows } = instance.terminal;
    window.calder.pty.resize(sessionId, cols, rows);
  } catch {
    // Element not yet visible
  }
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
  for (const [, instance] of instances) {
    instance.element.classList.remove('focused');
  }
}

export function setFocused(sessionId: string): void {
  focusedSessionId = sessionId;

  // Only move DOM focus if it's currently on a session terminal (or nothing).
  // This prevents stealing focus from the project terminal panel, search bar, modals, etc.
  const activeEl = document.activeElement;
  const shouldFocusTerminal =
    !activeEl ||
    activeEl === document.body ||
    !!activeEl.closest('.terminal-pane');

  for (const [id, instance] of instances) {
    if (id === sessionId) {
      instance.element.classList.add('focused');
      if (shouldFocusTerminal) {
        instance.terminal.focus();
      }
    } else {
      instance.element.classList.remove('focused');
    }
  }
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
