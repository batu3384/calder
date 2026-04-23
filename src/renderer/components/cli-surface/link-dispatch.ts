import type { Terminal } from '@xterm/xterm';
import { resolveNavigableHttpUrl, shouldDispatchLinkOpen, type LinkDispatchSnapshot } from '../surface-services/link-routing.js';

const lastCliSurfaceLinkDispatchByProject = new Map<string, LinkDispatchSnapshot>();
const INLINE_URL_PATTERN = /(https?:\/\/[^\s<>()\[\]{}"']+|(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)(?::\d+)?(?:[/?#][^\s<>()\[\]{}"']*)?)/ig;

export function openCliSurfaceWebLink(
  projectId: string,
  url: string,
  source: LinkDispatchSnapshot['source'],
  cwd: string | undefined,
  openExternal: (url: string, cwd?: string) => void | Promise<void>,
): void {
  const normalizedUrl = resolveNavigableHttpUrl(url);
  if (!normalizedUrl) return;
  const now = Date.now();
  const lastDispatch = lastCliSurfaceLinkDispatchByProject.get(projectId) ?? null;
  if (!shouldDispatchLinkOpen(normalizedUrl, lastDispatch, source, now)) return;
  lastCliSurfaceLinkDispatchByProject.set(projectId, { url: normalizedUrl, at: now, source });
  void openExternal(normalizedUrl, cwd);
}

export function clearCliSurfaceLinkDispatch(projectId: string): void {
  lastCliSurfaceLinkDispatchByProject.delete(projectId);
}

export function findInlineUrlAtPointer(terminal: Terminal, host: HTMLElement, event: MouseEvent): string | null {
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

export function extractUrlFromEventTarget(event: MouseEvent): string | null {
  const maybeTarget = event.target as {
    closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
  } | null;
  if (!maybeTarget?.closest) return null;
  const anchor = maybeTarget.closest('a[href]');
  if (!anchor?.getAttribute) return null;
  const href = anchor.getAttribute('href');
  return typeof href === 'string' && href.trim().length > 0 ? href : null;
}
