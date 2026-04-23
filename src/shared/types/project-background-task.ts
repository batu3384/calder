export type ProjectBackgroundTaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'cancelled';

export interface ProjectBackgroundTaskSource {
  id: string;
  path: string;
  title: string;
  status: ProjectBackgroundTaskStatus;
  summary: string;
  createdAt: string;
  lastUpdated: string;
  artifactCount: number;
  handoffSummary: string;
}

export interface ProjectBackgroundTaskState {
  tasks: ProjectBackgroundTaskSource[];
  queuedCount: number;
  runningCount: number;
  completedCount: number;
  lastUpdated?: string;
}

export interface ProjectBackgroundTaskCreateResult {
  created: boolean;
  relativePath: string;
  state: ProjectBackgroundTaskState;
}

export interface ProjectBackgroundTaskDocument {
  path: string;
  relativePath: string;
  title: string;
  status: ProjectBackgroundTaskStatus;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  artifacts: string[];
  handoff: string;
}
