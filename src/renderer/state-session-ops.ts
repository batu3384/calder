import type { ProjectRecord } from '../shared/types/project-state.js';
import type { SessionRecord } from '../shared/types/session.js';
import { normalizeProjectSurface } from './state-normalizers.js';
import {
  findActiveCliSession,
  findProjectSession,
  isCliSessionRecord,
} from './state-project-surface.js';
import {
  createBrowserTabSessionRecord,
  createDiffViewerSessionRecord,
  createFileReaderSessionRecord,
  createMcpInspectorSessionRecord,
  createRemoteSessionRecord,
} from './state-session-factory.js';

type PushNav = (sessionId: string) => void;

export interface SessionMutationResult {
  session: SessionRecord;
  created: boolean;
}

function appendUrlToHistory(history: string[] | undefined, url: string | undefined): string[] {
  if (!url) return history ?? [];
  return Array.from(new Set([...(history ?? []), url]));
}

function activateSession(project: ProjectRecord, sessionId: string, pushNav: PushNav): void {
  project.activeSessionId = sessionId;
  pushNav(sessionId);
}

function syncBrowserSurface(
  project: ProjectRecord,
  sessionId: string,
  url: string | undefined,
  targetSessionId?: string,
): void {
  project.surface = normalizeProjectSurface(project);
  project.surface.kind = 'web';
  project.surface.active = true;
  project.surface.tabFocus = 'session';
  project.surface.web = {
    sessionId,
    url,
    history: appendUrlToHistory(project.surface.web?.history, url),
  };
  if (targetSessionId) {
    project.surface.targetSessionId = targetSessionId;
  }
}

export function addSessionToProject(
  project: ProjectRecord,
  session: SessionRecord,
  pushNav: PushNav,
  options?: { includeInMosaic?: boolean },
): void {
  project.sessions.push(session);
  activateSession(project, session.id, pushNav);
  if (options?.includeInMosaic && project.layout.mode === 'mosaic') {
    project.layout.splitPanes.push(session.id);
  }
}

export function upsertDiffViewerSession(
  project: ProjectRecord,
  payload: { filePath: string; area: string; worktreePath?: string },
  pushNav: PushNav,
): SessionMutationResult {
  const existing = project.sessions.find(
    (session) =>
      session.type === 'diff-viewer' &&
      session.diffFilePath === payload.filePath &&
      session.diffArea === payload.area &&
      session.worktreePath === payload.worktreePath,
  );
  if (existing) {
    activateSession(project, existing.id, pushNav);
    return { session: existing, created: false };
  }

  const session = createDiffViewerSessionRecord(payload);
  addSessionToProject(project, session, pushNav);
  return { session, created: true };
}

export function upsertFileReaderSession(
  project: ProjectRecord,
  payload: { filePath: string; lineNumber?: number },
  pushNav: PushNav,
): SessionMutationResult {
  const existing = project.sessions.find(
    (session) => session.type === 'file-reader' && session.fileReaderPath === payload.filePath,
  );
  if (existing) {
    existing.fileReaderLine = payload.lineNumber;
    activateSession(project, existing.id, pushNav);
    return { session: existing, created: false };
  }

  const session = createFileReaderSessionRecord(payload);
  addSessionToProject(project, session, pushNav);
  return { session, created: true };
}

export function addRemoteSession(
  project: ProjectRecord,
  payload: { sessionId: string; hostSessionName: string; shareMode: 'readonly' | 'readwrite' },
  pushNav: PushNav,
): SessionRecord {
  const session = createRemoteSessionRecord(payload);
  addSessionToProject(project, session, pushNav);
  return session;
}

export function addMcpInspectorSession(
  project: ProjectRecord,
  name: string,
  pushNav: PushNav,
): SessionRecord {
  const session = createMcpInspectorSessionRecord(name);
  addSessionToProject(project, session, pushNav);
  return session;
}

