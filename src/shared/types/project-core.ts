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

export interface BrowserGuestOpenPayload {
  url: string;
  source: 'anchor' | 'window-open';
}

export interface McpResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
