import type { ProviderId } from '../shared/types/provider.js';
import type { ProjectCheckpointDocument, ProjectCheckpointRestoreMode, ProjectRecord } from '../shared/types/project.js';
import type { SessionRecord } from '../shared/types/session.js';
import { deriveBrowserSessionName, normalizeProjectSurface } from './state-normalizers.js';
import { findProjectSession, isCliSessionRecord, repairProjectSurface } from './state-project-surface.js';

interface RestoreProjectCheckpointOptions {
  project: ProjectRecord;
  checkpoint: ProjectCheckpointDocument;
  mode: ProjectCheckpointRestoreMode;
  defaultProviderId: ProviderId;
  pruneNav: (sessionId: string) => void;
  pushNav: (sessionId: string) => void;
}

interface RestoreProjectCheckpointResult {
  createdSessions: SessionRecord[];
  removedSessions: SessionRecord[];
}

export function restoreProjectCheckpointState(
  options: RestoreProjectCheckpointOptions,
): RestoreProjectCheckpointResult {
  const { project, checkpoint, mode, defaultProviderId, pruneNav, pushNav } = options;

  const restoredIdMap = new Map<string, string>();
  const createdSessions: SessionRecord[] = [];
  const removedSessions = mode === 'replace'
    ? [...project.sessions]
    : [];

  if (mode === 'replace') {
    for (const session of removedSessions) {
      pruneNav(session.id);
    }
    project.sessions = [];
    project.activeSessionId = null;
    project.layout.splitPanes = [];
    project.surface = normalizeProjectSurface(project);
  }

  for (const snapshot of checkpoint.sessions) {
    if (snapshot.type === 'browser-tab') {
      if (!snapshot.browserTabUrl) continue;
      const existingBrowser = project.sessions.find(
        (session) => session.type === 'browser-tab' && session.browserTabUrl === snapshot.browserTabUrl,
      );
      if (existingBrowser) {
        restoredIdMap.set(snapshot.id, existingBrowser.id);
        continue;
      }

      const browserSession: SessionRecord = {
        id: crypto.randomUUID(),
        name: deriveBrowserSessionName(snapshot.browserTabUrl, snapshot.name || 'Browser'),
        type: 'browser-tab',
        browserTabUrl: snapshot.browserTabUrl,
        cliSessionId: null,
        createdAt: new Date().toISOString(),
      };
      project.sessions.push(browserSession);
      restoredIdMap.set(snapshot.id, browserSession.id);
      createdSessions.push(browserSession);
      continue;
    }

    if (snapshot.type === 'file-reader') {
      if (!snapshot.fileReaderPath) continue;
      const existingReader = project.sessions.find(
        (session) => session.type === 'file-reader' && session.fileReaderPath === snapshot.fileReaderPath,
      );
      if (existingReader) {
        existingReader.fileReaderLine = snapshot.fileReaderLine;
        restoredIdMap.set(snapshot.id, existingReader.id);
        continue;
      }

      const readerSession: SessionRecord = {
        id: crypto.randomUUID(),
        name: snapshot.name,
        type: 'file-reader',
        fileReaderPath: snapshot.fileReaderPath,
        ...(snapshot.fileReaderLine !== undefined ? { fileReaderLine: snapshot.fileReaderLine } : {}),
        cliSessionId: null,
        createdAt: new Date().toISOString(),
      };
      project.sessions.push(readerSession);
      restoredIdMap.set(snapshot.id, readerSession.id);
      createdSessions.push(readerSession);
      continue;
    }

    if (snapshot.type === 'diff-viewer') {
      if (!snapshot.diffFilePath || !snapshot.diffArea) continue;
      const existingDiff = project.sessions.find(
        (session) =>
          session.type === 'diff-viewer'
          && session.diffFilePath === snapshot.diffFilePath
          && session.diffArea === snapshot.diffArea
          && session.worktreePath === snapshot.worktreePath,
      );
      if (existingDiff) {
        restoredIdMap.set(snapshot.id, existingDiff.id);
        continue;
      }

      const diffSession: SessionRecord = {
        id: crypto.randomUUID(),
        name: snapshot.name,
        type: 'diff-viewer',
        diffFilePath: snapshot.diffFilePath,
        diffArea: snapshot.diffArea,
        ...(snapshot.worktreePath ? { worktreePath: snapshot.worktreePath } : {}),
        cliSessionId: null,
        createdAt: new Date().toISOString(),
      };
      project.sessions.push(diffSession);
      restoredIdMap.set(snapshot.id, diffSession.id);
      createdSessions.push(diffSession);
      continue;
    }

    if (snapshot.type && snapshot.type !== 'claude') {
      continue;
    }

    const existingCli = snapshot.cliSessionId
      ? project.sessions.find((session) => isCliSessionRecord(session) && session.cliSessionId === snapshot.cliSessionId)
      : project.sessions.find((session) =>
        isCliSessionRecord(session)
        && session.cliSessionId === null
        && session.name === snapshot.name
        && (session.providerId ?? defaultProviderId) === (snapshot.providerId ?? defaultProviderId));

    if (existingCli) {
      restoredIdMap.set(snapshot.id, existingCli.id);
      continue;
    }

    const restoredCli: SessionRecord = {
      id: crypto.randomUUID(),
      name: snapshot.name,
      providerId: snapshot.providerId ?? defaultProviderId,
      ...(snapshot.args ? { args: snapshot.args } : {}),
      cliSessionId: snapshot.cliSessionId,
      createdAt: new Date().toISOString(),
    };
    project.sessions.push(restoredCli);
    if (project.layout.mode === 'mosaic') {
      project.layout.splitPanes.push(restoredCli.id);
    }
    restoredIdMap.set(snapshot.id, restoredCli.id);
    createdSessions.push(restoredCli);
  }

  for (const snapshot of checkpoint.sessions) {
    if (snapshot.type !== 'browser-tab') continue;
    const restoredBrowserId = restoredIdMap.get(snapshot.id);
    if (!restoredBrowserId) continue;
    const restoredBrowser = findProjectSession(project, restoredBrowserId);
    if (!restoredBrowser || restoredBrowser.type !== 'browser-tab') continue;
    const restoredTargetId = snapshot.browserTargetSessionId
      ? restoredIdMap.get(snapshot.browserTargetSessionId)
      : undefined;
    if (restoredTargetId) {
      restoredBrowser.browserTargetSessionId = restoredTargetId;
    }
  }

  const checkpointSurface = checkpoint.surface;
  project.surface = normalizeProjectSurface(project);

  if (checkpointSurface) {
    project.surface.kind = checkpointSurface.kind;
    project.surface.active = checkpointSurface.active;

    const mappedTargetId = checkpointSurface.targetSessionId
      ? restoredIdMap.get(checkpointSurface.targetSessionId)
      : undefined;
    if (mappedTargetId) {
      project.surface.targetSessionId = mappedTargetId;
    }

    if (checkpointSurface.kind === 'web') {
      const mappedWebSessionId = checkpointSurface.webSessionId
        ? restoredIdMap.get(checkpointSurface.webSessionId)
        : undefined;
      const webUrl = checkpointSurface.webUrl
        ?? (mappedWebSessionId ? findProjectSession(project, mappedWebSessionId)?.browserTabUrl : undefined);
      project.surface.web = {
        sessionId: mappedWebSessionId,
        url: webUrl,
        history: webUrl
          ? Array.from(new Set([...(project.surface.web?.history ?? []), webUrl]))
          : (project.surface.web?.history ?? []),
      };
    }

    if (project.surface.cli) {
      project.surface.cli = {
        ...project.surface.cli,
        selectedProfileId: checkpointSurface.cliSelectedProfileId ?? project.surface.cli.selectedProfileId,
        runtime: {
          ...(project.surface.cli.runtime ?? { status: 'idle' }),
          status: checkpointSurface.cliStatus ?? project.surface.cli.runtime?.status ?? 'idle',
        },
      };
    }
  }

  const nextActiveId = checkpoint.activeSessionId
    ? restoredIdMap.get(checkpoint.activeSessionId)
    : undefined;
  if (nextActiveId) {
    project.activeSessionId = nextActiveId;
    pushNav(nextActiveId);
  }

  repairProjectSurface(project);
  return { createdSessions, removedSessions };
}
