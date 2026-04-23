import type { ProviderId } from '../types-provider.js';

export interface ProjectContextSource {
  id: string;
  provider: ProviderId | 'shared';
  scope: 'project' | 'user';
  kind: 'memory' | 'rules' | 'instructions' | 'mcp';
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  enabled?: boolean;
  priority?: 'hard' | 'soft';
}

export interface AppliedContextSourceRef {
  id: string;
  provider: ProviderId | 'shared';
  displayName: string;
  kind: ProjectContextSource['kind'];
  priority?: ProjectContextSource['priority'];
  summary?: string;
}

export interface AppliedContextSummary {
  sources: AppliedContextSourceRef[];
  sharedRuleCount: number;
  providerContextSummary?: string;
  sharedRulesSummary?: string;
}

export interface ProjectContextState {
  sources: ProjectContextSource[];
  sharedRuleCount: number;
  providerSourceCount: number;
  lastUpdated?: string;
}

export interface ProjectContextStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectContextState;
}

export interface ProjectContextCreateRuleResult {
  created: boolean;
  relativePath: string;
  state: ProjectContextState;
}

export interface ProjectContextRenameRuleResult {
  renamed: boolean;
  relativePath: string;
  state: ProjectContextState;
}

export interface ProjectContextDeleteRuleResult {
  deleted: boolean;
  state: ProjectContextState;
}
