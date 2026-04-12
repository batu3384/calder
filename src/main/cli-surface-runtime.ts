import type { CliSurfaceProfile, CliSurfaceRuntimeState } from '../shared/types';
import { killPty, resizePty, spawnCommandPty, writePty } from './pty-manager';

export function createCliSurfaceRuntimeManager(emit: {
  data(projectId: string, data: string): void;
  exit(projectId: string, exitCode: number, signal?: number): void;
  status(projectId: string, state: CliSurfaceRuntimeState): void;
  error(projectId: string, message: string): void;
}) {
  const profiles = new Map<string, CliSurfaceProfile>();

  function getRuntimeId(projectId: string): string {
    return `cli-surface:${projectId}`;
  }

  return {
    start(projectId: string, profile: CliSurfaceProfile): void {
      profiles.set(projectId, profile);
      emit.status(projectId, {
        status: 'starting',
        runtimeId: getRuntimeId(projectId),
        selectedProfileId: profile.id,
        command: profile.command,
        args: profile.args,
        cwd: profile.cwd,
        cols: profile.cols,
        rows: profile.rows,
      });

      spawnCommandPty(
        getRuntimeId(projectId),
        {
          command: profile.command,
          args: profile.args,
          cwd: profile.cwd ?? process.cwd(),
          envPatch: profile.envPatch,
          cols: profile.cols,
          rows: profile.rows,
        },
        (data) => emit.data(projectId, data),
        (exitCode, signal) => {
          emit.exit(projectId, exitCode, signal);
          emit.status(projectId, {
            status: 'stopped',
            selectedProfileId: profile.id,
            command: profile.command,
            args: profile.args,
            cwd: profile.cwd,
            cols: profile.cols,
            rows: profile.rows,
            lastExitCode: exitCode,
          });
        },
      );
    },

    write(projectId: string, data: string): void {
      writePty(getRuntimeId(projectId), data);
    },

    resize(projectId: string, cols: number, rows: number): void {
      resizePty(getRuntimeId(projectId), cols, rows);
    },

    stop(projectId: string): void {
      killPty(getRuntimeId(projectId));
      const profile = profiles.get(projectId);
      emit.status(projectId, {
        status: 'stopped',
        selectedProfileId: profile?.id,
        command: profile?.command,
        args: profile?.args,
        cwd: profile?.cwd,
      });
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
