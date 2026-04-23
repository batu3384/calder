export interface ProjectTeamContextSpaceSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
  linkedRuleCount: number;
  linkedWorkflowCount: number;
}

export interface ProjectTeamContextState {
  spaces: ProjectTeamContextSpaceSource[];
  sharedRuleCount: number;
  workflowCount: number;
  lastUpdated?: string;
}

export interface ProjectTeamContextStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectTeamContextState;
}

export interface ProjectTeamContextCreateSpaceResult {
  created: boolean;
  relativePath: string;
  state: ProjectTeamContextState;
}
