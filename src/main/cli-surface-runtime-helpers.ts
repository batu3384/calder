import type { CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceStartupTiming } from '../shared/types/project';
import type { CliSurfaceLaunchResolution } from './cli-surface-port-orchestrator';

export interface CliSurfaceRuntimeEmit {
  data(projectId: string, data: string): void;
  exit(projectId: string, exitCode: number, signal?: number): void;
  status(projectId: string, state: CliSurfaceRuntimeState): void;
  error(projectId: string, message: string): void;
}

export interface CliSurfaceRuntimeLaunchState {
  selectedProfileId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  resolvedPort?: number;
  resolvedUrl?: string;
  portMode?: CliSurfaceRuntimeState['portMode'];
  portFallbackUsed?: boolean;
  portReason?: string;
}

export interface CliSurfaceRuntimeLaunchInput {
  command: string;
  args?: string[];
  cwd: string;
  envPatch?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export function getCliSurfaceRuntimeId(projectId: string): string {
  return `cli-surface:${projectId}`;
}

export function resolveRuntimeLaunch(profile: CliSurfaceProfile): CliSurfaceRuntimeLaunchInput {
  return {
    command: profile.command,
    args: profile.args,
    cwd: profile.cwd ?? process.cwd(),
    envPatch: profile.envPatch,
    cols: profile.cols,
    rows: profile.rows,
  };
}

export function createInitialRuntimeLaunchState(profile: CliSurfaceProfile): CliSurfaceRuntimeLaunchState {
  return {
    selectedProfileId: profile.id,
    command: profile.command,
    args: profile.args ? [...profile.args] : undefined,
    cwd: profile.cwd ?? process.cwd(),
    cols: profile.cols,
    rows: profile.rows,
    portMode: profile.portMode,
  };
}

export function createResolvedRuntimeLaunchState(
  profile: CliSurfaceProfile,
  resolved: CliSurfaceLaunchResolution,
): CliSurfaceRuntimeLaunchState {
  return {
    selectedProfileId: profile.id,
    command: resolved.launch.command,
    args: resolved.launch.args ? [...resolved.launch.args] : undefined,
    cwd: resolved.launch.cwd,
    cols: resolved.launch.cols,
    rows: resolved.launch.rows,
    resolvedPort: resolved.metadata.resolvedPort,
    resolvedUrl: resolved.metadata.resolvedUrl,
    portMode: resolved.metadata.portMode,
    portFallbackUsed: resolved.metadata.portFallbackUsed,
    portReason: resolved.metadata.portReason,
  };
}

export function collectReservedPorts(
  projectId: string,
  runtimeLaunches: Map<string, CliSurfaceRuntimeLaunchState>,
): Set<number> {
  const reservedPorts = new Set<number>();
  for (const [runtimeProjectId, launch] of runtimeLaunches.entries()) {
    if (runtimeProjectId === projectId) continue;
    if (typeof launch.resolvedPort === 'number') {
      reservedPorts.add(launch.resolvedPort);
    }
  }
  return reservedPorts;
}

export function buildRuntimeState(params: {
  projectId: string;
  profile?: CliSurfaceProfile;
  status: CliSurfaceRuntimeState['status'];
  startupTimings: Map<string, CliSurfaceStartupTiming>;
  runtimeLaunches: Map<string, CliSurfaceRuntimeLaunchState>;
  extra?: Partial<CliSurfaceRuntimeState>;
}): CliSurfaceRuntimeState {
  const { projectId, profile, status, startupTimings, runtimeLaunches, extra = {} } = params;
  const timing = startupTimings.get(projectId);
  const launch = runtimeLaunches.get(projectId);
  return {
    status,
    runtimeId: status === 'stopped' ? undefined : getCliSurfaceRuntimeId(projectId),
    selectedProfileId: launch?.selectedProfileId ?? profile?.id,
    command: launch?.command ?? profile?.command,
    args: launch?.args ?? profile?.args,
    cwd: launch?.cwd ?? profile?.cwd,
    cols: launch?.cols ?? profile?.cols,
    rows: launch?.rows ?? profile?.rows,
    resolvedPort: launch?.resolvedPort,
    resolvedUrl: launch?.resolvedUrl,
    portMode: launch?.portMode ?? profile?.portMode,
    portFallbackUsed: launch?.portFallbackUsed,
    portReason: launch?.portReason,
    ...(timing ? { startupTiming: { ...timing } } : {}),
    ...extra,
  };
}

export function markStartupStopped(
  projectId: string,
  startupTimings: Map<string, CliSurfaceStartupTiming>,
): void {
  const timing = startupTimings.get(projectId);
  if (!timing) return;
  const stoppedAtMs = Date.now();
  timing.stoppedAtMs = stoppedAtMs;
  timing.totalRuntimeMs = Math.max(0, stoppedAtMs - timing.startedAtMs);
}

export function recordStartupFirstOutput(
  projectId: string,
  startupTimings: Map<string, CliSurfaceStartupTiming>,
): void {
  const timing = startupTimings.get(projectId);
  if (!timing || timing.firstOutputAtMs !== undefined) return;
  const firstOutputAtMs = Date.now();
  timing.firstOutputAtMs = firstOutputAtMs;
  timing.firstOutputLatencyMs = Math.max(0, firstOutputAtMs - timing.startedAtMs);
}

export function markStartupSpawned(
  projectId: string,
  startupTimings: Map<string, CliSurfaceStartupTiming>,
): boolean {
  const timing = startupTimings.get(projectId);
  if (!timing) return false;
  const ptySpawnedAtMs = Date.now();
  timing.ptySpawnedAtMs = ptySpawnedAtMs;
  timing.spawnLatencyMs = Math.max(0, ptySpawnedAtMs - timing.startedAtMs);
  return true;
}

export function compileStartupReadyPattern(
  projectId: string,
  pattern: string | undefined,
  emit: Pick<CliSurfaceRuntimeEmit, 'error'>,
): RegExp | undefined {
  if (!pattern) return undefined;
  try {
    return new RegExp(pattern, 'm');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid regular expression.';
    emit.error(projectId, `Invalid CLI surface startup ready pattern: ${message}`);
    return undefined;
  }
}

export function appendStartupReadyOutput(params: {
  projectId: string;
  data: string;
  startupReadyBuffers: Map<string, string>;
  maxBufferLength: number;
}): string {
  const { projectId, data, startupReadyBuffers, maxBufferLength } = params;
  const current = startupReadyBuffers.get(projectId) ?? '';
  const next = `${current}${data}`.slice(-maxBufferLength);
  startupReadyBuffers.set(projectId, next);
  return next;
}
