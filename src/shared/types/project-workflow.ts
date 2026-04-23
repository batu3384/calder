export interface ProjectWorkflowSource {
  id: string;
  path: string;
  displayName: string;
  summary: string;
  lastUpdated: string;
}

export interface ProjectWorkflowState {
  workflows: ProjectWorkflowSource[];
  lastUpdated?: string;
}

export interface ProjectWorkflowStarterFilesResult {
  created: string[];
  skipped: string[];
  state: ProjectWorkflowState;
}

export interface ProjectWorkflowCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectWorkflowState;
}

export interface ProjectWorkflowDocument {
  path: string;
  relativePath: string;
  title: string;
  contents: string;
}
