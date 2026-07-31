import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { type PixelVisualState, resolvePixelVisualState } from './visual-resolver.js';

/** Safe activity context for UI — basename / host only, never full secrets. */
export function extractSafeActivityContext(event: EvidenceEvent | undefined): string | null {
  if (!event) return null;
  const meta = event.sanitizedMeta ?? {};

  for (const key of ['url', 'uri', 'href'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      try {
        return new URL(value).host;
      } catch {
        return null;
      }
    }
  }

  for (const key of ['file_path', 'filePath', 'path', 'target_file', 'targetFile'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      const parts = value.replace(/\\/g, '/').split('/');
      return parts[parts.length - 1] || null;
    }
  }

  if (event.sanitizedPaths?.length) {
    const path = event.sanitizedPaths[0];
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || null;
  }

  const tool = event.toolName ?? '';
  if (tool.startsWith('mcp__')) {
    const bits = tool.split('__');
    if (bits.length >= 3 && bits[1]) return bits[1];
  }

  return null;
}

export function findLatestActivityEvent(events: EvidenceEvent[]): EvidenceEvent | undefined {
  const ordered = [...events].sort((a, b) => a.seq - b.seq || a.timestamp - b.timestamp);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const event = ordered[index];
    if (!event) continue;
    if (
      event.type === 'tool_started' ||
      event.type === 'tool_requested' ||
      event.type === 'permission_requested' ||
      event.type === 'git_change_observed' ||
      event.type === 'context_compaction_started' ||
      event.type === 'subagent_started'
    ) {
      return event;
    }
  }
  return ordered[ordered.length - 1];
}

export function formatPixelActivityLine(
  events: EvidenceEvent[],
  state: PixelVisualState = resolvePixelVisualState(events),
): { state: PixelVisualState; toolName: string | null; context: string | null } {
  const latest = findLatestActivityEvent(events);
  return {
    state,
    toolName: latest?.toolName ?? null,
    context: extractSafeActivityContext(latest),
  };
}
