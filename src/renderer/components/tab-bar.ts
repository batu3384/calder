import { appState, MAX_SESSION_NAME_LENGTH, type ProjectRecord, type SessionRecord } from '../state.js';
import type {
  CliSurfaceProfile,
} from '../../shared/types/project.js';
import { onChange as onStatusChange, type SessionStatus } from '../session-activity.js';
import { onChange as onGitStatusChange, getGitStatus, refreshGitStatus } from '../git-status.js';

import { onChange as onUnreadChange } from '../session-unread.js';
import {
  showShareDialog,
} from './share-dialog.js';
import { onShareChange } from '../sharing/share-manager.js';
import {
  loadProviderAvailability,
  hasMultipleAvailableProviders,
} from '../provider-availability.js';
import { openCliSurfaceWithSetup } from './cli-surface/setup.js';
import { showCliSurfaceQuickSetup } from './cli-surface/quick-setup.js';
import {
  createDiscoveredCliSurfaceProfile,
  getCliSurfaceProfileLabel,
} from './cli-surface/profile.js';
import {
  getProjectSurface,
  persistAndLaunchCliSurfaceProfile,
  selectCliSurfaceProfile,
  updateProjectSurface,
  upsertCliSurfaceProfile,
} from './tab-bar-surface-state.js';
import {
  getPreferredCliSession,
  syncMobileControlButton,
} from './tab-bar-mobile-control.js';
import {
  buildSessionTooltip,
} from './tab-bar-session-titles.js';
import { buildGitStatusView } from './tab-bar-git-status-view.js';
import { applyTabContextMenuSemantics } from './tab-bar-menu-semantics.js';
import { buildSurfaceControlsSignatureForProject } from './tab-bar-surface-signature.js';
import { startInlineTabRename } from './tab-bar-rename-controller.js';
import { promptTabBarCliSurfaceProfile } from './tab-bar-cli-profile-modal.js';
import { showSessionTabContextMenu } from './tab-bar-session-context-menu.js';
import { createSurfaceModeTab } from './tab-bar-surface-tab-factory.js';
import { createSessionTab } from './tab-bar-session-tab-factory.js';
import {
  createTabBarSurfaceControlsController,
  type TabBarSurfaceControlsController,
} from './tab-bar-surface-controls.js';
import {
  cancelCliProviderUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
  runCliProviderUpdates,
  initUpdateCenter,
  type CliUpdateCenterState,
} from '../update-center.js';
import {
  createTabBarCliUpdatePanel,
  type TabBarCliUpdatePanelController,
} from './tab-bar-cli-update-panel.js';
import {
  createTabBarProviderSelectorController,
  type TabBarProviderSelectorController,
} from './tab-bar-provider-selector-controller.js';
import {
  createTabBarBranchMenuController,
  type TabBarBranchMenuController,
} from './tab-bar-branch-menu-controller.js';
import {
  createTabBarSessionMenuController,
  type TabBarSessionMenuController,
} from './tab-bar-session-menu-controller.js';

const tabListEl = document.getElementById('tab-list')!;
const gitStatusEl = document.getElementById('git-status')!;
const btnAddSession = document.getElementById('btn-add-session')!;
const btnUpdateCliTools = document.getElementById('btn-update-cli-tools') as HTMLButtonElement;
const btnMobileControl = document.getElementById('btn-mobile-control') as HTMLButtonElement | null;
const mobileControlPresenceEl = document.getElementById('mobile-control-presence') as HTMLSpanElement | null;
const tabActionsEl = document.getElementById('tab-actions')!;
const surfaceModeSlotEl = document.getElementById('surface-mode-slot')!;
const surfaceProfileSlotEl = document.getElementById('surface-profile-slot')!;
const sessionProviderSlotEl = document.getElementById('session-provider-slot')!;
const sessionLauncherEl = document.getElementById('session-launcher')!;

let activeContextMenu: HTMLElement | null = null;
const prevStatus = new Map<string, SessionStatus>();
let lastActiveTabRailKey = '';
let cliUpdatePanelController: TabBarCliUpdatePanelController | null = null;
let sessionProviderSelectorController: TabBarProviderSelectorController | null = null;
let branchMenuController: TabBarBranchMenuController | null = null;
let sessionMenuController: TabBarSessionMenuController | null = null;
let surfaceControlsController: TabBarSurfaceControlsController | null = null;
let unsubscribeUpdateCenter: (() => void) | null = null;
type LauncherSelectKey = 'profile' | 'provider';
const launcherSelectOpenState: Record<LauncherSelectKey, boolean> = {
  profile: false,
  provider: false,
};

