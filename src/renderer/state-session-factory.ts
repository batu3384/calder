import type { ProviderId } from '../shared/types/provider.js';
import type { SessionRecord } from '../shared/types/session.js';

type ShareMode = 'readonly' | 'readwrite';

function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

function basename(inputPath: string): string {
  return inputPath.split('/').pop() || inputPath;
}

function browserSessionName(url?: string): string {
  if (!url) return 'Browser';
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function createStandardSessionRecord(params: {
  name: string;
  providerId: ProviderId;
  args?: string;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name: params.name,
    providerId: params.providerId,
    ...(params.args ? { args: params.args } : {}),
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}

export function createWorkflowLaunchSessionRecord(params: {
  name: string;
  providerId: ProviderId;
  args?: string;
  pendingInitialPrompt: string;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name: params.name,
    providerId: params.providerId,
    ...(params.args ? { args: params.args } : {}),
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
    pendingInitialPrompt: params.pendingInitialPrompt,
  };
}

export function createDiffViewerSessionRecord(params: {
  filePath: string;
  area: string;
  worktreePath?: string;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name: basename(params.filePath),
    type: 'diff-viewer',
    diffFilePath: params.filePath,
    diffArea: params.area,
    ...(params.worktreePath ? { worktreePath: params.worktreePath } : {}),
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}

export function createRemoteSessionRecord(params: {
  sessionId: string;
  hostSessionName: string;
  shareMode: ShareMode;
}): SessionRecord {
  return {
    id: params.sessionId,
    name: `Remote: ${params.hostSessionName}`,
    type: 'remote-terminal',
    remoteHostName: params.hostSessionName,
    shareMode: params.shareMode,
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}

export function createBrowserTabSessionRecord(params: {
  url?: string;
  targetSessionId?: string;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name: browserSessionName(params.url),
    type: 'browser-tab',
    browserTabUrl: params.url,
    ...(params.targetSessionId ? { browserTargetSessionId: params.targetSessionId } : {}),
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}

export function createFileReaderSessionRecord(params: {
  filePath: string;
  lineNumber?: number;
}): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name: basename(params.filePath),
    type: 'file-reader',
    fileReaderPath: params.filePath,
    ...(params.lineNumber !== undefined ? { fileReaderLine: params.lineNumber } : {}),
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}

export function createMcpInspectorSessionRecord(name: string): SessionRecord {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'mcp-inspector',
    cliSessionId: null,
    createdAt: nowIsoTimestamp(),
  };
}
