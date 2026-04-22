import { execFile } from 'child_process';
import type { CliProvider } from './providers/provider';
import { getAllProviders } from './providers/registry';
import { getFullPath } from './pty-manager';
import {
  detectUpdateSource,
  readBinaryVersion,
  resolveRealPath,
  runProviderUpdate,
} from './provider-updater-update-helpers';
import type { ProviderUpdateSpec, ProviderUpdaterRunner } from './provider-updater-types';
import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../shared/types/provider';

export type { ProviderUpdaterRunner } from './provider-updater-types';

export interface ProviderUpdaterTarget {
  meta: Pick<CliProvider['meta'], 'id' | 'displayName'>;
  resolveBinaryPath(): string;
  validatePrerequisites(): { ok: boolean; message: string };
}

interface ProviderUpdaterOptions {
  runner?: ProviderUpdaterRunner;
  now?: () => number;
  onProgress?: (event: ProviderUpdateProgressEvent) => void;
  signal?: AbortSignal;
}

const CHECK_TIMEOUT_MS = 20_000;
const UPDATE_TIMEOUT_MS = 6 * 60_000;

const PROVIDER_UPDATE_SPECS: Record<ProviderId, ProviderUpdateSpec> = {
  claude: {
    npmPackage: '@anthropic-ai/claude-code',
    selfUpdateArgs: ['update'],
  },
  codex: {
    npmPackage: '@openai/codex',
    brewCask: 'codex',
  },
  copilot: {
    npmPackage: '@github/copilot',
    brewCask: 'copilot-cli',
  },
  gemini: {
    npmPackage: '@google/gemini-cli',
    brewFormula: 'gemini-cli',
  },
  qwen: {
    npmPackage: '@qwen-code/qwen-code',
    brewFormula: 'qwen-code',
  },
};

const defaultRunner: ProviderUpdaterRunner = {
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
          const err = error as NodeJS.ErrnoException & { code?: number | string; stdout?: string; stderr?: string };
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

export async function updateAllProviders(options?: ProviderUpdaterOptions): Promise<ProviderUpdateSummary> {
  return updateProviders(getAllProviders(), options);
}

export async function updateProviders(
  providers: ProviderUpdaterTarget[],
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  const runner = options?.runner ?? defaultRunner;
  const now = options?.now ?? Date.now;
  const onProgress = options?.onProgress;
  const signal = options?.signal;
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const results: ProviderUpdateResult[] = [];
  const providerTargets = providers.map((provider) => ({
    providerId: provider.meta.id,
    providerName: provider.meta.displayName,
  }));

  onProgress?.({
    phase: 'started',
    startedAt,
    totalProviders: providers.length,
    completedProviders: 0,
    providers: providerTargets,
  });

  if (signal?.aborted) {
    const finishedAt = new Date(now()).toISOString();
    const summary: ProviderUpdateSummary = {
      startedAt,
      finishedAt,
      results,
      cancelled: true,
    };
    onProgress?.({
      phase: 'finished',
      startedAt,
      finishedAt,
      cancelled: true,
      totalProviders: providers.length,
      completedProviders: results.length,
    });
    return summary;
  }

  for (const provider of providers) {
    if (signal?.aborted) {
      break;
    }
    const providerStart = now();
    const id = provider.meta.id;
    const providerName = provider.meta.displayName;
    const spec = PROVIDER_UPDATE_SPECS[id];
    const prerequisites = provider.validatePrerequisites();

    onProgress?.({
      phase: 'provider_started',
      startedAt,
      totalProviders: providers.length,
      completedProviders: results.length,
      providerId: id,
      providerName,
      providerMessage: 'Preparing update checks…',
    });

    const emitProviderMessage = (providerMessage: string): void => {
      onProgress?.({
        phase: 'provider_started',
        startedAt,
        totalProviders: providers.length,
        completedProviders: results.length,
        providerId: id,
        providerName,
        providerMessage,
      });
    };

    if (!prerequisites.ok) {
      const result: ProviderUpdateResult = {
        providerId: id,
        providerName,
        source: 'unknown',
        status: 'skipped',
        checked: false,
        updateAttempted: false,
        message: `${providerName} is not installed.`,
        durationMs: Math.max(0, now() - providerStart),
      };
      results.push(result);
      onProgress?.({
        phase: 'provider_finished',
        startedAt,
        totalProviders: providers.length,
        completedProviders: results.length,
        providerId: id,
        providerName,
        result,
      });
      continue;
    }

    if (!spec) {
      const result: ProviderUpdateResult = {
        providerId: id,
        providerName,
        source: 'unknown',
        status: 'skipped',
        checked: false,
        updateAttempted: false,
        message: 'No update strategy configured for this provider.',
        durationMs: Math.max(0, now() - providerStart),
      };
      results.push(result);
      onProgress?.({
        phase: 'provider_finished',
        startedAt,
        totalProviders: providers.length,
        completedProviders: results.length,
        providerId: id,
        providerName,
        result,
      });
      continue;
    }

    const binaryPath = provider.resolveBinaryPath();
    const resolvedBinaryPath = resolveRealPath(binaryPath);
    const source = detectUpdateSource(id, spec, resolvedBinaryPath);
    emitProviderMessage('Checking installed version…');
    const beforeVersion = await readBinaryVersion(runner, binaryPath, signal);

    const baseResult = await runProviderUpdate({
      providerId: id,
      providerName,
      binaryPath,
      source,
      spec,
      beforeVersion,
      runner,
      signal,
      onStage: emitProviderMessage,
    });
    const result: ProviderUpdateResult = {
      ...baseResult,
      durationMs: Math.max(0, now() - providerStart),
    };

    results.push(result);
    onProgress?.({
      phase: 'provider_finished',
      startedAt,
      totalProviders: providers.length,
      completedProviders: results.length,
      providerId: id,
      providerName,
      result,
    });

    if (result.status === 'cancelled') {
      break;
    }
  }

  const finishedAt = new Date(now()).toISOString();
  const summary: ProviderUpdateSummary = {
    startedAt,
    finishedAt,
    results,
    cancelled: signal?.aborted === true,
  };
  onProgress?.({
    phase: 'finished',
    startedAt,
    finishedAt,
    cancelled: summary.cancelled,
    totalProviders: providers.length,
    completedProviders: results.length,
  });
  return summary;
}
