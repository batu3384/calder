import { execFile } from 'child_process';

import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSource,
  ProviderUpdateSummary,
} from '../shared/types/provider';
import {
  buildProviderUpdateSummary,
  buildSkippedProviderResult,
  createProviderProgressEmitter,
  emitUpdateFinished,
  emitUpdateStarted,
  type ProviderProgressContext,
} from './provider-updater/progress-helpers';
import type { ProviderUpdaterRunner,ProviderUpdateSpec } from './provider-updater-types';
import {
  detectUpdateSource,
  readBinaryVersion,
  resolveRealPath,
  runProviderUpdate,
} from './provider-updater-update-helpers';
import type { CliProvider } from './providers/provider';
import { getAllProviders, getProvider } from './providers/registry';
import { getFullPath } from './pty-manager';

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

type ProviderUpdateSourceResolution = {
  source: ProviderUpdateSource;
  packageToken?: string;
};

const CHECK_TIMEOUT_MS = 20_000;

function getProviderStageProgress(message: string): number {
  if (message.includes('Checking installed version')) return 10;
  if (message.includes('latest npm') || message.includes('Homebrew')) return 30;
  if (message.includes('upstream npm')) return 45;
  if (message.includes('Trying') || message.includes('fallback')) return 58;
  if (message.includes('Applying update command')) return 72;
  if (message.includes('Verifying installed version')) return 90;
  if (message.includes('Already up to date') || message.includes('could not be detected')) return 100;
  return 50;
}