function buildCliSurfaceTabTitle(project: ProjectRecord): string {
  const surface = getProjectSurface(project);
  const selectedProfile = surface.cli?.profiles.find((profile) => profile.id === surface.cli?.selectedProfileId);
  const profileLabel = selectedProfile ? getCliSurfaceProfileLabel(selectedProfile) : 'No profile selected';
  return `CLI Surface\nProfile: ${profileLabel}`;
}

function getCliUpdatePanelController(): TabBarCliUpdatePanelController {
  if (!cliUpdatePanelController) {
    cliUpdatePanelController = createTabBarCliUpdatePanel({
      tabActionsEl,
      updateButtonEl: btnUpdateCliTools,
      onCancelUpdate: cancelCliProviderUpdates,
    });
  }
  return cliUpdatePanelController;
}

function getSessionProviderSelectorController(): TabBarProviderSelectorController {
  if (!sessionProviderSelectorController) {
    sessionProviderSelectorController = createTabBarProviderSelectorController({
      addSessionButtonEl: btnAddSession,
      sessionProviderSlotEl,
      onOpenChange: (open) => setSessionLauncherSelectOpen('provider', open),
      onProviderSelected: (providerId) => appState.setPreference('defaultProvider', providerId),
    });
  }
  return sessionProviderSelectorController;
}

function getBranchMenuController(): TabBarBranchMenuController {
  if (!branchMenuController) {
    branchMenuController = createTabBarBranchMenuController({
      gitStatusEl,
      hideTabContextMenu,
      getActiveContextMenu: () => activeContextMenu,
      setActiveContextMenu: (menu) => {
        activeContextMenu = menu;
      },
      applyContextMenuSemantics,
      refreshGitStatus,
    });
  }
  return branchMenuController;
}

function getSessionMenuController(): TabBarSessionMenuController {
  if (!sessionMenuController) {
    sessionMenuController = createTabBarSessionMenuController({
      hideTabContextMenu,
      setActiveContextMenu: (menu) => {
        activeContextMenu = menu;
      },
      applyContextMenuSemantics,
    });
  }
  return sessionMenuController;
}

function getSurfaceControlsController(): TabBarSurfaceControlsController {
  if (!surfaceControlsController) {
    surfaceControlsController = createTabBarSurfaceControlsController({
      surfaceModeSlotEl,
      surfaceProfileSlotEl,
      getActiveProject: () => appState.activeProject,
      buildSurfaceControlsSignature: buildSurfaceControlsSignatureForProject,
      getProjectSurface,
      getCliSurfaceProfileLabel,
      selectCliSurfaceProfile,
      activateLiveViewSurface,
      activateCliSurface,
      activateMobileSurface,
      promptCliSurfaceProfile,
      onProfileSelectOpenChange: (open) => setSessionLauncherSelectOpen('profile', open),
    });
  }
  return surfaceControlsController;
}

