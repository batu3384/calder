import { execFile } from 'child_process';
import type { CliProvider } from './providers/provider';
import { getAllProviders } from './providers/registry';
import { getFullPath } from './pty-manager';
import {
  buildProviderUpdateSummary,
  buildSkippedProviderResult,
  createProviderProgressEmitter,
  emitUpdateFinished,
  emitUpdateStarted,
  type ProviderProgressContext,
} from './provider-updater/progress-helpers';
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

interface ResolvedProviderUpdaterOptions {
  runner: ProviderUpdaterRunner;
  now: () => number;
  onProgress?: (event: ProviderUpdateProgressEvent) => void;
  signal?: AbortSignal;
}

interface RunConfiguredProviderUpdateInput {
  provider: ProviderUpdaterTarget;
  providerId: ProviderId;
  providerName: string;
  spec: ProviderUpdateSpec;
  providerStart: number;
  runner: ProviderUpdaterRunner;
  now: () => number;
  signal?: AbortSignal;
  emitProviderMessage: (providerMessage: string) => void;
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

function resolveUpdaterOptions(options?: ProviderUpdaterOptions): ResolvedProviderUpdaterOptions {
  return {
    runner: options?.runner ?? defaultRunner,
    now: options?.now ?? Date.now,
    onProgress: options?.onProgress,
    signal: options?.signal,
  };
}

async function runConfiguredProviderUpdate(input: RunConfiguredProviderUpdateInput): Promise<ProviderUpdateResult> {
  const {
    provider,
    providerId,
    providerName,
    spec,
    providerStart,
    runner,
    now,
    signal,
    emitProviderMessage,
  } = input;
  const binaryPath = provider.resolveBinaryPath();
  const resolvedBinaryPath = resolveRealPath(binaryPath);
  const source = detectUpdateSource(providerId, spec, resolvedBinaryPath);
  emitProviderMessage('Checking installed version…');
  const beforeVersion = await readBinaryVersion(runner, binaryPath, signal);

  const baseResult = await runProviderUpdate({
    providerId,
    providerName,
    binaryPath,
    source,
    spec,
    beforeVersion,
    runner,
    signal,
    onStage: emitProviderMessage,
  });
  return {
    ...baseResult,
    durationMs: Math.max(0, now() - providerStart),
  };
}

export async function updateProviders(
  providers: ProviderUpdaterTarget[],
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  const { runner, now, onProgress, signal } = resolveUpdaterOptions(options);
  const startedAt = new Date(now()).toISOString();
  const results: ProviderUpdateResult[] = [];
  const providerTargets = providers.map((provider) => ({
    providerId: provider.meta.id,
    providerName: provider.meta.displayName,
  }));
  const progressContext: ProviderProgressContext = {
    startedAt,
    totalProviders: providers.length,
    getCompletedProviders: () => results.length,
    onProgress,
  };
  emitUpdateStarted(progressContext, providerTargets);

  if (signal?.aborted) {
    const finishedAt = new Date(now()).toISOString();
    const summary = buildProviderUpdateSummary({
      startedAt,
      finishedAt,
      results,
      cancelled: true,
    });
    emitUpdateFinished(progressContext, finishedAt, true);
    return summary;
  }

  for (const provider of providers) {
    if (signal?.aborted) {
      break;
    }
    const providerStart = now();
    const id = provider.meta.id;
    const providerName = provider.meta.displayName;
    const progress = createProviderProgressEmitter(progressContext, id, providerName);
    progress.started('Preparing update checks…');

    const prerequisites = provider.validatePrerequisites();
    if (!prerequisites.ok) {
      const result = buildSkippedProviderResult({
        providerId: id,
        providerName,
        message: `${providerName} is not installed.`,
        durationMs: Math.max(0, now() - providerStart),
      });
      results.push(result);
      progress.finished(result);
      continue;
    }

    const spec = PROVIDER_UPDATE_SPECS[id];
    if (!spec) {
      const result = buildSkippedProviderResult({
        providerId: id,
        providerName,
        message: 'No update strategy configured for this provider.',
        durationMs: Math.max(0, now() - providerStart),
      });
      results.push(result);
      progress.finished(result);
      continue;
    }

    const result = await runConfiguredProviderUpdate({
      provider,
      providerId: id,
      providerName,
      spec,
      providerStart,
      runner,
      now,
      signal,
      emitProviderMessage: progress.message,
    });
    results.push(result);
    progress.finished(result);

    if (result.status === 'cancelled') {
      break;
    }
  }

  const finishedAt = new Date(now()).toISOString();
  const summary = buildProviderUpdateSummary({
    startedAt,
    finishedAt,
    results,
    cancelled: signal?.aborted === true,
  });
  emitUpdateFinished(progressContext, finishedAt, summary.cancelled ?? false);
  return summary;
}
