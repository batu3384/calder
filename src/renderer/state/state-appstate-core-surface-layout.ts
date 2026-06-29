import type { ProjectRecord } from '../../shared/types/project-state.js';
import type { SessionRecord } from '../../shared/types/session.js';
import { clampRatio } from '../components/mosaic-layout-model.js';
import { DEFAULT_BROWSER_WIDTH_RATIO } from '../state-normalizers.js';
import { isCliSessionRecord, resolveSurfaceTargetFromProject } from '../state-project-surface.js';
import {
  passivateBrowserTabSession as passivateBrowserTabSessionRecord,
  setSurfaceTargetSession as setSurfaceTargetSessionOnProject,
  updateBrowserTabUrl,
} from '../state-session-ops.js';
import { findProjectById } from './state-appstate-core-project-access.js';

export function listSurfaceTargetSessionsForProject(
  projects: ProjectRecord[],
  projectId: string,
): SessionRecord[] {
  const project = findProjectById(projects, projectId);
  if (!project) return [];
  return project.sessions.filter((session) => isCliSessionRecord(session));
}

export function resolveSurfaceTargetSessionForProject(options: {
  projects: ProjectRecord[];
  projectId: string;
  requireExplicitTarget?: boolean;
}): SessionRecord | undefined {
  const project = findProjectById(options.projects, options.projectId);
  if (!project) return undefined;
  return resolveSurfaceTargetFromProject(project, {
    allowActiveFallback: options.requireExplicitTarget ? false : true,
  });
}

export function setSurfaceTargetSessionForProject(
  projects: ProjectRecord[],
  projectId: string,
  targetSessionId: string | null,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  return setSurfaceTargetSessionOnProject(project, targetSessionId);
}

export function updateBrowserTabSessionUrlById(
  projects: ProjectRecord[],
  sessionId: string,
  url: string,
): boolean {
  const project = projects.find((entry) =>
    entry.sessions.some((session) => session.id === sessionId),
  );
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  if (!session) return false;
  return updateBrowserTabUrl(project, session, url);
}

export function passivateBrowserTabSessionById(
  projects: ProjectRecord[],
  sessionId: string,
  failedUrl?: string,
): boolean {
  const project = projects.find((entry) =>
    entry.sessions.some((session) => session.id === sessionId),
  );
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  if (!project || !session) return false;
  return passivateBrowserTabSessionRecord(project, session, failedUrl);
}

export function setBrowserWidthRatioForProject(
  projects: ProjectRecord[],
  projectId: string,
  ratio: number,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  project.layout.browserWidthRatio = clampRatio(ratio, 0.25, 0.7, DEFAULT_BROWSER_WIDTH_RATIO);
  return true;
}

export function setMosaicRatioForProject(
  projects: ProjectRecord[],
  projectId: string,
  key: string,
  ratio: number,
): boolean {
  const project = findProjectById(projects, projectId);
  if (!project) return false;
  const next = { ...(project.layout.mosaicRatios ?? {}) };
  next[key] = clampRatio(ratio, 0.2, 0.8, next[key] ?? 0.5);
  project.layout.mosaicRatios = next;
  return true;
}