export function initTabBar(): void {
  initUpdateCenter();
  btnAddSession.classList.add('tab-action-primary');
  btnUpdateCliTools.classList.add('tab-action-primary');
  btnMobileControl?.classList.add('tab-action-primary');
  setupCliUpdatePanel();
  unsubscribeUpdateCenter?.();
  let lastCliPhase: CliUpdateCenterState['phase'] = getUpdateCenterState().cli.phase;
  unsubscribeUpdateCenter = onUpdateCenterChange((snapshot) => {
    renderCliUpdateButton(snapshot.cli);
    renderCliUpdatePanel(snapshot.cli);
    if (snapshot.cli.phase === 'running' && lastCliPhase !== 'running' && !isCliUpdatePanelVisible()) {
      toggleCliUpdatePanel(true);
    }
    lastCliPhase = snapshot.cli.phase;
  });

  btnUpdateCliTools.addEventListener('click', () => {
    toggleCliUpdatePanel(true);
    if (getUpdateCenterState().cli.phase !== 'running') {
      void runCliProviderUpdates().catch((error) => {
        console.error('[tab-bar] Failed to update CLI tools', error);
      });
    }
  });
  btnAddSession.addEventListener('click', () => quickNewSession());
  btnMobileControl?.addEventListener('click', () => {
    const project = appState.activeProject;
    if (!project) return;
    const targetCliSession = getPreferredCliSession(project);
    if (!targetCliSession) {
      void promptNewSession((session) => {
        showShareDialog(session.id);
        syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
      });
      return;
    }
    showShareDialog(targetCliSession.id);
    syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
  });
  btnAddSession.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showAddSessionContextMenu(e.clientX, e.clientY);
  });
  gitStatusEl.addEventListener('click', (e) => showBranchContextMenu(e));

  // Icons only distinguish providers when multiple are installed
  loadProviderAvailability().then(() => {
    syncSessionProviderSelector();
    if (hasMultipleAvailableProviders()) render();
  }).catch((error) => {
    console.warn('[tab-bar] Failed to load provider availability', error);
    syncSessionProviderSelector();
  });

  appState.on('state-loaded', render);
  appState.on('project-changed', render);
  appState.on('session-added', render);
  appState.on('session-removed', (data?: unknown) => {
    const d = data as { sessionId?: string } | undefined;
    if (d?.sessionId) {
      prevStatus.delete(d.sessionId);
    }
    render();
  });
  appState.on('session-changed', render);
  appState.on('layout-changed', render);
  appState.on('preferences-changed', syncSessionProviderSelector);
  onShareChange(render);

  onStatusChange((sessionId, status) => {
    prevStatus.set(sessionId, status);

    const dot = tabListEl.querySelector(`.tab-item[data-session-id="${sessionId}"] .tab-status`) as HTMLElement | null;
    if (dot) {
      dot.className = `tab-status ${status}`;
    }
    const tab = tabListEl.querySelector(`.tab-item[data-session-id="${sessionId}"]`) as HTMLElement | null;
    if (tab) {
      const session = appState.activeProject?.sessions.find(s => s.id === sessionId);
      tab.title = buildSessionTooltip(status, session?.cliSessionId);
    }

  });

  onUnreadChange(render);

  onGitStatusChange((projectId) => {
    if (projectId === appState.activeProjectId) {
      renderGitStatus();
    }
  });
  appState.on('project-changed', renderGitStatus);

  document.addEventListener('click', (event) => {
    hideTabContextMenu();
    if (!isCliUpdatePanelVisible()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (doesCliUpdatePanelContain(target)) return;
    if (btnUpdateCliTools.contains(target)) return;
    toggleCliUpdatePanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    hideTabContextMenu();
    toggleCliUpdatePanel(false);
  });

  render();
  renderGitStatus();
  syncSessionProviderSelector();
  syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
  renderCliUpdateButton(getUpdateCenterState().cli);
}

function setSessionLauncherSelectOpen(selectKey: LauncherSelectKey, open: boolean): void {
  launcherSelectOpenState[selectKey] = open;
  const anyOpen = launcherSelectOpenState.profile || launcherSelectOpenState.provider;
  sessionLauncherEl.dataset.selectOpen = anyOpen ? 'true' : 'false';
}

function promptCliSurfaceProfile(
  project: ProjectRecord,
  existing?: CliSurfaceProfile,
  onReady?: (profile: CliSurfaceProfile) => void,
): void {
  promptTabBarCliSurfaceProfile(project, existing, onReady);
}

