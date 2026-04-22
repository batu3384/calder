// Shared governance type definitions.

export type ProjectGovernanceMode = 'advisory' | 'enforced';
export type ProjectGovernanceDecisionPolicy = 'allow' | 'ask' | 'block';
export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools' | 'full_auto' | 'full_auto_unsafe';
export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback';
export type AutoApprovalOperationClass = 'edit' | 'safe_tool' | 'risky_tool' | 'unknown' | 'destructive';
export type AutoApprovalDecision = 'allow' | 'ask' | 'block';

export interface ProjectGovernanceAutoApprovalDecisionRecord {
  timestamp: string;
  operationClass: AutoApprovalOperationClass;
  decision: AutoApprovalDecision;
  reason?: string;
}

export interface ProjectGovernanceAutoApprovalState {
  globalMode: AutoApprovalMode;
  projectMode?: AutoApprovalMode;
  sessionMode?: AutoApprovalMode;
  effectiveMode: AutoApprovalMode;
  policySource: AutoApprovalPolicySource;
  safeToolProfile: 'default-read-only';
  recentDecisions: ProjectGovernanceAutoApprovalDecisionRecord[];
}

export interface ProjectGovernancePolicySource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  mode: 'advisory' | 'enforced';
  toolPolicy: 'allow' | 'ask' | 'block';
  writePolicy: 'allow' | 'ask' | 'block';
  networkPolicy: 'allow' | 'ask' | 'block';
  mcpAllowlistCount: number;
  providerProfileCount: number;
  budgetLimitUsd?: number;
}

export interface ProjectGovernanceState {
  policy?: ProjectGovernancePolicySource;
  autoApproval?: ProjectGovernanceAutoApprovalState;
  lastUpdated?: string;
}

export interface ProjectGovernanceStarterPolicyResult {
  created: boolean;
  relativePath: string;
  state: ProjectGovernanceState;
}
