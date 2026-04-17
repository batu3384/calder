import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { initSession, removeSession } from '../session-activity.js';
import { markFreshSession } from '../session-insights.js';
import { isEstimatedCost, removeSession as removeCostSession, type CostInfo } from '../session-cost.js';
import { removeSession as removeContextSession, type ContextWindowInfo } from '../session-context.js';
import type { ProviderId } from '../types.js';
import { getProviderCapabilities } from '../provider-availability.js';
import { FilePathLinkProvider, GithubLinkProvider } from './terminal-link-provider.js';
import { attachClipboardCopyHandler } from './terminal-utils.js';
import { resolveNavigableHttpUrl, shouldDispatchLinkOpen, type LinkDispatchSnapshot } from '../link-routing.js';

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
const lastTerminalLinkDispatchBySession = new Map<string, LinkDispatchSnapshot>();
const INLINE_URL_PATTERN = /(https?:\/\/[^\s<>()\[\]{}"']+|(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)(?::\d+)?(?:[/?#][^\s<>()\[\]{}"']*)?)/ig;

function openTerminalWebLink(sessionId: string, url: string, source: LinkDispatchSnapshot['source'], cwd?: string): void {
  const normalizedUrl = resolveNavigableHttpUrl(url);
  if (!normalizedUrl) return;
  const now = Date.now();
  const lastDispatch = lastTerminalLinkDispatchBySession.get(sessionId) ?? null;
  if (!shouldDispatchLinkOpen(normalizedUrl, lastDispatch, source, now)) return;
  lastTerminalLinkDispatchBySession.set(sessionId, { url: normalizedUrl, at: now, source });
  void window.calder.app.openExternal(normalizedUrl, cwd);
}

function findInlineUrlAtPointer(terminal: Terminal, host: HTMLElement, event: MouseEvent): string | null {
  if (terminal.cols <= 0 || terminal.rows <= 0) return null;
  const rect = host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (event.clientX < rect.left || event.clientX > rect.right) return null;
  if (event.clientY < rect.top || event.clientY > rect.bottom) return null;

  const col = Math.max(0, Math.min(
    terminal.cols - 1,
    Math.floor((event.clientX - rect.left) / (rect.width / terminal.cols)),
  ));
  const row = Math.max(0, Math.min(
    terminal.rows - 1,
    Math.floor((event.clientY - rect.top) / (rect.height / terminal.rows)),
  ));

  const lineIndex = terminal.buffer.active.viewportY + row;
  const line = terminal.buffer.active.getLine(lineIndex);
  if (!line) return null;
  const text = line.translateToString(true);
  if (!text) return null;

  INLINE_URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_URL_PATTERN.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length - 1;
    if (col >= start && col <= end) {
      return match[0];
    }
  }

  return null;
}

function extractUrlFromEventTarget(event: MouseEvent): string | null {
  const maybeTarget = event.target as {
    closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
  } | null;
  if (!maybeTarget?.closest) return null;
  const anchor = maybeTarget.closest('a[href]');
  if (!anchor?.getAttribute) return null;
  const href = anchor.getAttribute('href');
  return typeof href === 'string' && href.trim().length > 0 ? href : null;
}

function providerDisplayName(providerId: ProviderId): string {
  switch (providerId) {
    case 'codex': return 'Codex CLI';
    case 'claude': return 'Claude Code';
    case 'copilot': return 'GitHub Copilot';
    case 'gemini': return 'Gemini CLI';
    case 'qwen': return 'Qwen Code';
    case 'minimax': return 'MiniMax CLI';
    case 'blackbox': return 'Blackbox CLI';
    default: return providerId;
  }
}

function workspaceLabel(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
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

  const element = document.createElement('div');
  element.className = 'terminal-pane hidden';
  element.dataset.sessionId = sessionId;

  const chrome = document.createElement('div');
  chrome.className = 'terminal-pane-chrome';

  const providerBadge = document.createElement('div');
  providerBadge.className = 'terminal-pane-provider';
  providerBadge.dataset.provider = providerId;
  providerBadge.textContent = providerDisplayName(providerId);

  const headerCopy = document.createElement('div');
  headerCopy.className = 'terminal-pane-header-copy';

  const workspace = document.createElement('div');
  workspace.className = 'terminal-pane-title terminal-pane-workspace';
  workspace.textContent = workspaceLabel(projectPath);

  const meta = document.createElement('div');
  meta.className = 'terminal-pane-meta';
  meta.textContent = isResume ? 'Restored terminal surface' : 'Live terminal surface';

  headerCopy.appendChild(workspace);
  headerCopy.appendChild(meta);

  const sessionState = document.createElement('div');
  sessionState.className = 'terminal-pane-session';
  sessionState.textContent = isResume ? 'linked run' : 'active run';

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
  const caps = getProviderCapabilities(providerId);
  if (caps?.costTracking !== false) {
    costDisplay.textContent = '$0.0000';
  } else {
    costDisplay.classList.add('hidden');
  }
  contextIndicator.classList.toggle('hidden', caps?.contextWindow === false);
  statusBar.appendChild(contextIndicator);
  statusBar.appendChild(costDisplay);
  element.appendChild(statusBar);

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
        event.preventDefault?.();
        event.stopPropagation?.();
        try { terminal.clearSelection(); } catch {}
        window.getSelection?.()?.removeAllRanges?.();
        openTerminalWebLink(sessionId, uri, 'osc-link', projectPath);
      },
    },
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  terminal.loadAddon(new WebLinksAddon((event, url) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    try { terminal.clearSelection(); } catch {}
    window.getSelection?.()?.removeAllRanges?.();
    openTerminalWebLink(sessionId, url, 'web-link', projectPath);
  }));

  let suppressLinkDragSelection = false;
  const clearPointerSelection = (): void => {
    try { terminal.clearSelection(); } catch {}
    window.getSelection?.()?.removeAllRanges?.();
  };
  const suppressPointerEvent = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    (event as MouseEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
  };

  xtermWrap.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 0) return;
    // Clear stale suppression from a previous link click before evaluating
    // the current pointer target.
    suppressLinkDragSelection = false;
    const candidate = findInlineUrlAtPointer(terminal, xtermWrap, event) ?? extractUrlFromEventTarget(event);
    if (!candidate) return;
    suppressLinkDragSelection = true;
    suppressPointerEvent(event);
    clearPointerSelection();
  }, { capture: true });
  xtermWrap.addEventListener('mousemove', (event: MouseEvent) => {
    if (!suppressLinkDragSelection) return;
    if ((event.buttons & 1) !== 1) {
      suppressLinkDragSelection = false;
      return;
    }
    suppressPointerEvent(event);
    clearPointerSelection();
  }, { capture: true });
  xtermWrap.addEventListener('mouseup', () => {
    suppressLinkDragSelection = false;
  }, { capture: true });
  xtermWrap.addEventListener('mouseleave', () => {
    suppressLinkDragSelection = false;
  }, { capture: true });
  xtermWrap.addEventListener('click', (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const candidate = findInlineUrlAtPointer(terminal, xtermWrap, event) ?? extractUrlFromEventTarget(event);
    if (!candidate) return;
    suppressPointerEvent(event);
    clearPointerSelection();
    openTerminalWebLink(sessionId, candidate, 'web-link', projectPath);
  }, { capture: true });

  // Send CSI u encoding for Shift+Enter so Claude CLI treats it as newline
  attachClipboardCopyHandler(terminal, (e) => {
    if (e.shiftKey && e.key === 'Enter') {
      if (e.type === 'keydown') window.calder.pty.write(sessionId, '\x1b[13;2u');
      e.preventDefault();
      return false;
    }
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
    isResume,
    wasResumed: isResume,
    spawned: false,
    exited: false,
    pendingPrompt: null,
    pendingPromptTimer: null,
  };

  instances.set(sessionId, instance);

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

function buildBracketedPastePayload(prompt: string): string {
  return `\u001b[200~${prompt}\u001b[201~\r`;
}

function clearPendingPromptTimer(instance: TerminalInstance): void {
  if (instance.pendingPromptTimer) {
    clearTimeout(instance.pendingPromptTimer);
    instance.pendingPromptTimer = null;
  }
}


export async function spawnTerminal(sessionId: string): Promise<void> {
  const instance = instances.get(sessionId);
  if (!instance || instance.spawned) return;

  instance.spawned = true;
  instance.exited = false;

  // Remove any exit overlay
  const overlay = instance.element.querySelector('.terminal-exit-overlay');
  if (overlay) overlay.remove();

  if (!instance.isResume) {
    markFreshSession(sessionId);
  }
  initSession(sessionId);
  let initialPrompt: string | undefined;
  if (instance.pendingPrompt && getProviderCapabilities(instance.providerId)?.pendingPromptTrigger === 'startup-arg') {
    initialPrompt = instance.pendingPrompt;
    instance.pendingPrompt = null;
  }
  await window.calder.pty.create(sessionId, instance.projectPath, instance.cliSessionId, instance.isResume, instance.args, instance.providerId, initialPrompt);
  instance.isResume = true; // subsequent spawns (e.g. Restart Session) should resume
}

export async function deliverPromptToTerminalSession(sessionId: string, prompt: string): Promise<boolean> {
  const instance = instances.get(sessionId);
  if (!instance) return false;

  if (!instance.spawned) {
    setPendingPrompt(sessionId, prompt);
    await spawnTerminal(sessionId);
    return true;
  }

  window.calder.pty.write(sessionId, buildBracketedPastePayload(prompt));
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
  lastTerminalLinkDispatchBySession.delete(sessionId);
  removeSession(sessionId);
  removeCostSession(sessionId);
  removeContextSession(sessionId);
}

function formatTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function showStatusBar(instance: TerminalInstance): void {
  const bar = instance.element.querySelector('.session-status-bar');
  if (bar) bar.classList.remove('hidden');
}

export function updateCostDisplay(sessionId: string, cost: CostInfo): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (getProviderCapabilities(instance.providerId)?.costTracking === false) return;
  const el = instance.element.querySelector('.cost-display');
  if (!el) return;

  const estimatedPrefix = isEstimatedCost(cost) ? 'Estimated · ' : '';
  const costStr = `$${cost.totalCostUsd.toFixed(4)}`;
  const modelPrefix = cost.model ? `${cost.model}  \u00b7  ` : '';
  if (cost.totalInputTokens > 0 || cost.totalOutputTokens > 0) {
    el.textContent = `${modelPrefix}${estimatedPrefix}${costStr}  \u00b7  ${formatTokens(cost.totalInputTokens)} in / ${formatTokens(cost.totalOutputTokens)} out`;
    const durationSec = (cost.totalDurationMs / 1000).toFixed(1);
    const apiDurationSec = (cost.totalApiDurationMs / 1000).toFixed(1);
    const estimateNote = isEstimatedCost(cost) ? 'Estimated from terminal output · ' : '';
    (el as HTMLElement).title = `${estimateNote}Cache read: ${formatTokens(cost.cacheReadTokens)} · Cache create: ${formatTokens(cost.cacheCreationTokens)} · Duration: ${durationSec}s · API: ${apiDurationSec}s`;
  } else {
    el.textContent = `${modelPrefix}${estimatedPrefix}${costStr}`;
    (el as HTMLElement).title = isEstimatedCost(cost) ? 'Estimated from terminal output' : '';
  }
  showStatusBar(instance);
}

export function updateContextDisplay(sessionId: string, info: ContextWindowInfo): void {
  const instance = instances.get(sessionId);
  if (!instance) return;
  if (getProviderCapabilities(instance.providerId)?.contextWindow === false) return;
  const el = instance.element.querySelector('.context-indicator') as HTMLElement | null;
  if (!el) return;

  const pct = Math.min(Math.round(info.usedPercentage), 100);
  const filledCount = Math.round(pct / 10);
  const emptyCount = 10 - filledCount;
  const bar = '=' .repeat(filledCount) + '-'.repeat(emptyCount);
  const tokenStr = formatTokens(info.totalTokens);

  el.textContent = `[${bar}] ${pct}% ${tokenStr} tokens`;
  el.title = `${info.totalTokens.toLocaleString()} / ${info.contextWindowSize.toLocaleString()} tokens`;

  el.classList.remove('warning', 'critical');
  if (pct >= 90) {
    el.classList.add('critical');
  } else if (pct >= 70) {
    el.classList.add('warning');
  }

  showStatusBar(instance);
}
