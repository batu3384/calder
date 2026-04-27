// Shared provider-facing type definitions.

// --- Provider ---

export type ProviderId = 'claude' | 'codex' | 'copilot' | 'gemini' | 'qwen';
export type PendingPromptTrigger = 'session-start' | 'first-output' | 'startup-arg';
export type UiLanguage = 'en' | 'tr';
export type GatewayBackendId = 'anthropic' | 'zai' | 'minimax' | 'qwen';
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
  configReading: boolean;
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
export type ProviderUpdateStatus = 'updated' | 'up_to_date' | 'sync_pending' | 'skipped' | 'error' | 'cancelled';

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
// --- Provider Config ---

export interface McpServer { name: string; url: string; status: string; scope: 'user' | 'project'; filePath: string }
export interface Agent { name: string; model: string; category: 'plugin' | 'built-in'; scope: 'user' | 'project'; filePath: string }
export interface Skill { name: string; description: string; scope: 'user' | 'project'; filePath: string }
export interface Command { name: string; description: string; scope: 'user' | 'project'; filePath: string }
export interface ProviderConfig { mcpServers: McpServer[]; agents: Agent[]; skills: Skill[]; commands: Command[] }
export type ClaudeConfig = ProviderConfig;

// --- Settings Validation ---

export interface SettingsValidationResult {
  statusLine: 'missing' | 'calder' | 'foreign';
  hooks: 'missing' | 'complete' | 'partial';
  foreignStatusLineCommand?: string;
  hookDetails: Record<string, boolean>;
}

export interface SettingsWarningData {
  sessionId: string;
  providerId: ProviderId;
  statusLine: SettingsValidationResult['statusLine'];
  hooks: SettingsValidationResult['hooks'];
}

export interface StatusLineConflictData {
  foreignCommand: string;
}
