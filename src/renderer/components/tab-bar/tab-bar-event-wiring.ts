import { appState } from '../../state.js';
import { onChange as onStatusChange, type SessionStatus } from '../surface-services/session-activity.js';
import { onChange as onGitStatusChange } from '../surface-services/git-status.js';
import { onChange as onUnreadChange } from '../surface-services/session-unread.js';
import { onShareChange } from '../../sharing/share-manager.js';
import { hasMultipleAvailableProviders, loadProviderAvailability } from '../surface-services/provider-availability.js';

interface TabBarActionHandlerArgs {
  addSessionButtonEl: HTMLElement;
  updateCliToolsButtonEl: HTMLButtonElement;
  mobileControlButtonEl: HTMLButtonElement | null;
  gitStatusEl: HTMLElement;
  onToggleUpdatePanelAndRun: () => void;
  onQuickNewSession: () => void;
  onMobileControlClick: () => void;
  onShowAddSessionContextMenu: (x: number, y: number) => void;
  onShowBranchContextMenu: (event: MouseEvent) => void;
}

export function wireTabBarActionHandlers(args: TabBarActionHandlerArgs): void {
  args.updateCliToolsButtonEl.addEventListener('click', () => {
    args.onToggleUpdatePanelAndRun();
  });
  args.addSessionButtonEl.addEventListener('click', () => args.onQuickNewSession());
  args.mobileControlButtonEl?.addEventListener('click', () => {
    args.onMobileControlClick();
  });
  args.addSessionButtonEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    args.onShowAddSessionContextMenu(e.clientX, e.clientY);
  });
  args.gitStatusEl.addEventListener('click', (event) => {
    args.onShowBranchContextMenu(event);
  });
}

interface TabBarDismissHandlerArgs {
  updateCliToolsButtonEl: HTMLButtonElement;
  isCliUpdatePanelVisible: () => boolean;
  doesCliUpdatePanelContain: (target: Node) => boolean;
  toggleCliUpdatePanel: (visible: boolean) => void;
  hideTabContextMenu: () => void;
}

export function wireTabBarDismissHandlers(args: TabBarDismissHandlerArgs): void {
  document.addEventListener('click', (event) => {
    args.hideTabContextMenu();
    if (!args.isCliUpdatePanelVisible()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (args.doesCliUpdatePanelContain(target)) return;
    if (args.updateCliToolsButtonEl.contains(target)) return;
    args.toggleCliUpdatePanel(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    args.hideTabContextMenu();
    args.toggleCliUpdatePanel(false);
  });
}

interface TabBarStateSubscriptionArgs {
  prevStatus: Map<string, SessionStatus>;
  tabListEl: HTMLElement;
  buildSessionTooltip: (status: SessionStatus, cliSessionId: string | null | undefined) => string;
  render: () => void;
  renderGitStatus: () => void;
  syncSessionProviderSelector: () => void;
}

export function wireTabBarStateSubscriptions(args: TabBarStateSubscriptionArgs): void {
  appState.on('state-loaded', args.render);
  appState.on('project-changed', args.render);
  appState.on('session-added', args.render);
  appState.on('session-removed', (data?: unknown) => {
    const payload = data as { sessionId?: string } | undefined;
    if (payload?.sessionId) {
      args.prevStatus.delete(payload.sessionId);
    }
    args.render();
  });
  appState.on('session-changed', args.render);
  appState.on('layout-changed', args.render);
  appState.on('preferences-changed', args.syncSessionProviderSelector);
  onShareChange(args.render);

  onStatusChange((sessionId, status) => {
    args.prevStatus.set(sessionId, status);

    const dot = args.tabListEl.querySelector(`.tab-item[data-session-id="${sessionId}"] .tab-status`) as HTMLElement | null;
    if (dot) {
      dot.className = `tab-status ${status}`;
    }

    const tab = args.tabListEl.querySelector(`.tab-item[data-session-id="${sessionId}"]`) as HTMLElement | null;
    if (!tab) return;
    const session = appState.activeProject?.sessions.find((candidate) => candidate.id === sessionId);
    tab.title = args.buildSessionTooltip(status, session?.cliSessionId);
  });

  onUnreadChange(args.render);
  onGitStatusChange((projectId) => {
    if (projectId === appState.activeProjectId) {
      args.renderGitStatus();
    }
  });
  appState.on('project-changed', args.renderGitStatus);
}

interface TabBarProviderAvailabilityBootstrapArgs {
  syncSessionProviderSelector: () => void;
  render: () => void;
}

export function bootstrapTabBarProviderAvailability(args: TabBarProviderAvailabilityBootstrapArgs): void {
  // Icons only distinguish providers when multiple are installed.
  loadProviderAvailability()
    .then(() => {
      args.syncSessionProviderSelector();
      if (hasMultipleAvailableProviders()) args.render();
    })
    .catch((error) => {
      console.warn('[tab-bar] Failed to load provider availability', error);
      args.syncSessionProviderSelector();
    });
}
