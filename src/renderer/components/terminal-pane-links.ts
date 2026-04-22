import type { Terminal } from '@xterm/xterm';
import { resolveNavigableHttpUrl, shouldDispatchLinkOpen, type LinkDispatchSnapshot } from '../link-routing.js';

const lastTerminalLinkDispatchBySession = new Map<string, LinkDispatchSnapshot>();
const INLINE_URL_PATTERN = /(https?:\/\/[^\s<>()\[\]{}"']+|(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)(?::\d+)?(?:[/?#][^\s<>()\[\]{}"']*)?)/ig;

function clearDomSelection(terminal: Terminal): void {
  try {
    terminal.clearSelection();
  } catch {}
  window.getSelection?.()?.removeAllRanges?.();
}

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

function suppressPointerEvent(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  (event as MouseEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
}

export function activateOscLink(
  terminal: Terminal,
  sessionId: string,
  uri: string,
  projectPath: string,
  event: MouseEvent,
): void {
  event.preventDefault?.();
  event.stopPropagation?.();
  clearDomSelection(terminal);
  openTerminalWebLink(sessionId, uri, 'osc-link', projectPath);
}

export function activateWebLink(
  terminal: Terminal,
  sessionId: string,
  url: string,
  projectPath: string,
  event: MouseEvent,
): void {
  event.preventDefault?.();
  event.stopPropagation?.();
  clearDomSelection(terminal);
  openTerminalWebLink(sessionId, url, 'web-link', projectPath);
}

export function bindTerminalLinkPointerHandlers(
  terminal: Terminal,
  xtermWrap: HTMLDivElement,
  sessionId: string,
  projectPath: string,
): void {
  let suppressLinkDragSelection = false;

  xtermWrap.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 0) return;
    // Clear stale suppression from a previous link click before evaluating
    // the current pointer target.
    suppressLinkDragSelection = false;
    const candidate = findInlineUrlAtPointer(terminal, xtermWrap, event) ?? extractUrlFromEventTarget(event);
    if (!candidate) return;
    suppressLinkDragSelection = true;
    suppressPointerEvent(event);
    clearDomSelection(terminal);
  }, { capture: true });

  xtermWrap.addEventListener('mousemove', (event: MouseEvent) => {
    if (!suppressLinkDragSelection) return;
    if ((event.buttons & 1) !== 1) {
      suppressLinkDragSelection = false;
      return;
    }
    suppressPointerEvent(event);
    clearDomSelection(terminal);
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
    clearDomSelection(terminal);
    openTerminalWebLink(sessionId, candidate, 'web-link', projectPath);
  }, { capture: true });
}

export function clearTerminalLinkDispatch(sessionId: string): void {
  lastTerminalLinkDispatchBySession.delete(sessionId);
}
