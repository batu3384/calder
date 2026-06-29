import type { ProjectGovernanceState } from '../types-governance.js';
import type { AppearanceTheme, ProviderId, UiLanguage } from '../types-provider.js';
import type { ArchivedSession, ProjectInsightsData, ProjectLayoutState, SessionRecord } from '../types-session.js';
import type { ProjectBackgroundTaskState } from './project-background-task.js';
import type { ProjectCheckpointState } from './project-checkpoint.js';
import type { ProjectContextState } from './project-context.js';
import type { ProjectReviewState } from './project-review.js';
import type { ProjectSurfaceRecord } from './project-surface.js';
import type { ProjectTeamContextState } from './project-team-context.js';
import type { ProjectWorkflowState } from './project-workflow.js';

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  sessions: SessionRecord[];
  activeSessionId: string | null;
  surface?: ProjectSurfaceRecord;
  projectContext?: ProjectContextState;
  projectWorkflows?: ProjectWorkflowState;
  projectTeamContext?: ProjectTeamContextState;
  projectReviews?: ProjectReviewState;
  projectGovernance?: ProjectGovernanceState;
  projectBackgroundTasks?: ProjectBackgroundTaskState;
  projectCheckpoints?: ProjectCheckpointState;
  layout: ProjectLayoutState;
  sessionHistory?: ArchivedSession[];
  insights?: ProjectInsightsData;
  defaultArgs?: string;
  terminalPanelOpen?: boolean;
  terminalPanelHeight?: number;
}

export interface Preferences {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  debugMode: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  language?: UiLanguage;
  appearanceTheme?: AppearanceTheme;
  defaultProvider?: ProviderId;
  statusLineConsent?: 'granted' | 'declined' | null;
  keybindings?: Record<string, string>;
  sidebarViews?: {
    configSections: boolean;
    gitPanel: boolean;
    sessionHistory: boolean;
    costFooter: boolean;
  };
}

export interface PersistedState {
  version: 1;
  projects: ProjectRecord[];
  activeProjectId: string | null;
  preferences: Preferences;
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  lastSeenVersion?: string;
  appLaunchCount?: number;
  starPromptDismissed?: boolean;
}
