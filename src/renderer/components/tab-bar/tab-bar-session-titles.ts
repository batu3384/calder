import type { SessionRecord } from '../../../shared/types/session.js';
import type { SessionStatus } from '../surface-services/session-activity.js';

export function buildSessionTooltip(status: SessionStatus, cliSessionId?: string | null): string {
  const statusLine = `Status: ${status}`;
  return cliSessionId ? `${statusLine}\nSession: ${cliSessionId}` : statusLine;
}

export function buildSessionTabTitle(session: SessionRecord, status: SessionStatus): string {
  const baseTitle = session.type === 'diff-viewer'
    ? `Diff: ${session.diffFilePath || session.name}`
    : session.type === 'mcp-inspector'
      ? 'MCP Inspector'
      : session.type === 'file-reader'
        ? `File: ${session.fileReaderPath || session.name}`
        : session.type === 'remote-terminal'
          ? `Remote: ${session.remoteHostName || session.name}`
          : session.type === 'browser-tab'
            ? `Browser: ${session.browserTabUrl || 'New Tab'}`
            : buildSessionTooltip(status, session.cliSessionId);
  return `${baseTitle}\nDrag to reorder`;
}
