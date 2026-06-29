import * as fs from 'fs';
import * as os from 'os';

import type { InspectorEvent } from '../shared/types/session';

const PLAYWRIGHT_NAVIGATE_TOOL = 'mcp__plugin_playwright_playwright__browser_navigate';
const PLAYWRIGHT_MIRROR_COOLDOWN_MS = 1_500;
const AUTO_APPROVAL_AUDIT_EXTENSION = '.auto_approval.log';

export const PLAYWRIGHT_TRANSCRIPT_BUFFER_MAX_CHARS = 8_192;

export interface PlaywrightMirrorState {
  lastUrl: string;
  lastMirroredAtMs: number;
}

export interface PlaywrightMirrorTarget {
  url: string;
  cwd: string;
  sessionId: string;
}

export function appendAutoApprovalAudit(sessionId: string, events: InspectorEvent[]): void {
  if (!events.length) return;
  const auditEvents = events.filter((event) =>
    event.type === 'approval_decision' && event.auto_approval !== undefined
  );
  if (!auditEvents.length) return;

  const runtimeDir = `${os.homedir()}/.calder/runtime`;
  const auditPath = `${runtimeDir}/${sessionId}${AUTO_APPROVAL_AUDIT_EXTENSION}`;

  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const lines = auditEvents.map((event) => JSON.stringify({
      emittedAt: new Date().toISOString(),
      event,
    }));
    fs.appendFileSync(auditPath, `${lines.join('\n')}\n`, 'utf8');
  } catch (error) {
    console.warn('Failed to append auto-approval audit log:', error);
  }
}

function isPlaywrightNavigateToolName(toolName: string | undefined): boolean {
  if (!toolName) return false;
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === PLAYWRIGHT_NAVIGATE_TOOL) return true;
  if (normalized.includes('playwright') && normalized.endsWith('__browser_navigate')) return true;

  // Some providers/tooling surfaces use human-readable tool names instead of
  // canonical MCP IDs (for example: "plugin:playwright:playwright - Navigate to a URL").
  const isPlaywrightTool = normalized.includes('playwright');
  if (!isPlaywrightTool) return false;
  if (/(^|[^a-z0-9])browser_navigate([^a-z0-9]|$)/.test(normalized)) return true;
  if (normalized.includes('navigate to a url')) return true;
  return /(?:^|[^a-z0-9])navigate([^a-z0-9]|$)/.test(normalized);
}

export function extractPlaywrightNavigateUrl(toolInput: InspectorEvent['tool_input']): string | null {
  if (!toolInput || typeof toolInput !== 'object') return null;
  const urlCandidate = (toolInput as Record<string, unknown>).url;
  return normalizePlaywrightNavigateUrl(typeof urlCandidate === 'string' ? urlCandidate : null);
}

export function extractPlaywrightNavigateCwd(cwd: InspectorEvent['cwd']): string | null {
  if (typeof cwd !== 'string') return null;
  const normalized = cwd.trim();
  return normalized ? normalized : null;
}

function normalizePlaywrightNavigateUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function shouldMirrorPlaywrightNavigateUrl(
  sessionId: string,
  url: string,
  stateBySession: Map<string, PlaywrightMirrorState>,
  nowMs = Date.now(),
): boolean {
  const previous = stateBySession.get(sessionId);
  if (previous && previous.lastUrl === url && nowMs - previous.lastMirroredAtMs < PLAYWRIGHT_MIRROR_COOLDOWN_MS) {
    return false;
  }
  stateBySession.set(sessionId, { lastUrl: url, lastMirroredAtMs: nowMs });
  return true;
}

export function shouldMirrorPlaywrightNavigate(
  sessionId: string,
  event: InspectorEvent,
  stateBySession: Map<string, PlaywrightMirrorState>,
  nowMs = Date.now(),
): PlaywrightMirrorTarget | null {
  if (event.type !== 'tool_use') return null;
  if (!isPlaywrightNavigateToolName(event.tool_name)) return null;
  const url = extractPlaywrightNavigateUrl(event.tool_input);
  const cwd = extractPlaywrightNavigateCwd(event.cwd);
  if (!cwd) return null;
  if (!url) return null;
  if (!shouldMirrorPlaywrightNavigateUrl(sessionId, url, stateBySession, nowMs)) return null;
  return { url, cwd, sessionId };
}

export function extractPlaywrightNavigateUrlsFromTerminalChunk(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  const patterns = [
    /plugin:playwright:playwright[^\n\r]{0,160}navigate to a url[\s\S]{0,360}?\(mcp\)\(url:\s*"([^"\n\r]+)"/gi,
    /playwright:[^\n\r]{0,160}browser_navigate[^\n\r]*[\s\S]{0,360}?\(mcp\)\(url:\s*"([^"\n\r]+)"/gi,
  ];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let result: RegExpExecArray | null;
    while ((result = pattern.exec(text)) !== null) {
      const normalized = normalizePlaywrightNavigateUrl(result[1]);
      if (normalized) {
        matches.push(normalized);
      }
    }
  }
  return Array.from(new Set(matches));
}
