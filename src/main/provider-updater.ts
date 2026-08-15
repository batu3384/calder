import type {
  ProviderId,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../shared/types/provider';
import { installProviderById, installProviders } from './provider-updater/install-providers';
import {
  buildProviderUpdateSummary,
  buildSkippedProviderResult,
  createProviderProgressEmitter,
  emitUpdateFinished,
  emitUpdateStarted,
  type ProviderProgressContext,
} from './provider-updater/progress-helpers';
import { resolveUpdaterOptions } from './provider-updater/resolve-options';
import { runConfiguredProviderUpdate } from './provider-updater/run-configured-update';
import { getProviderStageProgress, PROVIDER_UPDATE_SPECS } from './provider-updater/update-specs';
import type { ProviderUpdaterOptions, ProviderUpdaterTarget } from './provider-updater-types';
import { getAllProviders, getProvider } from './providers/registry';

export type { ProviderUpdaterRunner, ProviderUpdaterTarget } from './provider-updater-types';
export { installProviderById, installProviders };

export async function updateAllProviders(
  options?: ProviderUpdaterOptions,
): Promise<ProviderUpdateSummary> {
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
        message: prerequisites.message,
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
    if (result.status === 'updated') {
      provider.clearBinaryCache();
    }
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
