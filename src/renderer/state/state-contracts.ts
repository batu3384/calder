import type { Preferences } from '../../shared/types/project-state.js';

export type EventType =
  | 'project-added'
  | 'project-removed'
  | 'project-changed'
  | 'session-added'
  | 'session-removed'
  | 'session-changed'
  | 'layout-changed'
  | 'preferences-changed'
  | 'terminal-panel-changed'
  | 'history-changed'
  | 'insights-changed'
  | 'sidebar-toggled'
  | 'cli-session-cleared'
  | 'state-loaded';

export type EventCallback = (data?: unknown) => void;
export type SessionRemovalScope = 'all' | 'right' | 'left' | 'others';

export const defaultPreferences: Preferences = {
  soundOnSessionWaiting: true,
  notificationsDesktop: true,
  debugMode: false,
  sessionHistoryEnabled: true,
  insightsEnabled: true,
  autoTitleEnabled: true,
  sidebarViews: { configSections: true, gitPanel: true, sessionHistory: true, costFooter: true },
};

export const NAV_HISTORY_MAX = 50;
