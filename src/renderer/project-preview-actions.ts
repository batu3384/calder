import type { ProjectRecord, ProjectSurfaceRecord } from '../shared/types.js';
import { appState } from './state.js';

export type PreviewRuntimeHealthTone = 'healthy' | 'muted' | 'warning' | 'danger';

export interface PreviewRuntimeHealth {
  tone: PreviewRuntimeHealthTone;
  statusLabel: string;
  detail: string;
  lastExitLabel?: string;
  lastErrorLabel?: string;
}

function createDefaultProjectSurface(): ProjectSurfaceRecord {
  return {
    kind: 'web',
    active: false,
    web: { history: [] },
    cli: { profiles: [], runtime: { status: 'idle' } },
  };
}

function getProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  return project.surface
    ? {
        ...project.surface,
        web: project.surface.web
          ? {
              ...project.surface.web,
              history: [...(project.surface.web.history ?? [])],
            }
          : { history: [] },
        cli: project.surface.cli
          ? {
              ...project.surface.cli,
              profiles: [...project.surface.cli.profiles],
              runtime: project.surface.cli.runtime
                ? {
                    ...project.surface.cli.runtime,
                    args: project.surface.cli.runtime.args ? [...project.surface.cli.runtime.args] : undefined,
                  }
                : { status: 'idle' },
            }
          : { profiles: [], runtime: { status: 'idle' } },
      }
    : createDefaultProjectSurface();
}

export function openPreviewTargetInLiveView(projectId: string, url: string) {
  return appState.openUrlInBrowserSurface(projectId, url);
}

export function focusCliPreviewSurface(projectId: string): boolean {
  const project = appState.projects.find((entry) => entry.id === projectId);
  if (!project) return false;
  const nextSurface = getProjectSurface(project);
  nextSurface.kind = 'cli';
  nextSurface.active = true;
  appState.setProjectSurface(projectId, nextSurface);
  return true;
}

export function openWorkspaceShellLogs(projectId: string): boolean {
  const project = appState.projects.find((entry) => entry.id === projectId);
  if (!project) return false;
  if (appState.activeProjectId !== projectId) {
    appState.setActiveProject(projectId);
  }
  appState.setTerminalPanelOpen(true);
  return true;
}

function formatRuntimeCommand(command?: string, args?: string[]): string {
  if (!command) return 'No preview command selected';
  return [command, ...(args ?? [])].join(' ');
}

function formatRuntimeStatusLabel(status?: string): string {
  if (!status) return 'Idle';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function describePreviewRuntimeHealth(projectId: string): PreviewRuntimeHealth {
  const project = appState.projects.find((entry) => entry.id === projectId);
  const runtime = project?.surface?.cli?.runtime;
  const status = runtime?.status ?? 'idle';
  const commandLine = formatRuntimeCommand(runtime?.command, runtime?.args);
  const lastExitLabel = typeof runtime?.lastExitCode === 'number'
    ? `Exited with code ${runtime.lastExitCode}`
    : undefined;

  if (status === 'error') {
    return {
      tone: 'danger',
      statusLabel: 'Error',
      detail: commandLine,
      lastExitLabel,
      lastErrorLabel: runtime?.lastError ?? 'Preview runtime reported an error.',
    };
  }

  if (status === 'running' || status === 'starting') {
    return {
      tone: 'healthy',
      statusLabel: formatRuntimeStatusLabel(status),
      detail: commandLine,
      lastExitLabel,
      lastErrorLabel: runtime?.lastError ?? undefined,
    };
  }

  if (typeof runtime?.lastExitCode === 'number' && runtime.lastExitCode !== 0) {
    return {
      tone: 'warning',
      statusLabel: formatRuntimeStatusLabel(status),
      detail: commandLine,
      lastExitLabel,
      lastErrorLabel: runtime?.lastError ?? undefined,
    };
  }

  return {
    tone: status === 'stopped' ? 'warning' : 'muted',
    statusLabel: formatRuntimeStatusLabel(status),
    detail: commandLine,
    lastExitLabel,
    lastErrorLabel: runtime?.lastError ?? undefined,
  };
}

export async function restartPreviewRuntime(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const project = appState.projects.find((entry) => entry.id === projectId);
  if (!project) {
    return { ok: false, error: 'Project not found.' };
  }

  try {
    await window.calder.cliSurface.restart(projectId);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Failed to restart preview runtime.' };
  }
}
