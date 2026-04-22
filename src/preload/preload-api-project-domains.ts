import type { IpcRenderer } from 'electron';
import type { AutoApprovalMode, ProjectGovernanceStarterPolicyResult, ProjectGovernanceState } from '../shared/types/governance';
import type { ProjectBackgroundTaskCreateResult, ProjectBackgroundTaskDocument, ProjectBackgroundTaskState, ProjectCheckpointCreateResult, ProjectCheckpointDocument, ProjectCheckpointSnapshotInput, ProjectCheckpointState, ProjectContextCreateRuleResult, ProjectContextDeleteRuleResult, ProjectContextRenameRuleResult, ProjectContextStarterFilesResult, ProjectContextState, ProjectReviewCreateResult, ProjectReviewDocument, ProjectReviewState, ProjectTeamContextCreateSpaceResult, ProjectTeamContextStarterFilesResult, ProjectTeamContextState, ProjectWorkflowCreateResult, ProjectWorkflowDocument, ProjectWorkflowStarterFilesResult, ProjectWorkflowState } from '../shared/types/project';

type OnChannel = (channel: string, callback: (...args: unknown[]) => void) => () => void;

export interface PreloadProjectDomainApi {
  context: {
    getProjectState(projectPath: string): Promise<ProjectContextState>;
    createStarterFiles(projectPath: string): Promise<ProjectContextStarterFilesResult>;
    createSharedRule(projectPath: string, title: string, priority: 'hard' | 'soft'): Promise<ProjectContextCreateRuleResult>;
    renameSharedRule(projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft'): Promise<ProjectContextRenameRuleResult>;
    deleteSharedRule(projectPath: string, relativePath: string): Promise<ProjectContextDeleteRuleResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectContextState) => void): () => void;
  };
  workflow: {
    getProjectState(projectPath: string): Promise<ProjectWorkflowState>;
    createStarterFiles(projectPath: string): Promise<ProjectWorkflowStarterFilesResult>;
    createFile(projectPath: string, title: string): Promise<ProjectWorkflowCreateResult>;
    readFile(projectPath: string, workflowPath: string): Promise<ProjectWorkflowDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectWorkflowState) => void): () => void;
  };
  teamContext: {
    getProjectState(projectPath: string): Promise<ProjectTeamContextState>;
    createStarterFiles(projectPath: string): Promise<ProjectTeamContextStarterFilesResult>;
    createSpace(projectPath: string, title: string): Promise<ProjectTeamContextCreateSpaceResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectTeamContextState) => void): () => void;
  };
  review: {
    getProjectState(projectPath: string): Promise<ProjectReviewState>;
    createFile(projectPath: string, title: string): Promise<ProjectReviewCreateResult>;
    readFile(projectPath: string, reviewPath: string): Promise<ProjectReviewDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectReviewState) => void): () => void;
  };
  governance: {
    getProjectState(projectPath: string, sessionId?: string): Promise<ProjectGovernanceState>;
    setAutoApprovalMode(projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null, sessionId?: string): Promise<ProjectGovernanceState>;
    setSessionAutoApprovalOverride(sessionId: string, mode: AutoApprovalMode | null): Promise<{ ok: boolean }>;
    createStarterPolicy(projectPath: string): Promise<ProjectGovernanceStarterPolicyResult>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectGovernanceState) => void): () => void;
  };
  task: {
    getProjectState(projectPath: string): Promise<ProjectBackgroundTaskState>;
    create(projectPath: string, title: string, prompt: string): Promise<ProjectBackgroundTaskCreateResult>;
    read(projectPath: string, taskPath: string): Promise<ProjectBackgroundTaskDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectBackgroundTaskState) => void): () => void;
  };
  checkpoint: {
    getProjectState(projectPath: string): Promise<ProjectCheckpointState>;
    create(projectPath: string, snapshot: ProjectCheckpointSnapshotInput): Promise<ProjectCheckpointCreateResult>;
    read(projectPath: string, checkpointPath: string): Promise<ProjectCheckpointDocument>;
    watchProject(projectPath: string): void;
    onChanged(callback: (projectPath: string, state: ProjectCheckpointState) => void): () => void;
  };
}

