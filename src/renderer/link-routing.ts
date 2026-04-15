const ANSI_CSI_SEQUENCE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ANSI_OSC_SEQUENCE = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/i;
const LOCALHOST_PATTERN = /(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)(?::\d+)?(?:[/?#][^\s<>()\[\]{}"']*)?/i;
const MARKDOWN_LINK_TARGET = /\]\(\s*(https?:\/\/[^\s)]+)\s*\)/i;

function stripEdgeWrappers(value: string): string {
  let next = value.trim();
  while (next && /^[<([{"'`]+/.test(next)) {
    next = next.replace(/^[<([{"'`]+/, '').trim();
  }
  while (next && /[>)\]}",'`.;!?]+$/.test(next)) {
    next = next.replace(/[>)\]}",'`.;!?]+$/, '').trim();
  }
  return next;
}

function sanitizeRawLink(raw: string): string {
  return raw
    .replace(ANSI_OSC_SEQUENCE, '')
    .replace(ANSI_CSI_SEQUENCE, '')
    .replace(CONTROL_CHARS, '')
    .trim();
}

function extractCandidate(raw: string): string {
  const markdownTarget = raw.match(MARKDOWN_LINK_TARGET)?.[1];
  if (markdownTarget) return markdownTarget;

  const explicitHttp = raw.match(HTTP_URL_PATTERN)?.[0];
  if (explicitHttp) return explicitHttp;

  const localhost = raw.match(LOCALHOST_PATTERN)?.[0];
  if (localhost) return localhost;

  return raw;
}

export function resolveNavigableHttpUrl(raw: string): string | null {
  const cleaned = sanitizeRawLink(raw);
  if (!cleaned) return null;

  let candidate = stripEdgeWrappers(extractCandidate(cleaned));
  if (!candidate) return null;

  const hasHttpScheme = /^https?:\/\//i.test(candidate);
  const looksLikeLocalHost = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)(:\d+)?([/?#].*)?$/i.test(candidate);
  const hasOtherScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);

  if (!hasHttpScheme) {
    if (looksLikeLocalHost || !hasOtherScheme) {
      candidate = `http://${candidate}`;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export interface LinkDispatchSnapshot {
  at: number;
  url: string;
  source: 'osc-link' | 'web-link';
}

function specificityScore(url: string): number {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length + parsed.search.length + parsed.hash.length;
  } catch {
    return 0;
  }
}

function sourcePriority(source: LinkDispatchSnapshot['source']): number {
  // OSC links carry explicit targets and should win tie-breaks over web-link
  // regex heuristics when both fire for the same click.
  return source === 'osc-link' ? 2 : 1;
}

function isSameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function shouldDispatchLinkOpen(
  nextUrl: string,
  lastDispatch: LinkDispatchSnapshot | null,
  source: LinkDispatchSnapshot['source'],
  now: number = Date.now(),
  dedupeWindowMs: number = 300,
): boolean {
  if (!lastDispatch) return true;
  if (now - lastDispatch.at > dedupeWindowMs) return true;
  if (!isSameOrigin(nextUrl, lastDispatch.url)) return true;
  if (nextUrl === lastDispatch.url) return false;

  const nextSpecificity = specificityScore(nextUrl);
  const previousSpecificity = specificityScore(lastDispatch.url);
  if (nextSpecificity !== previousSpecificity) {
    return nextSpecificity > previousSpecificity;
  }

  if (sourcePriority(source) !== sourcePriority(lastDispatch.source)) {
    return sourcePriority(source) > sourcePriority(lastDispatch.source);
  }

  return false;
}