function activateLiveViewSurface(project: ProjectRecord): void {
  const existingBrowser = [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
  if (!existingBrowser) {
    appState.addBrowserTabSession(project.id);
    return;
  }

  const surface = getProjectSurface(project);
  updateProjectSurface(project, {
    ...surface,
    kind: 'web',
    active: true,
    web: {
      sessionId: existingBrowser.id,
      url: existingBrowser.browserTabUrl,
      history: surface.web?.history ?? (existingBrowser.browserTabUrl ? [existingBrowser.browserTabUrl] : []),
    },
  });
}

function activateMobileSurface(project: ProjectRecord): void {
  const surface = getProjectSurface(project);
  updateProjectSurface(project, {
    ...surface,
    kind: 'mobile',
    active: true,
    tabFocus: 'mobile',
  });
}

async function activateCliSurface(project: ProjectRecord): Promise<void> {
  const cliApi = window.calder?.cliSurface;
  if (!cliApi) {
    promptCliSurfaceProfile(project);
    return;
  }

  await openCliSurfaceWithSetup(project, {
    discover: (projectPath) => cliApi.discover(projectPath),
    start: async (profile) => {
      const profiles = upsertCliSurfaceProfile(project, profile);
      selectCliSurfaceProfile(project, profiles, profile.id);
      await cliApi.start(project.id, profile);
    },
    persist: (profile) => {
      const profiles = upsertCliSurfaceProfile(project, profile);
      selectCliSurfaceProfile(project, profiles, profile.id);
    },
    showQuickSetup: (_activeProject, candidates) => {
      showCliSurfaceQuickSetup(candidates, {
        onRun: (candidate) => {
          const profile = createDiscoveredCliSurfaceProfile(candidate);
          persistAndLaunchCliSurfaceProfile(project, profile);
        },
        onEdit: (candidate) => {
          promptCliSurfaceProfile(project, createDiscoveredCliSurfaceProfile(candidate));
        },
        onManual: () => promptCliSurfaceProfile(project),
      });
    },
    showManualSetup: (activeProject) => promptCliSurfaceProfile(activeProject),
  });
}

function renderSurfaceControls(): void {
  getSurfaceControlsController().renderSurfaceControls();
}

function syncSessionProviderSelector(): void {
  getSessionProviderSelectorController().syncSessionProviderSelector(appState.preferences.defaultProvider);
}

function setupCliUpdatePanel(): void {
  getCliUpdatePanelController().setup();
}

function isCliUpdatePanelVisible(): boolean {
  return getCliUpdatePanelController().isVisible();
}

function doesCliUpdatePanelContain(target: Node): boolean {
  return getCliUpdatePanelController().containsTarget(target);
}

function toggleCliUpdatePanel(visible: boolean): void {
  getCliUpdatePanelController().toggle(visible);
}

function renderCliUpdateButton(cliState: CliUpdateCenterState): void {
  getCliUpdatePanelController().renderButton(cliState);
}

function renderCliUpdatePanel(cliState: CliUpdateCenterState): void {
  getCliUpdatePanelController().renderPanel(cliState);
}

function startRename(tab: HTMLElement, project: ProjectRecord, session: SessionRecord): void {
  startInlineTabRename({
    tab,
    currentName: session.name,
    maxLength: MAX_SESSION_NAME_LENGTH,
    onCommit: (newName) => appState.renameSession(project.id, session.id, newName, true),
    onCancel: render,
  });
}

function applyContextMenuSemantics(menu: HTMLElement, label: string, focusFirstItem = true): void {
  applyTabContextMenuSemantics(menu, label, hideTabContextMenu, focusFirstItem);
}

function showTabContextMenu(x: number, y: number, project: ProjectRecord, session: SessionRecord, tab: HTMLElement): void {
  showSessionTabContextMenu({
    x,
    y,
    project,
    session,
    tab,
    hideTabContextMenu,
    setActiveContextMenu: (menu) => {
      activeContextMenu = menu;
    },
    applyContextMenuSemantics,
    startRename,
  });
}

function hideTabContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function ensureActiveTabVisible(key: string): void {
  if (key === lastActiveTabRailKey) return;
  lastActiveTabRailKey = key;
  const activeTab = tabListEl.querySelector('.tab-item.active') as HTMLElement | null;
  if (!activeTab) return;
  requestAnimationFrame(() => {
    activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function render(): void {
  if (tabListEl.querySelector('.tab-name input')) return;
  tabListEl.innerHTML = '';
  renderSurfaceControls();
  const project = appState.activeProject;
  if (!project) {
    syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
    renderGitStatus();
    return;
  }
  const surfaceState = getProjectSurface(project);
  const cliSurfaceTabActive = surfaceState.active && surfaceState.kind === 'cli' && surfaceState.tabFocus === 'cli';
  const mobileSurfaceTabActive = surfaceState.active && surfaceState.kind === 'mobile' && surfaceState.tabFocus === 'mobile';
  const surfaceTabPlacement = surfaceState.tabPlacement === 'start' ? 'start' : 'end';
  const surfaceTabOrder: Array<'cli' | 'mobile'> = Array.isArray(surfaceState.tabOrder)
    && surfaceState.tabOrder.length === 2
    && surfaceState.tabOrder.includes('cli')
    && surfaceState.tabOrder.includes('mobile')
    ? surfaceState.tabOrder
    : ['cli', 'mobile'];

  const sessionTabNodes: HTMLElement[] = [];
  const surfaceTabNodes: HTMLElement[] = [];

  for (const session of project.sessions) {
    sessionTabNodes.push(createSessionTab({
      project,
      session,
      tabListEl,
      cliSurfaceTabActive,
      mobileSurfaceTabActive,
      escapeHtml: esc,
      startRename,
      showTabContextMenu,
      getProjectSurface,
      updateProjectSurface,
    }));
  }

  const surfaceTabFactories: Record<'cli' | 'mobile', () => HTMLElement | null> = {
    cli: () => {
      if (!(project.surface?.active && project.surface.kind === 'cli')) return null;
      return createSurfaceModeTab({
        kind: 'cli',
        project,
        tabListEl,
        active: cliSurfaceTabActive,
        title: buildCliSurfaceTabTitle(project),
        badgeMarkup: '<span class="tab-cli-surface-badge">CLI</span>',
        label: 'CLI Surface',
        onFocus: () => appState.focusCliSurfaceTab(project.id),
        onClose: () => appState.closeCliSurface(project.id),
        getProjectSurface,
        updateProjectSurface,
      });
    },
    mobile: () => {
      if (!(project.surface?.active && project.surface.kind === 'mobile')) return null;
      return createSurfaceModeTab({
        kind: 'mobile',
        project,
        tabListEl,
        active: mobileSurfaceTabActive,
        title: 'Mobile Surface',
        badgeMarkup: '<span class="tab-browser-badge">MOB</span>',
        label: 'Mobile Surface',
        onFocus: () => appState.focusMobileSurfaceTab(project.id),
        onClose: () => appState.closeMobileSurface(project.id),
        getProjectSurface,
        updateProjectSurface,
      });
    },
  };

  for (const kind of surfaceTabOrder) {
    const next = surfaceTabFactories[kind]();
    if (next) surfaceTabNodes.push(next);
  }

  const appendTabs = (nodes: HTMLElement[]): void => {
    for (const node of nodes) {
      tabListEl.appendChild(node);
    }
  };

  if (surfaceTabPlacement === 'start') {
    appendTabs(surfaceTabNodes);
    appendTabs(sessionTabNodes);
  } else {
    appendTabs(sessionTabNodes);
    appendTabs(surfaceTabNodes);
  }

  ensureActiveTabVisible([
    appState.activeProjectId,
    project.activeSessionId,
    project.sessions.length,
    project.surface?.kind ?? 'none',
    project.surface?.active ? 'surface-open' : 'surface-closed',
    project.surface?.tabFocus ?? 'session',
  ].join(':'));

  syncMobileControlButton(btnMobileControl, mobileControlPresenceEl);
  renderGitStatus();
}

function renderGitStatus(): void {
  const project = appState.activeProject;
  const view = buildGitStatusView(
    Boolean(project),
    project ? getGitStatus(project.id) : null,
    esc,
  );
  gitStatusEl.innerHTML = view.html;
  gitStatusEl.dataset.state = view.state;
  if (view.busy) {
    gitStatusEl.setAttribute('aria-busy', 'true');
  } else {
    gitStatusEl.removeAttribute('aria-busy');
  }
  if (view.shouldRefresh) {
    void refreshGitStatus();
  }
}

async function showBranchContextMenu(event: MouseEvent): Promise<void> {
  await getBranchMenuController().showBranchContextMenu(event);
}

export function quickNewSession(): void {
  getSessionMenuController().quickNewSession();
}

function showAddSessionContextMenu(x: number, y: number): void {
  getSessionMenuController().showAddSessionContextMenu(x, y);
}

export async function promptNewSession(onCreated?: (session: SessionRecord) => void): Promise<void> {
  await getSessionMenuController().promptNewSession(onCreated);
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}
