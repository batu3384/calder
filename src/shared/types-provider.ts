// Shared provider-facing type definitions.

// --- Provider ---

export type ProviderId = 'claude' | 'codex' | 'antigravity' | 'cursor';
export type PendingPromptTrigger = 'session-start' | 'first-output' | 'startup-arg';
export type UiLanguage = 'en' | 'tr';
export type AppearanceTheme = 'system' | 'light' | 'dark';
export type GatewayBackendId = 'anthropic' | 'zai' | 'minimax';
export type ProviderRouteKind = 'native-cli' | 'gateway';
export type ProviderRouteConfidence = 'verified' | 'estimated' | 'unavailable';
export type QuotaConfidence = 'verified' | 'estimated' | 'stale' | 'unavailable';

export interface ProviderGatewayRoute {
  nativeProviderId: ProviderId;
  backendProviderId: GatewayBackendId;
  model: string;
  routeKind: ProviderRouteKind;
  confidence: ProviderRouteConfidence;
}

export interface CliProviderCapabilities {
  sessionResume: boolean;
  costTracking: boolean;
  contextWindow: boolean;
  hookStatus: boolean;
  shiftEnterNewline: boolean;
  pendingPromptTrigger: PendingPromptTrigger;
  planModeArg?: string;
}

export interface CliProviderMeta {
  id: ProviderId;
  displayName: string;
  binaryName: string;
  capabilities: CliProviderCapabilities;
  defaultContextWindowSize: number;
}

export type ProviderUpdateSource = 'self' | 'npm' | 'brew-formula' | 'brew-cask' | 'unknown';
export type ProviderUpdateStatus =
  | 'updated'
  | 'up_to_date'
  | 'sync_pending'
  | 'skipped'
  | 'error'
  | 'cancelled';

export interface ProviderUpdateResult {
  providerId: ProviderId;
  providerName: string;
  source: ProviderUpdateSource;
  status: ProviderUpdateStatus;
  checked: boolean;
  updateAttempted: boolean;
  message: string;
  checkCommand?: string;
  updateCommand?: string;
  beforeVersion?: string;
  latestVersion?: string;
  afterVersion?: string;
  durationMs: number;
}

export interface ProviderUpdateSummary {
  startedAt: string;
  finishedAt: string;
  results: ProviderUpdateResult[];
  cancelled?: boolean;
}

export interface ProviderUpdateCancelResult {
  cancelled: boolean;
}

export type ProviderUpdateProgressPhase =
  | 'started'
  | 'provider_started'
  | 'provider_finished'
  | 'finished';

export interface ProviderUpdateProgressTarget {
  providerId: ProviderId;
  providerName: string;
}

export interface ProviderUpdateProgressEvent {
  phase: ProviderUpdateProgressPhase;
  startedAt: string;
  finishedAt?: string;
  cancelled?: boolean;
  totalProviders: number;
  completedProviders: number;
  providerId?: ProviderId;
  providerName?: string;
  providerMessage?: string;
  providerProgressPercent?: number;
  providers?: ProviderUpdateProgressTarget[];
  result?: ProviderUpdateResult;
}