const PROVIDER_UPDATE_SPECS: Record<ProviderId, ProviderUpdateSpec> = {
  claude: {
    npmPackage: '@anthropic-ai/claude-code',
    brewCask: ['claude-code', 'claude-code@latest'],
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
  antigravity: {
    brewCask: 'antigravity-cli',
    selfUpdateArgs: ['update'],
  },
  qwen: {
    npmPackage: '@qwen-code/qwen-code',
    brewFormula: 'qwen-code',
  },
};

function buildProviderUpdateSourceAttempts(
  spec: ProviderUpdateSpec,
  primary: ProviderUpdateSourceResolution,
): ProviderUpdateSourceResolution[] {
  const attempts: ProviderUpdateSourceResolution[] = [primary];
  const seen = new Set<ProviderUpdateSource>([primary.source]);
  const pushAttempt = (attempt: ProviderUpdateSourceResolution): void => {
    if (seen.has(attempt.source)) return;
    attempts.push(attempt);
    seen.add(attempt.source);
  };

  if (primary.source === 'unknown') {
    if (spec.selfUpdateArgs) {
      pushAttempt({ source: 'self' });
    }
    if (spec.npmPackage) {
      pushAttempt({ source: 'npm' });
    }
    return attempts;
  }

  if (primary.source === 'self') {
    if (spec.npmPackage) pushAttempt({ source: 'npm' });
    return attempts;
  }

  if (primary.source === 'brew-cask' || primary.source === 'brew-formula') {
    if (spec.selfUpdateArgs) pushAttempt({ source: 'self' });
    if (spec.npmPackage) pushAttempt({ source: 'npm' });
    return attempts;
  }

  return attempts;
}

function shouldRetryWithFallback(result: Omit<ProviderUpdateResult, 'durationMs'>): boolean {
  if (result.status === 'error') return true;
  if (result.status === 'sync_pending' && result.source === 'brew-formula') return true;
  if (result.status !== 'skipped') return false;
  return (
    result.message.includes('No update command available')
    || result.message.includes('could not be determined')
    || result.message.includes('No update command configured')
  );
}

function getCommandNameFromBinaryPath(binaryPath: string): string {
  const normalized = binaryPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || binaryPath;
}

function getAttemptBinaryPath(
  binaryPath: string,
  primarySource: ProviderUpdateSource,
  attemptSource: ProviderUpdateSource,
): string {
  if (attemptSource === 'npm' && primarySource !== 'npm') {
    return getCommandNameFromBinaryPath(binaryPath);
  }
  return binaryPath;
}

function describeFallbackAttempt(providerName: string, source: ProviderUpdateSource): string {
  if (source === 'self') return `Retrying ${providerName} with its built-in updater…`;
  if (source === 'npm') return `Retrying ${providerName} with npm fallback…`;
  if (source === 'brew-cask') return `Retrying ${providerName} with Homebrew cask fallback…`;
  if (source === 'brew-formula') return `Retrying ${providerName} with Homebrew formula fallback…`;
  return `Retrying ${providerName} with an alternate updater…`;
}

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

export async function updateProviderById(
  providerId: ProviderId,
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  return updateProvider(getProvider(providerId), options);
}

export async function updateProvider(
  provider: ProviderUpdaterTarget,
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  return updateProviders([provider], options);
}

function resolveUpdaterOptions(options?: ProviderUpdaterOptions): ResolvedProviderUpdaterOptions {
  return {
    runner: options?.runner ?? defaultRunner,
    now: options?.now ?? Date.now,
    onProgress: options?.onProgress,
    signal: options?.signal,
  };
}

async function runConfiguredProviderUpdateAttempt(
  input: RunConfiguredProviderUpdateInput & {
    beforeVersion?: string;
    binaryPath: string;
    sourceResolution: ProviderUpdateSourceResolution;
  },
): Promise<Omit<ProviderUpdateResult, 'durationMs'>> {
  const {
    providerId,
    providerName,
    spec,
    binaryPath,
    beforeVersion,
    runner,
    signal,
    emitProviderMessage,
    sourceResolution,
  } = input;

  return runProviderUpdate({
    providerId,
    providerName,
    binaryPath,
    source: sourceResolution.source,
    sourcePackageToken: sourceResolution.packageToken,
    spec,
    beforeVersion,
    runner,
    signal,
    onStage: emitProviderMessage,
  });
}

async function runConfiguredProviderUpdate(input: RunConfiguredProviderUpdateInput): Promise<ProviderUpdateResult> {
  const { provider, providerId, providerName, spec, providerStart, runner, now, signal, emitProviderMessage } = input;
  const binaryPath = provider.resolveBinaryPath();
  const resolvedBinaryPath = resolveRealPath(binaryPath);
  emitProviderMessage('Checking installed version…');
  const beforeVersion = await readBinaryVersion(runner, binaryPath, signal);
  const sourceResolution = detectUpdateSource(providerId, spec, resolvedBinaryPath);
  const sourceAttempts = buildProviderUpdateSourceAttempts(spec, sourceResolution);

  let finalResult: Omit<ProviderUpdateResult, 'durationMs'> | null = null;
  for (let index = 0; index < sourceAttempts.length; index += 1) {
    finalResult = await runConfiguredProviderUpdateAttempt({
      provider,
      providerId,
      providerName,
      spec,
      providerStart,
      runner,
      now,
      signal,
      emitProviderMessage,
      binaryPath: getAttemptBinaryPath(binaryPath, sourceResolution.source, sourceAttempts[index].source),
      beforeVersion,
      sourceResolution: sourceAttempts[index],
    });
    const hasFallback = index < sourceAttempts.length - 1;
    if (!hasFallback || !shouldRetryWithFallback(finalResult)) {
      break;
    }
    emitProviderMessage(describeFallbackAttempt(providerName, sourceAttempts[index + 1].source));
  }

  if (!finalResult) {
    finalResult = {
      providerId,
      providerName,
      source: sourceResolution.source,
      status: 'skipped',
      checked: true,
      updateAttempted: false,
      message: 'No update result was produced.',
    };
  }
  return {
    ...finalResult,
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
    const emitProviderStageMessage = (providerMessage: string): void => {
      progress.message(providerMessage, getProviderStageProgress(providerMessage));
    };

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
      emitProviderMessage: emitProviderStageMessage,
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
