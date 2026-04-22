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

type CheckpointSessionSnapshot = ProjectCheckpointDocument['sessions'][number];
type CheckpointSurfaceSnapshot = NonNullable<ProjectCheckpointDocument['surface']>;

interface RestoreCheckpointRuntime {
  project: ProjectRecord;
  defaultProviderId: ProviderId;
  restoredIdMap: Map<string, string>;
  createdSessions: SessionRecord[];
}

function resetProjectForReplaceMode(
  project: ProjectRecord,
  removedSessions: SessionRecord[],
  pruneNav: (sessionId: string) => void,
): void {
  for (const session of removedSessions) {
    pruneNav(session.id);
  }
  project.sessions = [];
  project.activeSessionId = null;
  project.layout.splitPanes = [];
  project.surface = normalizeProjectSurface(project);
}

function mapRestoredSession(runtime: RestoreCheckpointRuntime, snapshotId: string, sessionId: string): void {
  runtime.restoredIdMap.set(snapshotId, sessionId);
}

function pushCreatedSession(
  runtime: RestoreCheckpointRuntime,
  snapshot: CheckpointSessionSnapshot,
  session: SessionRecord,
): void {
  runtime.project.sessions.push(session);
  mapRestoredSession(runtime, snapshot.id, session.id);
  runtime.createdSessions.push(session);
}

function tryRestoreBrowserSnapshot(snapshot: CheckpointSessionSnapshot, runtime: RestoreCheckpointRuntime): boolean {
  if (snapshot.type !== 'browser-tab') return false;
  if (!snapshot.browserTabUrl) return true;

  const existingBrowser = runtime.project.sessions.find(
    (session) => session.type === 'browser-tab' && session.browserTabUrl === snapshot.browserTabUrl,
  );
  if (existingBrowser) {
    mapRestoredSession(runtime, snapshot.id, existingBrowser.id);
    return true;
  }

  const browserSession: SessionRecord = {
    id: crypto.randomUUID(),
    name: deriveBrowserSessionName(snapshot.browserTabUrl, snapshot.name || 'Browser'),
    type: 'browser-tab',
    browserTabUrl: snapshot.browserTabUrl,
    cliSessionId: null,
    createdAt: new Date().toISOString(),
  };
  pushCreatedSession(runtime, snapshot, browserSession);
  return true;
}

function tryRestoreFileReaderSnapshot(snapshot: CheckpointSessionSnapshot, runtime: RestoreCheckpointRuntime): boolean {
  if (snapshot.type !== 'file-reader') return false;
  if (!snapshot.fileReaderPath) return true;

  const existingReader = runtime.project.sessions.find(
    (session) => session.type === 'file-reader' && session.fileReaderPath === snapshot.fileReaderPath,
  );
  if (existingReader) {
    existingReader.fileReaderLine = snapshot.fileReaderLine;
    mapRestoredSession(runtime, snapshot.id, existingReader.id);
    return true;
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
  pushCreatedSession(runtime, snapshot, readerSession);
  return true;
}

function tryRestoreDiffSnapshot(snapshot: CheckpointSessionSnapshot, runtime: RestoreCheckpointRuntime): boolean {
  if (snapshot.type !== 'diff-viewer') return false;
  if (!snapshot.diffFilePath || !snapshot.diffArea) return true;

  const existingDiff = runtime.project.sessions.find(
    (session) =>
      session.type === 'diff-viewer'
      && session.diffFilePath === snapshot.diffFilePath
      && session.diffArea === snapshot.diffArea
      && session.worktreePath === snapshot.worktreePath,
  );
  if (existingDiff) {
    mapRestoredSession(runtime, snapshot.id, existingDiff.id);
    return true;
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
  pushCreatedSession(runtime, snapshot, diffSession);
  return true;
}

function findExistingCliSession(
  project: ProjectRecord,
  snapshot: CheckpointSessionSnapshot,
  defaultProviderId: ProviderId,
): SessionRecord | undefined {
  if (snapshot.cliSessionId) {
    return project.sessions.find((session) => isCliSessionRecord(session) && session.cliSessionId === snapshot.cliSessionId);
  }
  return project.sessions.find((session) =>
    isCliSessionRecord(session)
    && session.cliSessionId === null
    && session.name === snapshot.name
    && (session.providerId ?? defaultProviderId) === (snapshot.providerId ?? defaultProviderId));
}

function restoreCliSnapshot(snapshot: CheckpointSessionSnapshot, runtime: RestoreCheckpointRuntime): void {
  if (snapshot.type && snapshot.type !== 'claude') {
    return;
  }

  const existingCli = findExistingCliSession(runtime.project, snapshot, runtime.defaultProviderId);
  if (existingCli) {
    mapRestoredSession(runtime, snapshot.id, existingCli.id);
    return;
  }

  const restoredCli: SessionRecord = {
    id: crypto.randomUUID(),
    name: snapshot.name,
    providerId: snapshot.providerId ?? runtime.defaultProviderId,
    ...(snapshot.args ? { args: snapshot.args } : {}),
    cliSessionId: snapshot.cliSessionId,
    createdAt: new Date().toISOString(),
  };
  runtime.project.sessions.push(restoredCli);
  if (runtime.project.layout.mode === 'mosaic') {
    runtime.project.layout.splitPanes.push(restoredCli.id);
  }
  mapRestoredSession(runtime, snapshot.id, restoredCli.id);
  runtime.createdSessions.push(restoredCli);
}

function restoreSnapshotSession(snapshot: CheckpointSessionSnapshot, runtime: RestoreCheckpointRuntime): void {
  if (tryRestoreBrowserSnapshot(snapshot, runtime)) return;
  if (tryRestoreFileReaderSnapshot(snapshot, runtime)) return;
  if (tryRestoreDiffSnapshot(snapshot, runtime)) return;
  restoreCliSnapshot(snapshot, runtime);
}

function restoreBrowserTargets(
  project: ProjectRecord,
  sessions: CheckpointSessionSnapshot[],
  restoredIdMap: Map<string, string>,
): void {
  for (const snapshot of sessions) {
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
}

function applyCheckpointSurface(
  project: ProjectRecord,
  checkpointSurface: CheckpointSurfaceSnapshot,
  restoredIdMap: Map<string, string>,
): void {
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
    resetProjectForReplaceMode(project, removedSessions, pruneNav);
  }

  for (const snapshot of checkpoint.sessions) {
    restoreSnapshotSession(snapshot, {
      project,
      defaultProviderId,
      restoredIdMap,
      createdSessions,
    });
  }

  restoreBrowserTargets(project, checkpoint.sessions, restoredIdMap);

  const checkpointSurface = checkpoint.surface;
  project.surface = normalizeProjectSurface(project);

  if (checkpointSurface) {
    applyCheckpointSurface(project, checkpointSurface, restoredIdMap);
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