export function createPreloadProjectDomainApi(
  ipcRenderer: IpcRenderer,
  onChannel: OnChannel,
): PreloadProjectDomainApi {
  return {
    context: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('context:getProjectState', projectPath),
      createStarterFiles: (projectPath: string) => ipcRenderer.invoke('context:createStarterFiles', projectPath),
      createSharedRule: (projectPath: string, title: string, priority: 'hard' | 'soft') =>
        ipcRenderer.invoke('context:createSharedRule', projectPath, title, priority),
      renameSharedRule: (projectPath: string, relativePath: string, title: string, priority: 'hard' | 'soft') =>
        ipcRenderer.invoke('context:renameSharedRule', projectPath, relativePath, title, priority),
      deleteSharedRule: (projectPath: string, relativePath: string) =>
        ipcRenderer.invoke('context:deleteSharedRule', projectPath, relativePath),
      watchProject: (projectPath: string) => ipcRenderer.send('context:watchProject', projectPath),
      onChanged: (callback) => onChannel('context:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectContextState)),
    },
    workflow: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('workflow:getProjectState', projectPath),
      createStarterFiles: (projectPath: string) => ipcRenderer.invoke('workflow:createStarterFiles', projectPath),
      createFile: (projectPath: string, title: string) => ipcRenderer.invoke('workflow:createFile', projectPath, title),
      readFile: (projectPath: string, workflowPath: string) => ipcRenderer.invoke('workflow:readFile', projectPath, workflowPath),
      watchProject: (projectPath: string) => ipcRenderer.send('workflow:watchProject', projectPath),
      onChanged: (callback) => onChannel('workflow:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectWorkflowState)),
    },
    teamContext: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('teamContext:getProjectState', projectPath),
      createStarterFiles: (projectPath: string) => ipcRenderer.invoke('teamContext:createStarterFiles', projectPath),
      createSpace: (projectPath: string, title: string) => ipcRenderer.invoke('teamContext:createSpace', projectPath, title),
      watchProject: (projectPath: string) => ipcRenderer.send('teamContext:watchProject', projectPath),
      onChanged: (callback) => onChannel('teamContext:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectTeamContextState)),
    },
    review: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('review:getProjectState', projectPath),
      createFile: (projectPath: string, title: string) => ipcRenderer.invoke('review:createFile', projectPath, title),
      readFile: (projectPath: string, reviewPath: string) => ipcRenderer.invoke('review:readFile', projectPath, reviewPath),
      watchProject: (projectPath: string) => ipcRenderer.send('review:watchProject', projectPath),
      onChanged: (callback) => onChannel('review:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectReviewState)),
    },
    governance: {
      getProjectState: (projectPath: string, sessionId?: string) => ipcRenderer.invoke('governance:getProjectState', projectPath, sessionId),
      setAutoApprovalMode: (projectPath: string, scope: 'global' | 'project', mode: AutoApprovalMode | null, sessionId?: string) =>
        ipcRenderer.invoke('governance:setAutoApprovalMode', projectPath, scope, mode, sessionId),
      setSessionAutoApprovalOverride: (sessionId: string, mode: AutoApprovalMode | null) =>
        ipcRenderer.invoke('governance:setSessionAutoApprovalOverride', sessionId, mode),
      createStarterPolicy: (projectPath: string) => ipcRenderer.invoke('governance:createStarterPolicy', projectPath),
      watchProject: (projectPath: string) => ipcRenderer.send('governance:watchProject', projectPath),
      onChanged: (callback) => onChannel('governance:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectGovernanceState)),
    },
    task: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('task:getProjectState', projectPath),
      create: (projectPath: string, title: string, prompt: string) => ipcRenderer.invoke('task:create', projectPath, title, prompt),
      read: (projectPath: string, taskPath: string) => ipcRenderer.invoke('task:read', projectPath, taskPath),
      watchProject: (projectPath: string) => ipcRenderer.send('task:watchProject', projectPath),
      onChanged: (callback) => onChannel('task:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectBackgroundTaskState)),
    },
    checkpoint: {
      getProjectState: (projectPath: string) => ipcRenderer.invoke('checkpoint:getProjectState', projectPath),
      create: (projectPath: string, snapshot: ProjectCheckpointSnapshotInput) => ipcRenderer.invoke('checkpoint:create', projectPath, snapshot),
      read: (projectPath: string, checkpointPath: string) => ipcRenderer.invoke('checkpoint:read', projectPath, checkpointPath),
      watchProject: (projectPath: string) => ipcRenderer.send('checkpoint:watchProject', projectPath),
      onChanged: (callback) => onChannel('checkpoint:changed', (projectPath, state) =>
        callback(projectPath as string, state as ProjectCheckpointState)),
    },
  };
}
