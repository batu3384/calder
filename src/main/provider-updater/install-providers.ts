import type {
  ProviderId,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../../shared/types/provider';
import type {
  ProviderUpdaterOptions,
  ResolvedProviderUpdaterOptions,
} from '../provider-updater-types';
import { readBinaryVersion } from '../provider-updater-update-helpers';
import type { CliProvider } from '../providers/provider';
import { getProvider } from '../providers/registry';
import {
  buildProviderUpdateSummary,
  createProviderProgressEmitter,
  emitUpdateFinished,
  emitUpdateStarted,
  type ProviderProgressContext,
} from './progress-helpers';
import { resolveUpdaterOptions } from './resolve-options';
import { getProviderStageProgress } from './update-specs';

const INSTALL_TIMEOUT_MS = 6 * 60_000;

function parseShellCommand(commandLine: string): { command: string; args: string[] } {
  const trimmed = commandLine.trim();
  if (!trimmed) {
    throw new Error('Install command is empty.');
  }
  if (/[|<>;&]/.test(trimmed)) {
    return { command: 'bash', args: ['-lc', trimmed] };
  }
  const parts = trimmed.split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

async function runProviderInstall(
  provider: CliProvider,
  options: ResolvedProviderUpdaterOptions,
  providerStart: number,
  emitProviderMessage: (message: string) => void,
): Promise<ProviderUpdateResult> {
  const providerId = provider.meta.id;
  const providerName = provider.meta.displayName;
  const { runner, now, signal } = options;

  const prerequisites = provider.validatePrerequisites();
  if (prerequisites.ok) {
    return {
      providerId,
      providerName,
      source: 'unknown',
      status: 'skipped',
      checked: true,
      updateAttempted: false,
      message: `${providerName} is already installed. Use update instead.`,
      durationMs: Math.max(0, now() - providerStart),
    };
  }

  let installCommandInput: { command: string; args: string[] };
  try {
    installCommandInput = parseShellCommand(provider.getInstallCommand());
  } catch (error) {
    return {
      providerId,
      providerName,
      source: 'unknown',
      status: 'error',
      checked: false,
      updateAttempted: false,
      message: error instanceof Error ? error.message : 'Install command is invalid.',
      durationMs: Math.max(0, now() - providerStart),
    };
  }

  const updateCommand =
    `${installCommandInput.command} ${installCommandInput.args.join(' ')}`.trim();
  emitProviderMessage('Installing CLI package…');
  const installExec = await runner.run(installCommandInput.command, installCommandInput.args, {
    timeoutMs: INSTALL_TIMEOUT_MS,
    signal,
  });

  if (signal?.aborted) {
    return {
      providerId,
      providerName,
      source: 'unknown',
      status: 'cancelled',
      checked: false,
      updateAttempted: true,
      updateCommand,
      message: 'Install cancelled while command was running.',
      durationMs: Math.max(0, now() - providerStart),
    };
  }

  if (installExec.code !== 0) {
    const errorMessage = (
      installExec.stderr ||
      installExec.stdout ||
      'Install command failed'
    ).trim();
    return {
      providerId,
      providerName,
      source: 'unknown',
      status: 'error',
      checked: false,
      updateAttempted: true,
      updateCommand,
      message: errorMessage,
      durationMs: Math.max(0, now() - providerStart),
    };
  }

  provider.clearBinaryCache();
  emitProviderMessage('Verifying installation…');
  const afterCheck = provider.validatePrerequisites();
  if (!afterCheck.ok) {
    return {
      providerId,
      providerName,
      source: 'unknown',
      status: 'error',
      checked: true,
      updateAttempted: true,
      updateCommand,
      message: afterCheck.message || 'Install finished but the CLI binary could not be found.',
      durationMs: Math.max(0, now() - providerStart),
    };
  }

  const binaryPath = provider.resolveBinaryPath();
  const afterVersion = await readBinaryVersion(runner, binaryPath, signal);

  return {
    providerId,
    providerName,
    source: 'unknown',
    status: 'updated',
    checked: true,
    updateAttempted: true,
    updateCommand,
    afterVersion,
    message: afterVersion
      ? `${providerName} was installed successfully (${afterVersion}).`
      : `${providerName} was installed successfully.`,
    durationMs: Math.max(0, now() - providerStart),
  };
}

export async function installProviderById(
  providerId: ProviderId,
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  return installProviders([getProvider(providerId)], options);
}

export async function installProviders(
  providers: CliProvider[],
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
  const resolved = resolveUpdaterOptions(options);
  const { now, onProgress, signal } = resolved;
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
    if (signal?.aborted) break;

    const providerStart = now();
    const id = provider.meta.id;
    const providerName = provider.meta.displayName;
    const progress = createProviderProgressEmitter(progressContext, id, providerName);
    progress.started('Preparing install…');
    const emitProviderStageMessage = (providerMessage: string): void => {
      progress.message(providerMessage, getProviderStageProgress(providerMessage));
    };

    const result = await runProviderInstall(
      provider,
      resolved,
      providerStart,
      emitProviderStageMessage,
    );
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
