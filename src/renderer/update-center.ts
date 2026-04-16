import type {
  ProviderUpdateCancelResult,
  ProviderId,
  ProviderUpdateProgressEvent,
  ProviderUpdateResult,
  ProviderUpdateSummary,
} from '../shared/types.js';
import type { CalderApi } from './types.js';

const APP_UP_TO_DATE_TIMEOUT_MS = 6000;

type UpdateCenterBridge = Pick<CalderApi, 'update' | 'provider'>;
type UpdateCenterListener = (state: UpdateCenterState) => void;

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

export type CliProviderStatus = 'queued' | 'running' | ProviderUpdateResult['status'];

export interface CliProviderProgressState {
  providerId: ProviderId;
  providerName: string;
  status: CliProviderStatus;
  message?: string;
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

const INITIAL_STATE: UpdateCenterState = {
  app: { phase: 'idle' },
  cli: {
    phase: 'idle',
    totalProviders: 0,
    completedProviders: 0,
    providers: [],
    cancelRequested: false,
  },
};

let state: UpdateCenterState = cloneState(INITIAL_STATE);
let bridge: UpdateCenterBridge | null = null;
let initialized = false;
const listeners: UpdateCenterListener[] = [];
let cleanupCallbacks: Array<() => void> = [];
let appCheckToken = 0;
let appCheckTimer: ReturnType<typeof setTimeout> | null = null;
let cliInFlight: Promise<ProviderUpdateSummary> | null = null;

function cloneState(input: UpdateCenterState): UpdateCenterState {
  return {
    app: { ...input.app },
    cli: {
      ...input.cli,
      providers: input.cli.providers.map((provider) => ({ ...provider })),
    },
  };
}

function emit(): void {
  const snapshot = getUpdateCenterState();
  for (const listener of listeners) listener(snapshot);
}

function setAppState(next: Partial<AppUpdateCenterState>): void {
  state = {
    ...state,
    app: { ...state.app, ...next },
  };
  emit();
}

function setCliState(next: Partial<CliUpdateCenterState>): void {
  state = {
    ...state,
    cli: { ...state.cli, ...next },
  };
  emit();
}

function clearAppCheckTimer(): void {
  if (!appCheckTimer) return;
  clearTimeout(appCheckTimer);
  appCheckTimer = null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureInitialized(): asserts bridge is UpdateCenterBridge {
  if (!initialized || !bridge) {
    throw new Error('Update center has not been initialized.');
  }
}

function getBridgeOrThrow(input?: UpdateCenterBridge): UpdateCenterBridge {
  if (input) return input;
  const candidate = (globalThis as { calder?: UpdateCenterBridge }).calder;
  if (candidate) return candidate;
  throw new Error('Unable to resolve update center bridge.');
}

function upsertCliProvider(
  providers: CliProviderProgressState[],
  providerId: ProviderId,
  providerName: string,
): CliProviderProgressState[] {
  const existing = providers.find((entry) => entry.providerId === providerId);
  if (existing) return providers;
  return [...providers, { providerId, providerName, status: 'queued' }];
}

function mergeCliResult(
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

function handleAppAvailable(info: { version: string }): void {
  clearAppCheckTimer();
  setAppState({
    phase: 'downloading',
    targetVersion: info.version,
    downloadPercent: 0,
    lastCheckedAt: nowIso(),
    errorMessage: undefined,
  });
}

function handleAppDownloadProgress(info: { percent: number }): void {
  setAppState({
    phase: 'downloading',
    downloadPercent: Math.max(0, Math.min(100, Math.round(info.percent))),
    lastCheckedAt: state.app.lastCheckedAt ?? nowIso(),
  });
}

function handleAppDownloaded(info: { version: string }): void {
  clearAppCheckTimer();
  setAppState({
    phase: 'ready_to_restart',
    targetVersion: info.version,
    downloadPercent: 100,
    lastCheckedAt: nowIso(),
    errorMessage: undefined,
  });
}

function handleAppError(info: { message: string }): void {
  clearAppCheckTimer();
  setAppState({
    phase: 'error',
    errorMessage: info.message || 'Update check failed.',
    lastCheckedAt: nowIso(),
  });
}

function handleProviderProgress(event: ProviderUpdateProgressEvent): void {
  if (event.phase === 'started') {
    setCliState({
      phase: 'running',
      startedAt: event.startedAt,
      finishedAt: undefined,
      totalProviders: event.totalProviders,
      completedProviders: event.completedProviders,
      activeProviderId: undefined,
      providers: (event.providers ?? []).map((provider) => ({
        providerId: provider.providerId,
        providerName: provider.providerName,
        status: 'queued',
      })),
      cancelRequested: false,
      errorMessage: undefined,
    });
    return;
  }

  if (event.phase === 'provider_started' && event.providerId && event.providerName) {
    const nextProviders = upsertCliProvider(state.cli.providers, event.providerId, event.providerName)
      .map((provider) => (
        provider.providerId === event.providerId
          ? { ...provider, status: 'running' as const, message: undefined }
          : provider
      ));
    setCliState({
      phase: 'running',
      activeProviderId: event.providerId,
      totalProviders: event.totalProviders,
      completedProviders: event.completedProviders,
      providers: nextProviders,
    });
    return;
  }

  if (event.phase === 'provider_finished' && event.providerId && event.providerName && event.result) {
    let nextProviders = upsertCliProvider(state.cli.providers, event.providerId, event.providerName);
    nextProviders = mergeCliResult(nextProviders, event.result);
    setCliState({
      phase: state.cli.phase === 'idle' ? 'running' : state.cli.phase,
      totalProviders: event.totalProviders,
      completedProviders: event.completedProviders,
      activeProviderId: state.cli.activeProviderId === event.providerId ? undefined : state.cli.activeProviderId,
      providers: nextProviders,
    });
    return;
  }

  if (event.phase === 'finished') {
    setCliState({
      phase: cliInFlight ? 'running' : 'completed',
      totalProviders: event.totalProviders,
      completedProviders: event.completedProviders,
      finishedAt: event.finishedAt ?? nowIso(),
      activeProviderId: undefined,
      cancelRequested: false,
    });
  }
}

export function initUpdateCenter(inputBridge?: UpdateCenterBridge): void {
  if (initialized) return;
  bridge = getBridgeOrThrow(inputBridge);

  cleanupCallbacks = [
    bridge.update.onAvailable((info) => handleAppAvailable(info)),
    bridge.update.onDownloadProgress((info) => handleAppDownloadProgress(info)),
    bridge.update.onDownloaded((info) => handleAppDownloaded(info)),
    bridge.update.onError((info) => handleAppError(info)),
    bridge.provider.onUpdateProgress((event) => handleProviderProgress(event)),
  ];
  initialized = true;
}

export function getUpdateCenterState(): UpdateCenterState {
  return cloneState(state);
}

export function onUpdateCenterChange(listener: UpdateCenterListener): () => void {
  listeners.push(listener);
  listener(getUpdateCenterState());
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}

export async function checkForAppUpdates(): Promise<void> {
  ensureInitialized();
  const token = ++appCheckToken;
  clearAppCheckTimer();
  setAppState({
    phase: 'checking',
    errorMessage: undefined,
    downloadPercent: undefined,
  });

  try {
    await bridge.update.checkNow();
  } catch (error) {
    if (token !== appCheckToken) return;
    setAppState({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : 'Update check failed.',
      lastCheckedAt: nowIso(),
    });
    return;
  }

  appCheckTimer = setTimeout(() => {
    if (token !== appCheckToken) return;
    if (state.app.phase !== 'checking') return;
    setAppState({
      phase: 'up_to_date',
      lastCheckedAt: nowIso(),
      errorMessage: undefined,
    });
  }, APP_UP_TO_DATE_TIMEOUT_MS);
}

export function runCliProviderUpdates(): Promise<ProviderUpdateSummary> {
  ensureInitialized();
  if (cliInFlight) return cliInFlight;

  setCliState({
    phase: 'running',
    startedAt: nowIso(),
    finishedAt: undefined,
    totalProviders: state.cli.totalProviders,
    completedProviders: 0,
    activeProviderId: undefined,
    providers: state.cli.providers.map((provider) => ({ ...provider, status: 'queued', message: undefined })),
    cancelRequested: false,
    errorMessage: undefined,
  });

  cliInFlight = bridge.provider.updateAll()
    .then((summary) => {
      let providers = state.cli.providers.slice();
      for (const result of summary.results) {
        providers = mergeCliResult(providers, result);
      }
      const totalProviders = state.cli.totalProviders > 0
        ? state.cli.totalProviders
        : Math.max(summary.results.length, state.cli.providers.length);
      const completedProviders = Math.max(state.cli.completedProviders, summary.results.length);
      setCliState({
        phase: summary.cancelled ? 'cancelled' : 'completed',
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
        totalProviders,
        completedProviders,
        activeProviderId: undefined,
        providers,
        cancelRequested: false,
        errorMessage: summary.cancelled ? 'CLI update cancelled.' : undefined,
        lastSummary: summary,
      });
      return summary;
    })
    .catch((error) => {
      setCliState({
        phase: 'error',
        finishedAt: nowIso(),
        activeProviderId: undefined,
        cancelRequested: false,
        errorMessage: error instanceof Error ? error.message : 'CLI update failed.',
      });
      throw error;
    })
    .finally(() => {
      cliInFlight = null;
    });

  return cliInFlight;
}

export async function cancelCliProviderUpdates(): Promise<ProviderUpdateCancelResult> {
  ensureInitialized();
  if (!cliInFlight || state.cli.phase !== 'running') {
    return { cancelled: false };
  }
  setCliState({
    cancelRequested: true,
    errorMessage: undefined,
  });
  try {
    const result = await bridge.provider.cancelUpdateAll();
    if (!result.cancelled) {
      setCliState({ cancelRequested: false });
    }
    return result;
  } catch (error) {
    setCliState({
      cancelRequested: false,
      errorMessage: error instanceof Error ? error.message : 'Cancel request failed.',
    });
    throw error;
  }
}

export function _resetUpdateCenterForTesting(): void {
  clearAppCheckTimer();
  for (const cleanup of cleanupCallbacks) cleanup();
  cleanupCallbacks = [];
  listeners.length = 0;
  bridge = null;
  initialized = false;
  state = cloneState(INITIAL_STATE);
  appCheckToken = 0;
  cliInFlight = null;
}
