import type { CliSurfaceProfile, CliSurfaceRuntimeState, CliSurfaceStartupTiming } from '../shared/types';
import path from 'node:path';
import { CLI_SURFACE_DEMO_COMMAND } from '../shared/constants';
import { killPty, resizePty, spawnCommandPty, writePty } from './pty-manager';

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

  function resolveLaunch(profile: CliSurfaceProfile): {
    command: string;
    args?: string[];
    cwd: string;
    envPatch?: Record<string, string>;
    cols?: number;
    rows?: number;
  } {
    if (profile.command === CLI_SURFACE_DEMO_COMMAND) {
      return {
        command: process.execPath,
        args: [path.join(__dirname, 'fixtures', 'cli-surface-demo.js')],
        cwd: profile.cwd ?? process.cwd(),
        envPatch: {
          ...(profile.envPatch ?? {}),
          ELECTRON_RUN_AS_NODE: '1',
        },
        cols: profile.cols,
        rows: profile.rows,
      };
    }

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
    return {
      status,
      runtimeId: status === 'stopped' ? undefined : getRuntimeId(projectId),
      selectedProfileId: profile?.id,
      command: profile?.command,
      args: profile?.args,
      cwd: profile?.cwd,
      cols: profile?.cols,
      rows: profile?.rows,
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
    start(projectId: string, profile: CliSurfaceProfile): void {
      profiles.set(projectId, profile);
      runningEmitted.delete(projectId);
      startupTimings.set(projectId, { startedAtMs: Date.now() });
      emit.status(projectId, buildRuntimeState(projectId, profile, 'starting'));

      spawnCommandPty(
        getRuntimeId(projectId),
        resolveLaunch(profile),
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
      const profile = profiles.get(projectId);
      emit.status(projectId, buildRuntimeState(projectId, profile, 'stopped'));
    },

    restart(projectId: string): void {
      const profile = profiles.get(projectId);
      if (!profile) {
        emit.error(projectId, 'No CLI surface profile is selected.');
        return;
      }
      this.stop(projectId);
      this.start(projectId, profile);
    },
  };
}