export function upsertBrowserTabSession(
  project: ProjectRecord,
  payload: { url?: string; dedupeByUrl?: boolean },
  pushNav: PushNav,
): SessionMutationResult {
  const dedupeByUrl = payload.dedupeByUrl ?? true;
  if (payload.url && dedupeByUrl) {
    const existing = project.sessions.find(
      (session) => session.type === 'browser-tab' && session.browserTabUrl === payload.url,
    );
    if (existing) {
      activateSession(project, existing.id, pushNav);
      return { session: existing, created: false };
    }
  }

  const initialTargetSession = findActiveCliSession(project);
  const session = createBrowserTabSessionRecord({
    url: payload.url,
    targetSessionId: initialTargetSession?.id,
  });
  project.sessions.push(session);
  activateSession(project, session.id, pushNav);
  syncBrowserSurface(project, session.id, payload.url, initialTargetSession?.id);
  return { session, created: true };
}

function resolveBrowserSurfaceSession(project: ProjectRecord): SessionRecord | undefined {
  const currentSurfaceSessionId = project.surface?.web?.sessionId;
  const currentSurfaceSession = currentSurfaceSessionId
    ? project.sessions.find(
        (session) => session.id === currentSurfaceSessionId && session.type === 'browser-tab',
      )
    : undefined;
  if (currentSurfaceSession) {
    return currentSurfaceSession;
  }

  const activeBrowserSession = project.activeSessionId
    ? project.sessions.find(
        (session) => session.id === project.activeSessionId && session.type === 'browser-tab',
      )
    : undefined;
  if (activeBrowserSession) {
    return activeBrowserSession;
  }

  return [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
}

export function openUrlInExistingBrowserSession(
  project: ProjectRecord,
  url: string,
  pushNav: PushNav,
): SessionRecord | undefined {
  const targetSession = resolveBrowserSurfaceSession(project);
  if (!targetSession) return undefined;

  activateSession(project, targetSession.id, pushNav);
  targetSession.browserTabUrl = url;
  syncBrowserSurface(project, targetSession.id, url, targetSession.browserTargetSessionId);
  return targetSession;
}

export function setSurfaceTargetSession(
  project: ProjectRecord,
  targetSessionId: string | null,
): boolean {
  project.surface = normalizeProjectSurface(project);

  if (targetSessionId === null) {
    delete project.surface.targetSessionId;
    for (const session of project.sessions) {
      if (session.type === 'browser-tab') delete session.browserTargetSessionId;
    }
    return true;
  }

  const targetSession = findProjectSession(project, targetSessionId);
  if (!targetSession || !isCliSessionRecord(targetSession)) return false;
  if (project.surface.targetSessionId === targetSessionId) return false;
  project.surface.targetSessionId = targetSessionId;
  for (const session of project.sessions) {
    if (session.type === 'browser-tab') session.browserTargetSessionId = targetSessionId;
  }
  return true;
}

export function updateBrowserTabUrl(
  project: ProjectRecord | undefined,
  session: SessionRecord,
  url: string,
): boolean {
  if (session.browserTabUrl === url) return false;
  session.browserTabUrl = url;
  if (project?.surface?.web?.sessionId === session.id) {
    project.surface.web.url = url;
    project.surface.web.history = appendUrlToHistory(project.surface.web.history, url);
  }
  return true;
}

export function passivateBrowserTabSession(
  project: ProjectRecord,
  session: SessionRecord,
  failedUrl?: string,
): boolean {
  if (session.type !== 'browser-tab') return false;

  const rememberedUrl = failedUrl ?? session.browserTabUrl;
  delete session.browserTabUrl;
  project.surface = normalizeProjectSurface(project);
  project.surface.web = project.surface.web ?? { history: [] };

  if (rememberedUrl) {
    project.surface.web.history = appendUrlToHistory(project.surface.web.history, rememberedUrl);
  }

  if (project.surface.web.sessionId === session.id) {
    project.surface.web.url = undefined;
    if (project.surface.kind === 'web') {
      project.surface.active = false;
      project.surface.tabFocus = 'session';
    }
  }

  return true;
}
