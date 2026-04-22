import { ProjectRecord } from '../state.js';

function getMosaicActiveLayoutKey(project: ProjectRecord): string {
  const activeSession = project.activeSessionId
    ? project.sessions.find((session) => session.id === project.activeSessionId)
    : undefined;
  if (!activeSession) return 'none';
  const activeType = activeSession.type ?? 'claude';
  if (activeType === 'claude') return 'cli';
  if (activeType === 'browser-tab') return `browser:${activeSession.id}`;
  return `non-cli:${activeSession.id}:${activeType}`;
}

export function getLayoutRenderSignature(project: ProjectRecord | undefined): string {
  if (!project) return 'no-project';
  return JSON.stringify({
    projectId: project.id,
    activeLayoutKey: project.layout.mode === 'mosaic'
      ? getMosaicActiveLayoutKey(project)
      : `tab:${project.activeSessionId ?? 'none'}`,
    layout: {
      mode: project.layout.mode,
      splitPanes: project.layout.splitPanes,
      splitDirection: project.layout.splitDirection,
      browserWidthRatio: project.layout.browserWidthRatio,
      mosaicPreset: project.layout.mosaicPreset,
      mosaicRatios: project.layout.mosaicRatios ?? {},
    },
    surface: project.surface
      ? {
          kind: project.surface.kind,
          active: project.surface.active,
          tabFocus: project.surface.tabFocus ?? 'session',
          webSessionId: project.surface.web?.sessionId ?? null,
          cliProfileId: project.surface.cli?.selectedProfileId ?? null,
        }
      : null,
    sessions: project.sessions.map((session) => ({
      id: session.id,
      type: session.type ?? 'claude',
      cliSessionId: session.cliSessionId ?? null,
      mcpServerUrl: session.mcpServerUrl ?? null,
      diffFilePath: session.diffFilePath ?? null,
      diffArea: session.diffArea ?? null,
      worktreePath: session.worktreePath ?? null,
      fileReaderPath: session.fileReaderPath ?? null,
      fileReaderLine: session.fileReaderLine ?? null,
      remoteHostName: session.remoteHostName ?? null,
    })),
  });
}
