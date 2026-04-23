import type { ProviderId } from '../types-provider.js';
import type { SessionRecord } from '../types-session.js';
import type { GitFileEntry, SurfaceKind } from './project-core.js';
import type { CliSurfaceRuntimeState } from './project-surface.js';

export interface ProjectCheckpointSnapshotSession {
  id: string;
  name: string;
  type?: SessionRecord['type'];
  providerId?: ProviderId;
  args?: string;
  cliSessionId: string | null;
  browserTabUrl?: string;
  browserTargetSessionId?: string;
  diffFilePath?: string;
  diffArea?: string;
  worktreePath?: string;
  fileReaderPath?: string;
  fileReaderLine?: number;
}

export interface ProjectCheckpointSnapshotInput {
  label: string;
  createdAt?: string;
  projectName: string;
  activeSessionId: string | null;
  sessions: ProjectCheckpointSnapshotSession[];
  surface?: {
    kind: SurfaceKind;
    active: boolean;
    targetSessionId?: string;
    webUrl?: string;
    webSessionId?: string;
    cliSelectedProfileId?: string;
    cliStatus?: CliSurfaceRuntimeState['status'];
  };
  projectContext?: {
    sharedRuleCount: number;
    providerSourceCount: number;
  };
  projectWorkflows?: {
    workflowCount: number;
  };
  projectTeamContext?: {
    spaceCount: number;
    sharedRuleCount: number;
    workflowCount: number;
  };
}

export interface ProjectCheckpointSource {
  id: string;
  path: string;
  displayName: string;
  label: string;
  createdAt: string;
  lastUpdated: string;
  sessionCount: number;
  changedFileCount: number;
  restoreSummary: string;
}

export type ProjectCheckpointRestoreMode = 'additive' | 'replace';

export interface ProjectCheckpointState {
  checkpoints: ProjectCheckpointSource[];
  lastUpdated?: string;
}

export interface ProjectCheckpointCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectCheckpointState;
}

export interface ProjectCheckpointDocument {
  schemaVersion: number;
  id: string;
  label: string;
  createdAt: string;
  project: {
    name: string;
    path: string;
  };
  activeSessionId: string | null;
  sessionCount: number;
  changedFileCount: number;
  sessions: ProjectCheckpointSnapshotSession[];
  surface?: ProjectCheckpointSnapshotInput['surface'];
  projectContext?: ProjectCheckpointSnapshotInput['projectContext'];
  projectWorkflows?: ProjectCheckpointSnapshotInput['projectWorkflows'];
  projectTeamContext?: ProjectCheckpointSnapshotInput['projectTeamContext'];
  git: {
    isGitRepo: boolean;
    branch: string | null;
    ahead: number;
    behind: number;
    changedFiles: GitFileEntry[];
  };
}
