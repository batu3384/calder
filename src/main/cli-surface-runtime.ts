import type { CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceStartupTiming } from '../shared/types/project-surface';
import { resolveCliSurfaceLaunch } from './cli-surface-port-orchestrator';
import {
  appendStartupReadyOutput,
  buildRuntimeState,
  type CliSurfaceRuntimeEmit,
  type CliSurfaceRuntimeLaunchState,
  collectReservedPorts,
  compileStartupReadyPattern,
  createInitialRuntimeLaunchState,
  createResolvedRuntimeLaunchState,
  getCliSurfaceRuntimeId,
  markStartupSpawned,
  markStartupStopped,
  recordStartupFirstOutput,
  resolveRuntimeLaunch,
} from './cli-surface-runtime-helpers';
import { killPty, resizePty, spawnCommandPty, writePty } from './pty-manager';

const MAX_STARTUP_READY_BUFFER = 8192;

export function createCliSurfaceRuntimeManager(emit: CliSurfaceRuntimeEmit) {
  const profiles = new Map<string, CliSurfaceProfile>();
  const pendingData = new Map<string, string[]>();
  const dataFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const runningEmitted = new Set<string>();
  const startupReadyBuffers = new Map<string, string>();
  const startupTimings = new Map<string, CliSurfaceStartupTiming>();
  const runtimeLaunches = new Map<string, CliSurfaceRuntimeLaunchState>();

  function createRuntimeState(
    projectId: string,
    profile: CliSurfaceProfile | undefined,
    status: CliSurfaceRuntimeState['status'],
    extra: Partial<CliSurfaceRuntimeState> = {},
  ): CliSurfaceRuntimeState {
    return buildRuntimeState({
      projectId,
      profile,
      status,
      startupTimings,
      runtimeLaunches,
      extra,
    });
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

  function markRunning(projectId: string, profile: CliSurfaceProfile): void {
    if (runningEmitted.has(projectId)) return;
    runningEmitted.add(projectId);
    const timing = startupTimings.get(projectId);
    if (timing) {
      timing.runningAtMs = Date.now();
    }
    emit.status(projectId, createRuntimeState(projectId, profile, 'running'));
  }

  return {
    async start(projectId: string, profile: CliSurfaceProfile): Promise<void> {
      profiles.set(projectId, profile);
      runningEmitted.delete(projectId);
      startupReadyBuffers.delete(projectId);
      startupTimings.set(projectId, { startedAtMs: Date.now() });
      runtimeLaunches.set(projectId, createInitialRuntimeLaunchState(profile));
      emit.status(projectId, createRuntimeState(projectId, profile, 'starting'));

      const reservedPorts = collectReservedPorts(projectId, runtimeLaunches);
      let launch = resolveRuntimeLaunch(profile);
      try {
        const resolved = await resolveCliSurfaceLaunch(projectId, profile, reservedPorts);
        launch = resolved.launch;
        runtimeLaunches.set(projectId, createResolvedRuntimeLaunchState(profile, resolved));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to prepare CLI surface launch.';
        runningEmitted.delete(projectId);
        markStartupStopped(projectId, startupTimings);
        emit.error(projectId, message);
        emit.status(projectId, createRuntimeState(projectId, profile, 'error', { lastError: message }));
        return;
      }

      const startupReadyPattern = compileStartupReadyPattern(projectId, profile.startupReadyPattern, emit);
      spawnCommandPty(
        getCliSurfaceRuntimeId(projectId),
        launch,
        (data) => {
          recordStartupFirstOutput(projectId, startupTimings);
          if (startupReadyPattern && !runningEmitted.has(projectId)) {
            const readyOutput = appendStartupReadyOutput({
              projectId,
              data,
              startupReadyBuffers,
              maxBufferLength: MAX_STARTUP_READY_BUFFER,
            });
            if (startupReadyPattern.test(readyOutput)) {
              markRunning(projectId, profile);
            }
          }
          queueData(projectId, data);
        },
        (exitCode, signal) => {
          runningEmitted.delete(projectId);
          startupReadyBuffers.delete(projectId);
          markStartupStopped(projectId, startupTimings);
          flushData(projectId);
          runtimeLaunches.delete(projectId);
          emit.exit(projectId, exitCode, signal);
          emit.status(projectId, createRuntimeState(projectId, profile, 'stopped', { lastExitCode: exitCode }));
        },
      );

      if (markStartupSpawned(projectId, startupTimings)) {
        emit.status(projectId, createRuntimeState(projectId, profile, 'starting'));
      }
      if (!startupReadyPattern) {
        markRunning(projectId, profile);
      }
    },

    write(projectId: string, data: string): void {
      writePty(getCliSurfaceRuntimeId(projectId), data);
    },

    resize(projectId: string, cols: number, rows: number): void {
      resizePty(getCliSurfaceRuntimeId(projectId), cols, rows);
    },

    stop(projectId: string): void {
      runningEmitted.delete(projectId);
      startupReadyBuffers.delete(projectId);
      markStartupStopped(projectId, startupTimings);
      flushData(projectId);
      killPty(getCliSurfaceRuntimeId(projectId));
      runtimeLaunches.delete(projectId);
      const profile = profiles.get(projectId);
      emit.status(projectId, createRuntimeState(projectId, profile, 'stopped'));
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
