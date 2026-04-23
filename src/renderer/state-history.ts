import type { ProviderId } from '../shared/types/provider.js';
import type { ProjectRecord } from '../shared/types/project-state.js';
import type { ArchivedSession, CostInfo, SessionRecord } from '../shared/types/session.js';

export function archiveSessionToHistory(
  project: ProjectRecord,
  session: SessionRecord,
  costInfo: CostInfo | null,
): void {
  const archived: ArchivedSession = {
    id: crypto.randomUUID(),
    name: session.name,
    providerId: (session.providerId || 'claude') as ProviderId,
    cliSessionId: session.cliSessionId,
    createdAt: session.createdAt,
    closedAt: new Date().toISOString(),
    cost: costInfo ? {
      totalCostUsd: costInfo.totalCostUsd,
      totalInputTokens: costInfo.totalInputTokens,
      totalOutputTokens: costInfo.totalOutputTokens,
      totalDurationMs: costInfo.totalDurationMs,
      source: costInfo.source,
    } : null,
  };

  if (!project.sessionHistory) project.sessionHistory = [];

  const existingIndex = archived.cliSessionId
    ? project.sessionHistory.findIndex((entry) => entry.cliSessionId === archived.cliSessionId)
    : -1;
  if (existingIndex !== -1) {
    project.sessionHistory[existingIndex].closedAt = archived.closedAt;
    if (archived.cost) project.sessionHistory[existingIndex].cost = archived.cost;
    if (archived.name !== project.sessionHistory[existingIndex].name) {
      project.sessionHistory[existingIndex].name = archived.name;
    }
  } else {
    project.sessionHistory.push(archived);
  }

  if (project.sessionHistory.length > 500) {
    let nonBookmarkedToRemove = project.sessionHistory.length - 500;
    project.sessionHistory = project.sessionHistory.filter((entry) => {
      if (entry.bookmarked) return true;
      if (nonBookmarkedToRemove > 0) { nonBookmarkedToRemove--; return false; }
      return true;
    });
  }
}

export function removeHistoryEntryFromProject(project: ProjectRecord, archivedSessionId: string): boolean {
  if (!project.sessionHistory) return false;
  const next = project.sessionHistory.filter((entry) => entry.id !== archivedSessionId);
  if (next.length === project.sessionHistory.length) return false;
  project.sessionHistory = next;
  return true;
}

export function toggleProjectHistoryBookmark(project: ProjectRecord, archivedSessionId: string): boolean {
  if (!project.sessionHistory) return false;
  const entry = project.sessionHistory.find((record) => record.id === archivedSessionId);
  if (!entry) return false;
  entry.bookmarked = !entry.bookmarked;
  return true;
}

export function clearProjectHistory(project: ProjectRecord): boolean {
  const next = project.sessionHistory?.filter((entry) => entry.bookmarked) ?? [];
  const previousLength = project.sessionHistory?.length ?? 0;
  project.sessionHistory = next;
  return previousLength !== next.length;
}

interface ResumeFromHistoryResult {
  created: boolean;
  session?: SessionRecord;
}

export function resumeSessionFromHistory(
  project: ProjectRecord,
  archivedSessionId: string,
  pushNav: (sessionId: string) => void,
): ResumeFromHistoryResult {
  const archived = project.sessionHistory?.find((entry) => entry.id === archivedSessionId);
  if (!archived || !archived.cliSessionId) return { created: false };

  const existing = project.sessions.find((session) => session.cliSessionId === archived.cliSessionId);
  if (existing) {
    project.activeSessionId = existing.id;
    pushNav(existing.id);
    return { session: existing, created: false };
  }

  const session: SessionRecord = {
    id: crypto.randomUUID(),
    name: archived.name,
    providerId: archived.providerId,
    cliSessionId: archived.cliSessionId,
    createdAt: new Date().toISOString(),
  };
  project.sessions.push(session);
  project.activeSessionId = session.id;
  pushNav(session.id);
  if (project.layout.mode === 'mosaic') {
    project.layout.splitPanes.push(session.id);
  }
  return { session, created: true };
}
