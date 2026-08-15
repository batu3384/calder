import { execFile } from 'child_process';

import type { ProviderUpdaterRunner } from '../provider-updater-types';
import { getFullPath } from '../pty-manager';

export const CHECK_TIMEOUT_MS = 20_000;

export const defaultRunner: ProviderUpdaterRunner = {
  run(command, args, options) {
    const timeoutMs = options?.timeoutMs ?? CHECK_TIMEOUT_MS;
    const signal = options?.signal;
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve({ code: 130, stdout: '', stderr: 'Update cancelled.' });
        return;
      }

      let settled = false;
      const finish = (result: { code: number; stdout: string; stderr: string }): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const child = execFile(
        command,
        args,
        {
          env: { ...process.env, PATH: getFullPath() },
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: 2 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (!error) {
            finish({ code: 0, stdout, stderr });
            return;
          }
          const err = error as NodeJS.ErrnoException & {
            code?: number | string;
            stdout?: string;
            stderr?: string;
          };
          if (signal?.aborted) {
            finish({
              code: 130,
              stdout: err.stdout ?? stdout ?? '',
              stderr: err.stderr ?? stderr ?? 'Update cancelled.',
            });
            return;
          }
          const exitCode = typeof err.code === 'number' ? err.code : 1;
          finish({
            code: exitCode,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? 'Command failed',
          });
        },
      );

      if (!signal) return;

      const forceKillTimer = { current: null as ReturnType<typeof setTimeout> | null };
      const clearForceKill = (): void => {
        if (!forceKillTimer.current) return;
        clearTimeout(forceKillTimer.current);
        forceKillTimer.current = null;
      };
      const abortHandler = (): void => {
        try {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
          forceKillTimer.current = setTimeout(() => {
            try {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            } catch {
              // no-op: process already exited
            }
          }, 1200);
          forceKillTimer.current.unref?.();
        } catch {
          // no-op: process already exited
        }
      };

      child.once('close', () => {
        clearForceKill();
        signal.removeEventListener('abort', abortHandler);
      });

      signal.addEventListener('abort', abortHandler, { once: true });
      if (signal.aborted) {
        abortHandler();
      }
    });
  },
};
