import type {
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../../shared/types/provider';

type ProgressCallback = (event: ProviderUpdateProgressEvent) => void;

export interface ProviderProgressContext {
  startedAt: string;
  totalProviders: number;
  getCompletedProviders: () => number;
  onProgress?: ProgressCallback;
}

export interface ProviderTargetProgress {
  providerId: ProviderId;
  providerName: string;
}

export interface ProviderProgressEmitter {
  started(message: string): void;
  message(message: string): void;
  finished(result: ProviderUpdateResult): void;
}

export function emitUpdateStarted(
  context: ProviderProgressContext,
  providers: ProviderTargetProgress[],
): void {
  context.onProgress?.({
    phase: 'started',
    startedAt: context.startedAt,
    totalProviders: context.totalProviders,
    completedProviders: context.getCompletedProviders(),
    providers,
  });
}

export function emitUpdateFinished(
  context: ProviderProgressContext,
  finishedAt: string,
  cancelled: boolean,
): void {
  context.onProgress?.({
    phase: 'finished',
    startedAt: context.startedAt,
    finishedAt,
    cancelled,
    totalProviders: context.totalProviders,
    completedProviders: context.getCompletedProviders(),
  });
}

export function createProviderProgressEmitter(
  context: ProviderProgressContext,
  providerId: ProviderId,
  providerName: string,
): ProviderProgressEmitter {
  const emitProviderMessage = (providerMessage: string): void => {
    context.onProgress?.({
      phase: 'provider_started',
      startedAt: context.startedAt,
      totalProviders: context.totalProviders,
      completedProviders: context.getCompletedProviders(),
      providerId,
      providerName,
      providerMessage,
    });
  };

  return {
    started: emitProviderMessage,
    message: emitProviderMessage,
    finished(result) {
      context.onProgress?.({
        phase: 'provider_finished',
        startedAt: context.startedAt,
        totalProviders: context.totalProviders,
        completedProviders: context.getCompletedProviders(),
        providerId,
        providerName,
        result,
      });
    },
  };
}

export function buildSkippedProviderResult(input: {
  providerId: ProviderId;
  providerName: string;
  message: string;
  durationMs: number;
}): ProviderUpdateResult {
  return {
    providerId: input.providerId,
    providerName: input.providerName,
    source: 'unknown',
    status: 'skipped',
    checked: false,
    updateAttempted: false,
    message: input.message,
    durationMs: input.durationMs,
  };
}

export function buildProviderUpdateSummary(input: {
  startedAt: string;
  finishedAt: string;
  results: ProviderUpdateResult[];
  cancelled: boolean;
}): ProviderUpdateSummary {
  return {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: input.results,
    cancelled: input.cancelled,
  };
}
