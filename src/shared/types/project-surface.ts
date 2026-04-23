import type { AppliedContextSummary } from './project-context.js';
import type {
  CliSurfacePromptContextMode,
  SurfaceKind,
  SurfaceSelectionMode,
  WebSurfaceState,
} from './project-core.js';

export interface CliSurfaceProfile {
  id: string;
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  envPatch?: Record<string, string>;
  cols?: number;
  rows?: number;
  startupReadyPattern?: string;
  restartPolicy?: 'manual' | 'on-exit';
  portMode?: CliSurfacePortMode;
  preferredPort?: number;
  allowPortFallback?: boolean;
}

export type CliSurfacePortMode = 'auto' | 'fixed' | 'off';

export interface CliSurfaceStartupTiming {
  startedAtMs: number;
  ptySpawnedAtMs?: number;
  spawnLatencyMs?: number;
  firstOutputAtMs?: number;
  firstOutputLatencyMs?: number;
  runningAtMs?: number;
  stoppedAtMs?: number;
  totalRuntimeMs?: number;
}

export interface CliSurfaceRuntimeState {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  runtimeId?: string;
  selectedProfileId?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  resolvedPort?: number;
  resolvedUrl?: string;
  portMode?: CliSurfacePortMode;
  portFallbackUsed?: boolean;
  portReason?: string;
  lastExitCode?: number | null;
  lastError?: string | null;
  startupTiming?: CliSurfaceStartupTiming;
}

export type CliSurfaceDiscoveryConfidence = 'high' | 'medium' | 'low';

export interface CliSurfaceDiscoveryCandidate {
  id: string;
  command: string;
  args?: string[];
  cwd?: string;
  source: string;
  reason: string;
  confidence: CliSurfaceDiscoveryConfidence;
}

export interface CliSurfaceDiscoveryResult {
  confidence: CliSurfaceDiscoveryConfidence;
  candidates: CliSurfaceDiscoveryCandidate[];
}

export interface CliSurfaceState {
  selectedProfileId?: string;
  profiles: CliSurfaceProfile[];
  runtime?: CliSurfaceRuntimeState;
}

export interface ProjectSurfaceRecord {
  kind: SurfaceKind;
  active: boolean;
  tabFocus?: 'session' | 'cli' | 'mobile';
  tabPlacement?: 'start' | 'end';
  tabOrder?: Array<'cli' | 'mobile'>;
  targetSessionId?: string;
  web?: WebSurfaceState;
  cli?: CliSurfaceState;
}

export interface SurfaceSelectionRange {
  mode: SurfaceSelectionMode;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface SurfacePromptPayload {
  projectId: string;
  projectPath: string;
  surfaceKind: SurfaceKind;
  selection: SurfaceSelectionRange;
  appliedContext?: AppliedContextSummary;
  contextMode?: CliSurfacePromptContextMode;
  selectionSource?: 'exact' | 'inferred' | 'semantic';
  semanticNodeId?: string;
  semanticLabel?: string;
  sourceFile?: string;
  selectedText: string;
  nearbyText: string;
  viewportText: string;
  ansiSnapshot?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  title?: string;
  inferredLabel?: string;
  adapterMeta?: Record<string, unknown>;
}
