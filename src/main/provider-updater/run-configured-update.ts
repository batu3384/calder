import type { ProviderId, ProviderUpdateResult } from '../../shared/types/provider';
import type {
  ProviderUpdaterRunner,
  ProviderUpdaterTarget,
  ProviderUpdateSpec,
} from '../provider-updater-types';
import {
  detectUpdateSource,
  readBinaryVersion,
  resolveRealPath,
  runProviderUpdate,
} from '../provider-updater-update-helpers';
import {
  buildProviderUpdateSourceAttempts,
  describeFallbackAttempt,
  getAttemptBinaryPath,
  type ProviderUpdateSourceResolution,
  shouldRetryWithFallback,
} from './update-specs';

export interface RunConfiguredProviderUpdateInput {
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

export async function runConfiguredProviderUpdate(
  input: RunConfiguredProviderUpdateInput,
): Promise<ProviderUpdateResult> {
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
      binaryPath: getAttemptBinaryPath(
        binaryPath,
        sourceResolution.source,
        sourceAttempts[index].source,
        provider.meta.binaryName,
      ),
      beforeVersion,
      sourceResolution: sourceAttempts[index],
    });
    const hasFallback = index < sourceAttempts.length - 1;
    if (
      !hasFallback ||
      !shouldRetryWithFallback(
        finalResult,
        sourceAttempts[index].source,
        sourceAttempts[index + 1]?.source,
      )
    ) {
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
