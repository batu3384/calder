import { execFile } from 'child_process';

import type {
  MobileDependencyReport,
} from '../shared/types/mobile';
import {
  type MobileDoctorCommandResult,
  type MobileDoctorCommandRunner,
  runMobileDependencyChecks,
  summarizeMobileDependencyChecks,
} from './mobile-dependency-doctor-checks';
import {
  type InstallDependencyOptions,
  installMobileDependency as installMobileDependencyInternal,
} from './mobile-dependency-doctor-install';
import {
  parseInstalledDriverFromJson,
  parseInstalledDriverVersion,
  parseJavaMajor,
} from './mobile-dependency-doctor-utils';
import { getFullPath } from './pty-manager';

const CHECK_TIMEOUT_MS = 20_000;

interface DoctorOptions {
  runner?: MobileDoctorCommandRunner;
  hostPlatform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

const defaultRunner: MobileDoctorCommandRunner = {
  run(command, args, options): Promise<MobileDoctorCommandResult> {
    const timeoutMs = options?.timeoutMs ?? CHECK_TIMEOUT_MS;
    return new Promise((resolve) => {
      execFile(
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
            resolve({ code: 0, stdout, stderr });
            return;
          }

          const err = error as NodeJS.ErrnoException & {
            code?: number | string;
            stdout?: string;
            stderr?: string;
          };
          resolve({
            code: typeof err.code === 'number' ? err.code : 1,
            stdout: err.stdout ?? stdout ?? '',
            stderr: err.stderr ?? stderr ?? err.message ?? '',
          });
        },
      );
    });
  },
};

export async function checkMobileDependencies(options?: DoctorOptions): Promise<MobileDependencyReport> {
  const runner = options?.runner ?? defaultRunner;
  const hostPlatform = options?.hostPlatform ?? process.platform;
  const env = options?.env ?? process.env;

  const checks = await runMobileDependencyChecks({
    runner,
    hostPlatform,
    env,
  });

  return {
    generatedAt: new Date().toISOString(),
    hostPlatform,
    checks,
    summary: summarizeMobileDependencyChecks(checks),
  };
}

export async function installMobileDependency(
  dependencyId: Parameters<typeof installMobileDependencyInternal>[0],
  options?: InstallDependencyOptions,
): ReturnType<typeof installMobileDependencyInternal> {
  return installMobileDependencyInternal(dependencyId, options);
}

export const _internal = {
  parseInstalledDriverVersion,
  parseInstalledDriverFromJson,
  parseJavaMajor,
};
