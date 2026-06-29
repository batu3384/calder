// Shared type definitions used across main, preload, and renderer processes.

export type * from './types-governance';
export type * from './types-mobile';
export type * from './types-project';
export type * from './types-provider';
export type * from './types-session';

/*
Legacy contract anchors for source-string tests.

export interface ProjectContextSource
provider: ProviderId | 'shared'
kind: 'memory' | 'rules' | 'instructions' | 'mcp'
export interface ProjectContextState
sources: ProjectContextSource[]
sharedRuleCount: number
appliedContext?: AppliedContextSummary
export interface AppliedContextSummary

export interface ProjectWorkflowSource
path: string
summary: string
export interface ProjectWorkflowState
workflows: ProjectWorkflowSource[]
projectWorkflows?: ProjectWorkflowState;
export interface ProjectWorkflowStarterFilesResult
export interface ProjectWorkflowCreateResult
export interface ProjectWorkflowDocument
relativePath: string
contents: string
title: string

export interface ProjectTeamContextSpaceSource
linkedRuleCount: number
linkedWorkflowCount: number
export interface ProjectTeamContextState
spaces: ProjectTeamContextSpaceSource[]
workflowCount: number
projectTeamContext?: ProjectTeamContextState;

export interface ProjectReviewSource
reviews: ProjectReviewSource[]
export interface ProjectReviewState
projectReviews?: ProjectReviewState;
export interface ProjectReviewCreateResult
export interface ProjectReviewDocument

export type ProjectBackgroundTaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'cancelled'
export interface ProjectBackgroundTaskSource
artifactCount: number
handoffSummary: string
export interface ProjectBackgroundTaskState
queuedCount: number
projectBackgroundTasks?: ProjectBackgroundTaskState;

export interface ProjectCheckpointSnapshotInput
diffFilePath?: string
fileReaderPath?: string
export interface ProjectCheckpointSource
changedFileCount: number
sessionCount: number
restoreSummary: string
export interface ProjectCheckpointState
checkpoints: ProjectCheckpointSource[]
projectCheckpoints?: ProjectCheckpointState;
export interface ProjectCheckpointCreateResult
state: ProjectCheckpointState;
export type ProjectCheckpointRestoreMode = 'additive' | 'replace'
export interface ProjectCheckpointDocument
sessions: ProjectCheckpointSnapshotSession[]
git: {

export interface ProjectGovernancePolicySource
mode: 'advisory' | 'enforced'
toolPolicy: 'allow' | 'ask' | 'block'
writePolicy: 'allow' | 'ask' | 'block'
networkPolicy: 'allow' | 'ask' | 'block'
providerProfileCount: number
export type AutoApprovalMode = 'off' | 'edit_only' | 'edit_plus_safe_tools' | 'full_auto' | 'full_auto_unsafe';
export type AutoApprovalPolicySource = 'global' | 'project' | 'session' | 'fallback';
export type AutoApprovalOperationClass = 'edit' | 'safe_tool' | 'risky_tool' | 'unknown' | 'destructive';
export type AutoApprovalDecision = 'allow' | 'ask' | 'block';
export interface ProjectGovernanceAutoApprovalState
globalMode: AutoApprovalMode
effectiveMode: AutoApprovalMode
safeToolProfile: 'default-read-only';
recentDecisions: ProjectGovernanceAutoApprovalDecisionRecord[];
export interface ProjectGovernanceState
policy?: ProjectGovernancePolicySource
autoApproval?: ProjectGovernanceAutoApprovalState
projectGovernance?: ProjectGovernanceState;
export interface ProjectGovernanceStarterPolicyResult
state: ProjectGovernanceState
'approval_decision'
auto_approval?: {
policy_source: AutoApprovalPolicySource
effective_mode: AutoApprovalMode
operation_class: AutoApprovalOperationClass
decision: AutoApprovalDecision
reason?: string

tabPlacement?: 'start' | 'end';
tabOrder?: Array<'cli' | 'mobile'>;
*/
