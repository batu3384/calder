import type { CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceStartupTiming } from '../shared/types';
import { killPty, resizePty, spawnCommandPty, writePty } from './pty-manager';
import { resolveCliSurfaceLaunch } from './cli-surface-port-orchestrator';

export function createCliSurfaceRuntimeManager(emit: {
  data(projectId: string, data: string): void;
  exit(projectId: string, exitCode: number, signal?: number): void;
  status(projectId: string, state: CliSurfaceRuntimeState): void;
  error(projectId: string, message: string): void;
}) {
  const profiles = new Map<string, CliSurfaceProfile>();
  const pendingData = new Map<string, string[]>();
  const dataFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const runningEmitted = new Set<string>();
  const startupTimings = new Map<string, CliSurfaceStartupTiming>();
  const runtimeLaunches = new Map<
    string,
    {
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
  >();

  function resolveLaunch(profile: CliSurfaceProfile): {
    command: string;
    args?: string[];
    cwd: string;
    envPatch?: Record<string, string>;
    cols?: number;
    rows?: number;
  } {
    return {
      command: profile.command,
      args: profile.args,
      cwd: profile.cwd ?? process.cwd(),
      envPatch: profile.envPatch,
      cols: profile.cols,
      rows: profile.rows,
    };
  }

  function getRuntimeId(projectId: string): string {
    return `cli-surface:${projectId}`;
  }

  function flushData(projectId: string): void {
    const chunks = pendingData.get(projectId);
    if (!chunks || chunks.length === 0) return;
    pendingData.delete(projectId);
    const timer = dataFlushTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      dataFlushTimers.delete(projectId);
    }
    emit.data(projectId, chunks.join(''));
  }

  function queueData(projectId: string, data: string): void {
    const chunks = pendingData.get(projectId) ?? [];
    chunks.push(data);
    pendingData.set(projectId, chunks);
    if (dataFlushTimers.has(projectId)) return;
    dataFlushTimers.set(projectId, setTimeout(() => flushData(projectId), 16));
  }

  function buildRuntimeState(
    projectId: string,
    profile: CliSurfaceProfile | undefined,
    status: CliSurfaceRuntimeState['status'],
    extra: Partial<CliSurfaceRuntimeState> = {},
  ): CliSurfaceRuntimeState {
    const timing = startupTimings.get(projectId);
    const launch = runtimeLaunches.get(projectId);
    return {
      status,
      runtimeId: status === 'stopped' ? undefined : getRuntimeId(projectId),
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

  function markStopped(projectId: string): void {
    const timing = startupTimings.get(projectId);
    if (!timing) return;
    const stoppedAtMs = Date.now();
    timing.stoppedAtMs = stoppedAtMs;
    timing.totalRuntimeMs = Math.max(0, stoppedAtMs - timing.startedAtMs);
  }

  return {
    async start(projectId: string, profile: CliSurfaceProfile): Promise<void> {
      profiles.set(projectId, profile);
      runningEmitted.delete(projectId);
      startupTimings.set(projectId, { startedAtMs: Date.now() });
      runtimeLaunches.set(projectId, {
        selectedProfileId: profile.id,
        command: profile.command,
        args: profile.args ? [...profile.args] : undefined,
        cwd: profile.cwd ?? process.cwd(),
        cols: profile.cols,
        rows: profile.rows,
        portMode: profile.portMode,
      });
      emit.status(projectId, buildRuntimeState(projectId, profile, 'starting'));

      const reservedPorts = new Set<number>();
      for (const [runtimeProjectId, launch] of runtimeLaunches.entries()) {
        if (runtimeProjectId === projectId) continue;
        if (typeof launch.resolvedPort === 'number') {
          reservedPorts.add(launch.resolvedPort);
        }
      }

      let launch = resolveLaunch(profile);
      try {
        const resolved = await resolveCliSurfaceLaunch(projectId, profile, reservedPorts);
        launch = resolved.launch;
        runtimeLaunches.set(projectId, {
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
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to prepare CLI surface launch.';
        runningEmitted.delete(projectId);
        markStopped(projectId);
        emit.error(projectId, message);
        emit.status(
          projectId,
          buildRuntimeState(projectId, profile, 'error', { lastError: message }),
        );
        return;
      }

      spawnCommandPty(
        getRuntimeId(projectId),
        launch,
        (data) => {
          if (!runningEmitted.has(projectId)) {
            runningEmitted.add(projectId);
            const timing = startupTimings.get(projectId);
            if (timing && timing.firstOutputAtMs === undefined) {
              const firstOutputAtMs = Date.now();
              timing.firstOutputAtMs = firstOutputAtMs;
              timing.firstOutputLatencyMs = Math.max(0, firstOutputAtMs - timing.startedAtMs);
              timing.runningAtMs = firstOutputAtMs;
            }
            emit.status(projectId, buildRuntimeState(projectId, profile, 'running'));
          }
          queueData(projectId, data);
        },
        (exitCode, signal) => {
          runningEmitted.delete(projectId);
          markStopped(projectId);
          flushData(projectId);
          runtimeLaunches.delete(projectId);
          emit.exit(projectId, exitCode, signal);
          emit.status(projectId, buildRuntimeState(projectId, profile, 'stopped', { lastExitCode: exitCode }));
        },
      );

      const timing = startupTimings.get(projectId);
      if (timing) {
        const ptySpawnedAtMs = Date.now();
        timing.ptySpawnedAtMs = ptySpawnedAtMs;
        timing.spawnLatencyMs = Math.max(0, ptySpawnedAtMs - timing.startedAtMs);
        emit.status(projectId, buildRuntimeState(projectId, profile, 'starting'));
      }
    },

    write(projectId: string, data: string): void {
      writePty(getRuntimeId(projectId), data);
    },

    resize(projectId: string, cols: number, rows: number): void {
      resizePty(getRuntimeId(projectId), cols, rows);
    },

    stop(projectId: string): void {
      runningEmitted.delete(projectId);
      markStopped(projectId);
      flushData(projectId);
      killPty(getRuntimeId(projectId));
      runtimeLaunches.delete(projectId);
      const profile = profiles.get(projectId);
      emit.status(projectId, buildRuntimeState(projectId, profile, 'stopped'));
    },

    async restart(projectId: string): Promise<void> {
      const profile = profiles.get(projectId);
      if (!profile) {
        emit.error(projectId, 'No CLI surface profile is selected.');
        return;
      }
      this.stop(projectId);
      await this.start(projectId, profile);
    },
  };
}
