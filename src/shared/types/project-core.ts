import type { ShareIceServer } from '../sharing-types.js';

export interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
  isBare: boolean;
}

export interface GitFileEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';
  area: 'staged' | 'working' | 'untracked' | 'conflicted';
}

export interface BrowserCredentialSummary {
  id: string;
  origin: string;
  label: string;
  username: string;
  autoFill: boolean;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface BrowserCredentialFillData {
  id: string;
  origin: string;
  label: string;
  username: string;
  password: string;
}

export interface BrowserCredentialSaveInput {
  url: string;
  username: string;
  password: string;
  label?: string;
  autoFill?: boolean;
  id?: string;
}

export type SurfaceKind = 'web' | 'cli' | 'mobile';
export type SurfaceSelectionMode = 'line' | 'region' | 'viewport';
export type CliSurfacePromptContextMode =
  | 'selection-only'
  | 'selection-nearby'
  | 'selection-nearby-viewport';

export interface WebSurfaceState {
  sessionId?: string;
  url?: string;
  history?: string[];
}

export interface EmbeddedBrowserOpenPayload {
  url: string;
  cwd?: string;
  sessionId?: string;
  preferEmbedded?: boolean;
}

export interface ShareRtcConfig {
  iceServers: ShareIceServer[];
  iceTransportPolicy?: 'all' | 'relay';
  source?: 'default' | 'env';
  issues?: string[];
}

export interface ShareConnectionDescription {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface BrowserGuestOpenPayload {
  url: string;
  source: 'anchor' | 'window-open';
}

export interface McpResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
