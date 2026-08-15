import type {
  CliProviderMeta,
  ProviderId,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../../shared/types/provider.js';
import type { CalderApi } from '../types.js';

export type UpdateCenterBridge = Pick<CalderApi, 'update' | 'provider'>;
export type UpdateCenterListener = (state: UpdateCenterState) => void;

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready_to_restart'
  | 'up_to_date'
  | 'error';

export interface AppUpdateCenterState {
  phase: AppUpdatePhase;
  targetVersion?: string;
  downloadPercent?: number;
  lastCheckedAt?: string;
  errorMessage?: string;
}

export type CliProviderStatus =
  | 'not_installed'
  | 'ready'
  | 'queued'
  | 'running'
  | ProviderUpdateResult['status'];

export interface CliProviderProgressState {
  providerId: ProviderId;
  providerName: string;
  status: CliProviderStatus;
  message?: string;
  progressPercent?: number;
  beforeVersion?: string;
  latestVersion?: string;
  afterVersion?: string;
}

export type CliUpdatePhase = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';

export interface CliUpdateCenterState {
  phase: CliUpdatePhase;
  startedAt?: string;
  finishedAt?: string;
  totalProviders: number;
  completedProviders: number;
  activeProviderId?: ProviderId;
  providers: CliProviderProgressState[];
  cancelRequested: boolean;
  errorMessage?: string;
  lastSummary?: ProviderUpdateSummary;
}

export interface UpdateCenterState {
  app: AppUpdateCenterState;
  cli: CliUpdateCenterState;
}

export const INITIAL_UPDATE_CENTER_STATE: UpdateCenterState = {
  app: { phase: 'idle' },
  cli: {
    phase: 'idle',
    totalProviders: 0,
    completedProviders: 0,
    providers: [],
    cancelRequested: false,
  },
};

export function cloneUpdateCenterState(input: UpdateCenterState): UpdateCenterState {
  return {
    app: { ...input.app },
    cli: {
      ...input.cli,
      providers: input.cli.providers.map((provider) => ({ ...provider })),
    },
  };
}

export function upsertCliProvider(
  providers: CliProviderProgressState[],
  providerId: ProviderId,
  providerName: string,
): CliProviderProgressState[] {
  const existing = providers.find((entry) => entry.providerId === providerId);
  if (existing) return providers;
  return [...providers, { providerId, providerName, status: 'queued' }];
}

export function mergeCliResult(
  providers: CliProviderProgressState[],
  result: ProviderUpdateResult,
): CliProviderProgressState[] {
  const next = providers.slice();
  const index = next.findIndex((entry) => entry.providerId === result.providerId);
  const merged: CliProviderProgressState = {
    providerId: result.providerId,
    providerName: result.providerName,
    status: result.status,
    message: result.message,
    progressPercent: 100,
    beforeVersion: result.beforeVersion,
    latestVersion: result.latestVersion,
    afterVersion: result.afterVersion,
  };
  if (index >= 0) {
    next[index] = merged;
  } else {
    next.push(merged);
  }
  return next;
}

export function deriveProvidersFromSummary(
  summary: ProviderUpdateSummary,
): CliProviderProgressState[] {
  return summary.results.map((result) => ({
    providerId: result.providerId,
    providerName: result.providerName,
    status: result.status,
    message: result.message,
    progressPercent: 100,
    beforeVersion: result.beforeVersion,
    latestVersion: result.latestVersion,
    afterVersion: result.afterVersion,
  }));
}

export function deriveProvidersFromMetas(metas: CliProviderMeta[]): CliProviderProgressState[] {
  return metas.map((meta) => ({
    providerId: meta.id,
    providerName: meta.displayName,
    status: 'queued',
    message: 'Ready to update.',
  }));
}

export async function deriveProvidersFromCatalog(
  metas: CliProviderMeta[],
  currentBridge: UpdateCenterBridge,
): Promise<CliProviderProgressState[]> {
  const checkBinary = currentBridge.provider.checkBinary;
  if (typeof checkBinary !== 'function') {
    return deriveProvidersFromMetas(metas);
  }

  const entries = await Promise.all(
    metas.map(async (meta) => {
      try {
        const check = await checkBinary.call(currentBridge.provider, meta.id);
        return {
          providerId: meta.id,
          providerName: meta.displayName,
          status: check.ok ? ('ready' as const) : ('not_installed' as const),
          message: check.ok ? 'Ready to update.' : check.message,
        };
      } catch {
        return {
          providerId: meta.id,
          providerName: meta.displayName,
          status: 'not_installed' as const,
          message: 'Could not verify installation.',
        };
      }
    }),
  );
  return entries;
}
