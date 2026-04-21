import { appState, MAX_SESSION_NAME_LENGTH, type ProjectRecord, type SessionRecord } from '../state.js';
import type {
  CliSurfacePortMode,
  CliSurfaceProfile,
  ProjectSurfaceRecord,
  ProviderId,
} from '../../shared/types.js';
import { showModal, closeModal, setModalError, FieldDef } from './modal.js';
import { createCustomSelect, type CustomSelectInstance } from './custom-select.js';
import { onChange as onStatusChange, getStatus, type SessionStatus } from '../session-activity.js';
import { onChange as onGitStatusChange, getGitStatus, refreshGitStatus } from '../git-status.js';

import { isUnread, onChange as onUnreadChange } from '../session-unread.js';
import {
  buildShareDialogMobilePresence,
  showShareDialog,
} from './share-dialog.js';
import { isSharing, isConnected } from '../sharing/peer-host.js';
import { endShare, onShareChange } from '../sharing/share-manager.js';
import { openInspector, isInspectorOpen, getInspectedSessionId, closeInspector } from './session-inspector.js';
import {
  loadProviderAvailability,
  hasMultipleAvailableProviders,
  getProviderAvailabilitySnapshot,
  getProviderCapabilities,
  resolvePreferredProviderForLaunch,
} from '../provider-availability.js';
import { buildResumeWithProviderItems } from './resume-with-provider-menu.js';
import { buildProviderIconMarkup } from './tab-provider-icon.js';
import { openCliSurfaceWithSetup } from './cli-surface/setup.js';
import { showCliSurfaceQuickSetup } from './cli-surface/quick-setup.js';
import {
  createDiscoveredCliSurfaceProfile,
  getCliSurfaceProfileLabel,
} from './cli-surface/profile.js';
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
let surfaceProfileSelect: CustomSelectInstance | null = null;
let surfaceControlsSignature = '';
const prevStatus = new Map<string, SessionStatus>();
let lastActiveTabRailKey = '';
let cliUpdatePanelController: TabBarCliUpdatePanelController | null = null;
let sessionProviderSelectorController: TabBarProviderSelectorController | null = null;
let branchMenuController: TabBarBranchMenuController | null = null;
let sessionMenuController: TabBarSessionMenuController | null = null;
let unsubscribeUpdateCenter: (() => void) | null = null;
type LauncherSelectKey = 'profile' | 'provider';
const launcherSelectOpenState: Record<LauncherSelectKey, boolean> = {
  profile: false,
  provider: false,
};

function buildTooltip(status: SessionStatus, cliSessionId?: string | null): string {
  const statusLine = `Status: ${status}`;
  return cliSessionId ? `${statusLine}\nSession: ${cliSessionId}` : statusLine;
}

function buildTabTitle(session: SessionRecord): string {
  const baseTitle = session.type === 'diff-viewer'
    ? `Diff: ${session.diffFilePath || session.name}`
    : session.type === 'mcp-inspector'
      ? 'MCP Inspector'
      : session.type === 'file-reader'
        ? `File: ${session.fileReaderPath || session.name}`
        : session.type === 'remote-terminal'
          ? `Remote: ${session.remoteHostName || session.name}`
          : session.type === 'browser-tab'
            ? `Browser: ${session.browserTabUrl || 'New Tab'}`
            : buildTooltip(getStatus(session.id), session.cliSessionId);
  return `${baseTitle}\nDrag to reorder`;
}

function buildCliSurfaceTabTitle(project: ProjectRecord): string {
  const surface = getProjectSurface(project);
  const selectedProfile = surface.cli?.profiles.find((profile) => profile.id === surface.cli?.selectedProfileId);
  const profileLabel = selectedProfile ? getCliSurfaceProfileLabel(selectedProfile) : 'No profile selected';
  return `CLI Surface\nProfile: ${profileLabel}`;
}

function getActiveCliSession(project: ProjectRecord): SessionRecord | null {
  const activeSession = project.sessions.find((session) => session.id === project.activeSessionId) ?? null;
  if (!activeSession) return null;
  const isCliSession = !activeSession.type || activeSession.type === 'claude';
  return isCliSession ? activeSession : null;
}

function getPreferredCliSession(project: ProjectRecord): SessionRecord | null {
  const cliSessions = project.sessions.filter((session) => !session.type || session.type === 'claude');
  const connectedSession = cliSessions.find((session) => isConnected(session.id));
  if (connectedSession) return connectedSession;

  const sharingSession = cliSessions.find((session) => isSharing(session.id));
  if (sharingSession) return sharingSession;

  const activeCliSession = getActiveCliSession(project);
  if (activeCliSession) return activeCliSession;
  return cliSessions[0] ?? null;
}

function syncMobileControlButton(): void {
  if (!btnMobileControl) return;
  const language = appState.preferences.language === 'tr' ? 'tr' : 'en';
  const uiCopy = language === 'tr'
    ? {
        createCliSessionHint: 'Henüz CLI oturumu yok. Bir tane oluşturup güvenli devri başlatmak için tıklayın',
        openSecureHandoffFor: (sessionName: string) => `"${sessionName}" için güvenli devir panelini aç`,
        openPanelSuffix: 'Paneli aç.',
      }
    : {
        createCliSessionHint: 'No CLI session yet. Click to create one and start secure handoff',
        openSecureHandoffFor: (sessionName: string) => `Open secure handoff panel for "${sessionName}"`,
        openPanelSuffix: 'Open panel.',
      };
  const project = appState.activeProject;
  if (!project) {
    btnMobileControl.hidden = true;
    btnMobileControl.disabled = true;
    btnMobileControl.classList.remove('is-sharing', 'is-connected');
    btnMobileControl.removeAttribute('data-connection-state');
    if (mobileControlPresenceEl) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    }
    return;
  }

  const targetCliSession = getPreferredCliSession(project);
  btnMobileControl.hidden = false;
  if (!targetCliSession) {
    btnMobileControl.disabled = false;
    btnMobileControl.classList.remove('is-sharing', 'is-connected');
    btnMobileControl.dataset.connectionState = 'idle';
    btnMobileControl.setAttribute('aria-pressed', 'false');
    btnMobileControl.title = uiCopy.createCliSessionHint;
    btnMobileControl.setAttribute('aria-label', uiCopy.createCliSessionHint);
    if (mobileControlPresenceEl) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    }
    return;
  }

  const sharing = isSharing(targetCliSession.id);
  const connected = sharing && isConnected(targetCliSession.id);
  const presence = buildShareDialogMobilePresence({
    sessionId: targetCliSession.id,
    language: appState.preferences.language,
    resolveSessionName: (sessionId, fallbackSessionId) =>
      project.sessions.find((session) => session.id === sessionId)?.name ?? fallbackSessionId,
    nowMs: Date.now(),
  });
  btnMobileControl.disabled = false;
  btnMobileControl.classList.toggle('is-sharing', sharing);
  btnMobileControl.classList.toggle('is-connected', connected);
  btnMobileControl.dataset.connectionState = connected ? 'connected' : sharing ? 'waiting' : 'idle';
  btnMobileControl.setAttribute('aria-pressed', sharing ? 'true' : 'false');
  const connectedTitle = presence.metaText
    ? `${presence.summaryText} · ${presence.metaText} ${uiCopy.openPanelSuffix}`
    : `${presence.summaryText} ${uiCopy.openPanelSuffix}`;
  const waitingTitle = presence.metaText
    ? `${presence.summaryText} · ${presence.metaText} ${uiCopy.openPanelSuffix}`
    : `${presence.summaryText} ${uiCopy.openPanelSuffix}`;
  const idleTitle = `${presence.summaryText} · ${uiCopy.openSecureHandoffFor(targetCliSession.name)}`;
  btnMobileControl.title = connected
    ? connectedTitle
    : sharing
      ? waitingTitle
      : idleTitle;
  btnMobileControl.setAttribute(
    'aria-label',
    connected
      ? connectedTitle
      : sharing
        ? waitingTitle
        : idleTitle,
  );

  if (mobileControlPresenceEl) {
    if (!sharing) {
      mobileControlPresenceEl.hidden = true;
      mobileControlPresenceEl.textContent = '';
      mobileControlPresenceEl.removeAttribute('data-connection-state');
      mobileControlPresenceEl.removeAttribute('title');
    } else {
      mobileControlPresenceEl.hidden = false;
      mobileControlPresenceEl.dataset.connectionState = connected ? 'connected' : 'waiting';
      mobileControlPresenceEl.textContent = presence.stateLabel;
      mobileControlPresenceEl.title = connected
        ? connectedTitle
        : waitingTitle;
    }
  }
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
        syncMobileControlButton();
      });
      return;
    }
    showShareDialog(targetCliSession.id);
    syncMobileControlButton();
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
      tab.title = buildTooltip(status, session?.cliSessionId);
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
  syncMobileControlButton();
  renderCliUpdateButton(getUpdateCenterState().cli);
}

function destroySessionProviderSelector(): void {
  getSessionProviderSelectorController().destroySessionProviderSelector();
}

function destroySurfaceProfileSelector(): void {
  if (surfaceProfileSelect) {
    surfaceProfileSelect.destroy();
    surfaceProfileSelect = null;
  }
  setSessionLauncherSelectOpen('profile', false);
  surfaceControlsSignature = '';
  surfaceModeSlotEl.innerHTML = '';
  surfaceModeSlotEl.hidden = true;
  surfaceProfileSlotEl.innerHTML = '';
  surfaceProfileSlotEl.hidden = true;
}

function setSessionLauncherSelectOpen(selectKey: LauncherSelectKey, open: boolean): void {
  launcherSelectOpenState[selectKey] = open;
  const anyOpen = launcherSelectOpenState.profile || launcherSelectOpenState.provider;
  sessionLauncherEl.dataset.selectOpen = anyOpen ? 'true' : 'false';
}

function createDefaultProjectSurface(): ProjectSurfaceRecord {
  return {
    kind: 'web',
    active: false,
    tabFocus: 'session',
    tabPlacement: 'end',
    tabOrder: ['cli', 'mobile'],
    web: { history: [] },
    cli: { profiles: [], runtime: { status: 'idle' } },
  };
}

function getProjectSurface(project: ProjectRecord): ProjectSurfaceRecord {
  return project.surface ?? createDefaultProjectSurface();
}

function parseCliSurfaceArgs(raw: string): string[] | undefined {
  const matches = raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const args = matches
    .map((token) => token.replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
  return args.length > 0 ? args : undefined;
}

function parseCliSurfacePortMode(raw: string | undefined, fallback: CliSurfacePortMode = 'auto'): CliSurfacePortMode {
  if (raw === 'auto' || raw === 'fixed' || raw === 'off') return raw;
  return fallback;
}

function normalizeCliSurfaceCommand(command: string): string {
  const trimmed = command.trim();
  const slashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const base = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
  return base.toLowerCase();
}

function parsePackageManagerScriptName(command: string, args: string[] | undefined): string | undefined {
  if (!args || args.length === 0) return undefined;
  if (command === 'npm') {
    if (args[0] === 'run' || args[0] === 'run-script') return args[1];
    return undefined;
  }
  if (command === 'pnpm') {
    if (args[0] === 'run' || args[0] === 'run-script') return args[1];
    if (!args[0].startsWith('-')) return args[0];
    return undefined;
  }
  if (command === 'yarn') {
    if (args[0] === 'run') return args[1];
    if (!args[0].startsWith('-')) return args[0];
    return undefined;
  }
  return undefined;
}

function isLikelyFixedPortCompatible(command: string, args: string[] | undefined): boolean {
  const normalized = normalizeCliSurfaceCommand(command);
  if (normalized === 'vite' || normalized === 'astro' || normalized === 'next' || normalized === 'nuxt' || normalized === 'nuxi') {
    return true;
  }
  if (normalized === 'npm' || normalized === 'pnpm' || normalized === 'yarn') {
    return Boolean(parsePackageManagerScriptName(normalized, args));
  }
  return false;
}

function updateProjectSurface(project: ProjectRecord, next: ProjectSurfaceRecord): void {
  appState.setProjectSurface(project.id, next);
}

function upsertCliSurfaceProfile(project: ProjectRecord, profile: CliSurfaceProfile): CliSurfaceProfile[] {
  const surface = getProjectSurface(project);
  const profiles = [...(surface.cli?.profiles ?? [])];
  const existingIndex = profiles.findIndex((entry) => entry.id === profile.id);
  if (existingIndex >= 0) {
    profiles[existingIndex] = profile;
  } else {
    profiles.push(profile);
  }
  return profiles;
}

function persistAndLaunchCliSurfaceProfile(project: ProjectRecord, profile: CliSurfaceProfile): void {
  const surface = getProjectSurface(project);
  const profiles = upsertCliSurfaceProfile(project, profile);
  updateProjectSurface(project, {
    ...surface,
    kind: 'cli',
    active: true,
    cli: {
      profiles,
      selectedProfileId: profile.id,
      runtime: surface.cli?.runtime
        ? {
            ...surface.cli.runtime,
            selectedProfileId: profile.id,
          }
        : {
            status: 'idle',
            selectedProfileId: profile.id,
          },
    },
  });
  void window.calder?.cliSurface?.start(project.id, profile);
}

function promptCliSurfaceProfile(
  project: ProjectRecord,
  existing?: CliSurfaceProfile,
  onReady?: (profile: CliSurfaceProfile) => void,
): void {
  showModal(
    existing ? 'Edit CLI Surface Profile' : 'CLI Surface Profile',
    [
      {
        label: 'Name',
        id: 'cli-profile-name',
        placeholder: 'Textual Dev',
        defaultValue: existing?.name ?? 'CLI Preview',
      },
      {
        label: 'Command',
        id: 'cli-profile-command',
        placeholder: 'python',
        defaultValue: existing?.command ?? '',
      },
      {
        label: 'Arguments',
        id: 'cli-profile-args',
        placeholder: "-m textual run app.py",
        defaultValue: existing?.args?.join(' ') ?? '',
      },
      {
        label: 'Working directory',
        id: 'cli-profile-cwd',
        placeholder: project.path,
        defaultValue: existing?.cwd ?? project.path,
      },
      {
        label: 'Port mode',
        id: 'cli-profile-port-mode',
        type: 'select',
        defaultValue: existing?.portMode ?? 'auto',
        options: [
          { value: 'auto', label: 'Auto (recommended)' },
          { value: 'fixed', label: 'Fixed port (supported web-server commands)' },
          { value: 'off', label: 'Off (no orchestration)' },
        ],
      },
      {
        label: 'Preferred port (optional in auto mode)',
        id: 'cli-profile-preferred-port',
        placeholder: '5173',
        defaultValue: existing?.preferredPort ? String(existing.preferredPort) : '',
      },
      {
        label: 'Allow fallback to next free port',
        id: 'cli-profile-port-fallback',
        type: 'checkbox',
        defaultValue: String(existing?.allowPortFallback ?? true),
      },
    ],
    (values) => {
      const name = values['cli-profile-name']?.trim();
      const command = values['cli-profile-command']?.trim();
      const parsedArgs = parseCliSurfaceArgs(values['cli-profile-args'] ?? '');
      const cwd = values['cli-profile-cwd']?.trim() || project.path;
      if (!name) {
        setModalError('cli-profile-name', 'Profile name is required');
        return;
      }
      if (!command) {
        setModalError('cli-profile-command', 'Command is required');
        return;
      }

      const portMode = parseCliSurfacePortMode(values['cli-profile-port-mode'], existing?.portMode ?? 'auto');
      const preferredPortRaw = values['cli-profile-preferred-port']?.trim() ?? '';
      let preferredPort: number | undefined;
      if (preferredPortRaw.length > 0) {
        const parsed = Number.parseInt(preferredPortRaw, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          setModalError('cli-profile-preferred-port', 'Port must be between 1 and 65535');
          return;
        }
        preferredPort = parsed;
      } else if (portMode === 'fixed') {
        setModalError('cli-profile-preferred-port', 'Fixed mode requires a port');
        return;
      }

      const allowPortFallback = values['cli-profile-port-fallback'] === 'true';
      if (portMode === 'fixed' && !isLikelyFixedPortCompatible(command, parsedArgs)) {
        setModalError(
          'cli-profile-port-mode',
          'Fixed mode needs a supported command: vite/next/nuxt/astro or npm/pnpm/yarn with a script target.',
        );
        return;
      }

      const profile: CliSurfaceProfile = {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        command,
        args: parsedArgs,
        cwd,
        portMode,
        preferredPort,
        allowPortFallback,
      };

      const surface = getProjectSurface(project);
      const profiles = [...(surface.cli?.profiles ?? [])];
      const existingIndex = profiles.findIndex((entry) => entry.id === profile.id);
      if (existingIndex >= 0) {
        profiles[existingIndex] = profile;
      } else {
        profiles.push(profile);
      }

      updateProjectSurface(project, {
        ...surface,
        kind: 'cli',
        active: true,
        cli: {
          profiles,
          selectedProfileId: profile.id,
          runtime: surface.cli?.runtime
            ? {
                ...surface.cli.runtime,
                selectedProfileId: profile.id,
              }
            : {
                status: 'idle',
                selectedProfileId: profile.id,
              },
        },
      });
      closeModal();
      onReady?.(profile);
    },
  );
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
      const surface = getProjectSurface(project);
      const profiles = upsertCliSurfaceProfile(project, profile);
      updateProjectSurface(project, {
        ...surface,
        kind: 'cli',
        active: true,
        cli: {
          profiles,
          selectedProfileId: profile.id,
          runtime: surface.cli?.runtime
            ? {
                ...surface.cli.runtime,
                selectedProfileId: profile.id,
              }
            : {
                status: 'idle',
                selectedProfileId: profile.id,
              },
        },
      });
      await cliApi.start(project.id, profile);
    },
    persist: (profile) => {
      const surface = getProjectSurface(project);
      const profiles = upsertCliSurfaceProfile(project, profile);
      updateProjectSurface(project, {
        ...surface,
        kind: 'cli',
        active: true,
        cli: {
          profiles,
          selectedProfileId: profile.id,
          runtime: surface.cli?.runtime
            ? {
                ...surface.cli.runtime,
                selectedProfileId: profile.id,
              }
            : {
                status: 'idle',
                selectedProfileId: profile.id,
              },
        },
      });
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

function buildSurfaceControlsSignature(project: ProjectRecord): string {
  const surface = getProjectSurface(project);
  const profiles = surface.cli?.profiles ?? [];
  const profileSignature = profiles
    .map((profile) => `${profile.id}:${getCliSurfaceProfileLabel(profile)}:${profile.cwd ?? ''}:${profile.command}`)
    .join('|');
  return [
    project.id,
    surface.kind,
    surface.active ? '1' : '0',
    surface.tabFocus ?? 'session',
    surface.cli?.selectedProfileId ?? '',
    profileSignature,
  ].join('::');
}

function renderSurfaceControls(): void {
  const project = appState.activeProject;
  if (!project) {
    if (surfaceControlsSignature || surfaceModeSlotEl.childElementCount > 0 || surfaceProfileSlotEl.childElementCount > 0) {
      destroySurfaceProfileSelector();
    }
    return;
  }

  const nextSignature = buildSurfaceControlsSignature(project);
  if (nextSignature === surfaceControlsSignature) return;

  destroySurfaceProfileSelector();
  surfaceControlsSignature = nextSignature;

  const surface = getProjectSurface(project);
  const switcher = document.createElement('div');
  switcher.className = 'surface-mode-switcher';

  ([
    { kind: 'web' as const, label: 'Live View' },
    { kind: 'cli' as const, label: 'CLI Surface' },
    { kind: 'mobile' as const, label: 'Mobile' },
  ]).forEach(({ kind, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'surface-mode-button';
    button.dataset.surfaceKind = kind;
    button.textContent = label;
    button.classList.toggle('active', surface.kind === kind && surface.active);
    button.addEventListener('click', () => {
      if (kind === 'web') activateLiveViewSurface(project);
      else if (kind === 'cli') void activateCliSurface(project);
      else activateMobileSurface(project);
    });
    switcher.appendChild(button);
  });

  surfaceModeSlotEl.hidden = false;
  surfaceModeSlotEl.appendChild(switcher);

  if (surface.kind !== 'cli') return;

  const group = document.createElement('div');
  group.className = 'surface-profile-group';
  const profiles = surface.cli?.profiles ?? [];
  const selectedProfile = profiles.find((profile) => profile.id === surface.cli?.selectedProfileId) ?? profiles[0];

  if (profiles.length > 0) {
    const select = createCustomSelect(
      'command-deck-cli-profile',
      [
        ...profiles.map((profile) => ({ value: profile.id, label: getCliSurfaceProfileLabel(profile) })),
        { value: '__new__', label: '+ New profile…' },
      ],
      selectedProfile?.id,
      {
        floating: {
          placement: 'bottom-end',
          offsetPx: 8,
          maxWidthPx: 320,
          maxHeightPx: 320,
          strategy: 'fixed',
        },
        onOpenChange: (open) => setSessionLauncherSelectOpen('profile', open),
      },
    );
    select.element.classList.add('command-deck-cli-profile-select');
    const hiddenInput = select.element.querySelector('#command-deck-cli-profile') as HTMLInputElement | null;
    hiddenInput?.addEventListener('change', () => {
      const value = hiddenInput.value;
      if (value === '__new__') {
        promptCliSurfaceProfile(project);
        return;
      }
      const currentSurface = getProjectSurface(project);
      updateProjectSurface(project, {
        ...currentSurface,
        cli: {
          profiles,
          selectedProfileId: value,
          runtime: currentSurface.cli?.runtime
            ? {
                ...currentSurface.cli.runtime,
                selectedProfileId: value,
              }
            : {
                status: 'idle',
                selectedProfileId: value,
              },
        },
      });
    });
    group.appendChild(select.element);
    surfaceProfileSelect = select;
  }

  const configureButton = document.createElement('button');
  configureButton.type = 'button';
  configureButton.className = 'surface-profile-config';
  configureButton.dataset.role = profiles.length > 0 ? 'edit-profile' : 'setup-profile';
  configureButton.textContent = profiles.length > 0 ? 'Edit' : 'Set up';
  configureButton.addEventListener('click', () => {
    promptCliSurfaceProfile(project, selectedProfile);
  });
  group.appendChild(configureButton);

  surfaceProfileSlotEl.hidden = false;
  surfaceProfileSlotEl.appendChild(group);
}

function syncQuickSessionButtonMeta(providerId: ProviderId): void {
  getSessionProviderSelectorController().syncQuickSessionButtonMeta(providerId);
}

function buildSessionProviderSelectorSignature(snapshot: ReturnType<typeof getProviderAvailabilitySnapshot>): string {
  return getSessionProviderSelectorController().buildSessionProviderSelectorSignature(snapshot);
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
  const nameSpan = tab.querySelector('.tab-name') as HTMLElement;
  if (nameSpan.querySelector('input')) return;

  const input = document.createElement('input');
  input.maxLength = MAX_SESSION_NAME_LENGTH;
  input.value = session.name;
  nameSpan.textContent = '';
  nameSpan.appendChild(input);
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    input.remove();
    if (newName && newName !== session.name) {
      appState.renameSession(project.id, session.id, newName, true);
    } else {
      render();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      committed = true;
      input.remove();
      render();
    }
  });

  input.addEventListener('blur', commit);
}

function applyContextMenuSemantics(menu: HTMLElement, label: string, focusFirstItem = true): void {
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);

  const isInteractive = (item: HTMLElement): boolean => (
    !item.classList.contains('disabled')
    && !item.classList.contains('active')
    && item.getAttribute('aria-disabled') !== 'true'
  );
  const getEnabledItems = (): HTMLElement[] => Array
    .from(menu.querySelectorAll<HTMLElement>('.tab-context-menu-item'))
    .filter(isInteractive);

  for (const item of menu.querySelectorAll<HTMLElement>('.tab-context-menu-item')) {
    const interactive = isInteractive(item);
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-disabled', interactive ? 'false' : 'true');
    item.tabIndex = -1;
  }

  for (const separator of menu.querySelectorAll<HTMLElement>('.tab-context-menu-separator')) {
    separator.setAttribute('role', 'separator');
  }

  const focusItemAt = (index: number, enabledItems: HTMLElement[]): void => {
    if (enabledItems.length === 0) return;
    const normalized = (index + enabledItems.length) % enabledItems.length;
    enabledItems[normalized]?.focus();
  };

  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideTabContextMenu();
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    ) return;

    const enabledItems = getEnabledItems();
    if (enabledItems.length === 0) return;
    const focusedIndex = enabledItems.findIndex((item) => item === document.activeElement);
    if (event.key === 'Enter' || event.key === ' ') {
      if (document.activeElement instanceof HTMLElement && isInteractive(document.activeElement)) {
        event.preventDefault();
        document.activeElement.click();
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(focusedIndex < 0 ? 0 : focusedIndex + 1, enabledItems);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(focusedIndex < 0 ? enabledItems.length - 1 : focusedIndex - 1, enabledItems);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0, enabledItems);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(enabledItems.length - 1, enabledItems);
    } else if (event.key === 'Tab') {
      hideTabContextMenu();
    }
  });

  if (focusFirstItem) {
    requestAnimationFrame(() => {
      getEnabledItems()[0]?.focus();
    });
  }
}

function showTabContextMenu(x: number, y: number, project: ProjectRecord, session: SessionRecord, tab: HTMLElement): void {
  hideTabContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());

  const renameItem = document.createElement('div');
  renameItem.className = 'tab-context-menu-item';
  renameItem.textContent = 'Rename';
  renameItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    startRename(tab, project, session);
  });

  const closeItem = document.createElement('div');
  closeItem.className = 'tab-context-menu-item';
  closeItem.textContent = 'Close';
  closeItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    appState.removeSession(project.id, session.id);
  });

  const sessionIdx = project.sessions.findIndex((s) => s.id === session.id);
  const totalSessions = project.sessions.length;

  const separator = document.createElement('div');
  separator.className = 'tab-context-menu-separator';

  const closeAllItem = document.createElement('div');
  closeAllItem.className = 'tab-context-menu-item';
  closeAllItem.textContent = 'Close All';
  closeAllItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    appState.removeAllSessions(project.id);
  });

  const closeOthersItem = document.createElement('div');
  closeOthersItem.className = 'tab-context-menu-item' + (totalSessions <= 1 ? ' disabled' : '');
  closeOthersItem.textContent = 'Close Others';
  if (totalSessions > 1) {
    closeOthersItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      appState.removeOtherSessions(project.id, session.id);
    });
  }

  const closeRightItem = document.createElement('div');
  closeRightItem.className = 'tab-context-menu-item' + (sessionIdx >= totalSessions - 1 ? ' disabled' : '');
  closeRightItem.textContent = 'Close to the Right';
  if (sessionIdx < totalSessions - 1) {
    closeRightItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      appState.removeSessionsFromRight(project.id, session.id);
    });
  }

  const closeLeftItem = document.createElement('div');
  closeLeftItem.className = 'tab-context-menu-item' + (sessionIdx <= 0 ? ' disabled' : '');
  closeLeftItem.textContent = 'Close to the Left';
  if (sessionIdx > 0) {
    closeLeftItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      appState.removeSessionsFromLeft(project.id, session.id);
    });
  }

  const moveLeftItem = document.createElement('div');
  moveLeftItem.className = 'tab-context-menu-item' + (sessionIdx <= 0 ? ' disabled' : '');
  moveLeftItem.textContent = 'Move Left';
  if (sessionIdx > 0) {
    moveLeftItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      appState.reorderSession(project.id, session.id, sessionIdx - 1);
    });
  }

  const moveRightItem = document.createElement('div');
  moveRightItem.className = 'tab-context-menu-item' + (sessionIdx >= totalSessions - 1 ? ' disabled' : '');
  moveRightItem.textContent = 'Move Right';
  if (sessionIdx < totalSessions - 1) {
    moveRightItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      appState.reorderSession(project.id, session.id, sessionIdx + 1);
    });
  }

  // Share menu items — only for CLI sessions (not special types)
  const isCliSession = !session.type || session.type === 'claude';
  const isRemote = session.type === 'remote-terminal';
  const providerCapabilities = getProviderCapabilities(session.providerId || 'claude');
  const canInspect = isCliSession && providerCapabilities?.hookStatus !== false;
  const currentlySharing = isSharing(session.id);

  const shareSeparator = document.createElement('div');
  shareSeparator.className = 'tab-context-menu-separator';

  const shareItem = document.createElement('div');
  shareItem.className = 'tab-context-menu-item' + (!isCliSession ? ' disabled' : '');
  shareItem.textContent = currentlySharing ? 'Manage Sharing\u2026' : 'Share Session\u2026';
  if (isCliSession) {
    shareItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      showShareDialog(session.id);
    });
  }

  const mobileShareItem = document.createElement('div');
  mobileShareItem.className = 'tab-context-menu-item' + (!isCliSession ? ' disabled' : '');
  mobileShareItem.textContent = 'Mobile Control\u2026';
  if (isCliSession) {
    mobileShareItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      showShareDialog(session.id);
    });
  }

  const stopShareItem = document.createElement('div');
  stopShareItem.className = 'tab-context-menu-item' + (!currentlySharing ? ' disabled' : '');
  stopShareItem.textContent = 'Stop Sharing';
  if (currentlySharing) {
    stopShareItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      endShare(session.id);
    });
  }

  menu.appendChild(renameItem);
  menu.appendChild(moveLeftItem);
  menu.appendChild(moveRightItem);

  if (appState.preferences.debugMode) {
    const sessionSeparator = document.createElement('div');
    sessionSeparator.className = 'tab-context-menu-separator';

    const cliSessionId = session.cliSessionId;
    const hasCliSession = !!cliSessionId;

    const copySessionIdItem = document.createElement('div');
    copySessionIdItem.className = 'tab-context-menu-item' + (!hasCliSession ? ' disabled' : '');
    copySessionIdItem.textContent = 'Copy CLI Session ID';
    if (hasCliSession) {
      copySessionIdItem.addEventListener('click', (e) => {
        e.stopPropagation();
        hideTabContextMenu();
        navigator.clipboard.writeText(cliSessionId);
      });
    }

    const copyInternalIdItem = document.createElement('div');
    copyInternalIdItem.className = 'tab-context-menu-item';
    copyInternalIdItem.textContent = 'Copy Internal ID';
    copyInternalIdItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      navigator.clipboard.writeText(session.id);
    });

    menu.appendChild(sessionSeparator);
    menu.appendChild(copyInternalIdItem);
    menu.appendChild(copySessionIdItem);
  }

  // Inspect item — only for CLI sessions
  const inspectItem = document.createElement('div');
  const isCurrentlyInspecting = isInspectorOpen() && getInspectedSessionId() === session.id;
  inspectItem.className = 'tab-context-menu-item' + (!canInspect ? ' disabled' : '');
  inspectItem.textContent = isCurrentlyInspecting ? 'Close Inspector' : 'Inspect';
  if (canInspect) {
    inspectItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideTabContextMenu();
      if (isCurrentlyInspecting) {
        closeInspector();
      } else {
        openInspector(session.id);
      }
    });
  }

  const moveSeparator = document.createElement('div');
  moveSeparator.className = 'tab-context-menu-separator';
  menu.appendChild(moveSeparator);
  if (isCliSession || isRemote) {
    menu.appendChild(shareSeparator);
    if (!currentlySharing) {
      menu.appendChild(shareItem);
      menu.appendChild(mobileShareItem);
    }
    if (currentlySharing) menu.appendChild(stopShareItem);
  }
  if (canInspect) {
    const inspectSeparator = document.createElement('div');
    inspectSeparator.className = 'tab-context-menu-separator';
    menu.appendChild(inspectSeparator);
    menu.appendChild(inspectItem);
  }

  // Resume with <other provider> — only for CLI sessions
  if (isCliSession) {
    const items = buildResumeWithProviderItems(
      (session.providerId || 'claude') as ProviderId,
      (targetId) => {
        hideTabContextMenu();
        appState.resumeWithProvider(project.id, { sessionId: session.id }, targetId);
      },
    );
    for (const el of items) menu.appendChild(el);
  }

  menu.appendChild(closeItem);
  menu.appendChild(separator);
  menu.appendChild(closeAllItem);
  menu.appendChild(closeOthersItem);
  menu.appendChild(closeRightItem);
  menu.appendChild(closeLeftItem);
  document.body.appendChild(menu);
  activeContextMenu = menu;

  // Adjust if menu goes off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  applyContextMenuSemantics(menu, 'Session actions');
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
    syncMobileControlButton();
    renderGitStatus();
    return;
  }
  const surfaceState = getProjectSurface(project);
  const cliSurfaceTabActive = surfaceState.active && surfaceState.kind === 'cli' && surfaceState.tabFocus === 'cli';
  const mobileSurfaceTabActive = surfaceState.active && surfaceState.kind === 'mobile' && surfaceState.tabFocus === 'mobile';
  const surfaceTabPlacement = surfaceState.tabPlacement === 'start' ? 'start' : 'end';
  const surfaceTabOrder = Array.isArray(surfaceState.tabOrder)
    && surfaceState.tabOrder.length === 2
    && surfaceState.tabOrder.includes('cli')
    && surfaceState.tabOrder.includes('mobile')
    ? surfaceState.tabOrder
    : ['cli', 'mobile'];

  const sessionTabNodes: HTMLElement[] = [];
  const surfaceTabNodes: HTMLElement[] = [];

  for (const session of project.sessions) {
    const tab = document.createElement('div');
    const isActive = !cliSurfaceTabActive && !mobileSurfaceTabActive && session.id === project.activeSessionId;
    const unread = !isActive && isUnread(session.id);
    const isMcp = session.type === 'mcp-inspector';
    const isDiff = session.type === 'diff-viewer';
    const isFileReader = session.type === 'file-reader';
    const isRemoteTab = session.type === 'remote-terminal';
    const isBrowserTab = session.type === 'browser-tab';
    const isSpecial = isMcp || isDiff || isFileReader || isRemoteTab || isBrowserTab;
    const sharing = isSharing(session.id);
    tab.className = 'tab-item' + (isActive ? ' active' : '') + (unread ? ' unread' : '') + (sharing ? ' tab-sharing' : '') + (isRemoteTab ? ' tab-remote' : '');
    tab.dataset.sessionId = session.id;
    tab.title = buildTabTitle(session);
    const providerId = session.providerId || 'claude';
    const providerIcon = buildProviderIconMarkup(providerId, hasMultipleAvailableProviders());
    const namePrefix = isDiff ? '<span class="tab-diff-badge">DIFF</span> ' : isMcp ? '<span class="tab-mcp-badge">MCP</span> ' : isFileReader ? '<span class="tab-file-badge">FILE</span> ' : isRemoteTab ? '<span class="tab-remote-badge">P2P</span> ' : isBrowserTab ? '<span class="tab-browser-badge">WEB</span> ' : !isSpecial ? providerIcon : '';
    const shareIndicator = sharing ? '<span class="tab-share-indicator calder-status-pill" title="Sharing">Live</span>' : '';
    const statusDot = isSpecial ? '' : `<span class="tab-status ${getStatus(session.id)}"></span>`;
    const reorderHandle = project.sessions.length > 1
      ? '<span class="tab-reorder-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>'
      : '';
    const nameContent = `
      <span class="tab-name-prefix">${namePrefix}</span>
      <span class="tab-name-label">${esc(session.name)}</span>
    `;
    tab.innerHTML = `
      ${reorderHandle}
      ${statusDot}
      <span class="tab-name">${nameContent}</span>
      ${shareIndicator}
      <span class="tab-close" title="Close session">&times;</span>
    `;

    // Click to switch
    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab-close')) return;
      if (tab.querySelector('.tab-name input')) return;
      const shouldReturnSurfaceFocusToSession = session.id === project.activeSessionId
        && Boolean(project.surface?.active)
        && (
          (project.surface?.kind === 'cli' && project.surface.tabFocus === 'cli')
          || (project.surface?.kind === 'mobile' && project.surface.tabFocus === 'mobile')
        );
      if (session.id !== project.activeSessionId || shouldReturnSurfaceFocusToSession) {
        appState.setActiveSession(project.id, session.id);
      }
    });

    // Middle-click to close
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        appState.removeSession(project.id, session.id);
      }
    });

    // Double-click to rename
    tab.addEventListener('dblclick', () => startRename(tab, project, session));

    // Right-click context menu
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showTabContextMenu(e.clientX, e.clientY, project, session, tab);
    });

    // Close button
    tab.querySelector('.tab-close')!.addEventListener('click', () => {
      appState.removeSession(project.id, session.id);
    });

    const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;
    if (reorderHandleEl) {
      reorderHandleEl.draggable = true;

      reorderHandleEl.addEventListener('dragstart', (e) => {
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', session.id);
        tab.classList.add('dragging');
      });

      tab.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        // Determine left/right half
        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        tab.classList.remove('drag-over-left', 'drag-over-right');
        if (e.clientX < midX) {
          tab.classList.add('drag-over-left');
        } else {
          tab.classList.add('drag-over-right');
        }
      });

      tab.addEventListener('dragleave', () => {
        tab.classList.remove('drag-over-left', 'drag-over-right');
      });

      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        tab.classList.remove('drag-over-left', 'drag-over-right');
        const draggedId = e.dataTransfer!.getData('text/plain');
        if (!draggedId || draggedId === session.id) return;

        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (draggedId.startsWith('__surface:')) {
          const desiredPlacement = e.clientX < midX ? 'start' : 'end';
          const currentSurface = getProjectSurface(project);
          if ((currentSurface.tabPlacement ?? 'end') !== desiredPlacement) {
            updateProjectSurface(project, {
              ...currentSurface,
              tabPlacement: desiredPlacement,
            });
          }
          return;
        }
        let targetIndex = project.sessions.findIndex(s => s.id === session.id);
        if (e.clientX >= midX) targetIndex++;

        // Adjust for the fact that removing the dragged item shifts indices
        const fromIndex = project.sessions.findIndex(s => s.id === draggedId);
        if (fromIndex < targetIndex) targetIndex--;

        appState.reorderSession(project.id, draggedId, targetIndex);
      });

      reorderHandleEl.addEventListener('dragend', () => {
        tab.classList.remove('dragging');
        // Clean up all drag indicators
        tabListEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
          el.classList.remove('drag-over-left', 'drag-over-right');
        });
      });
    }

    sessionTabNodes.push(tab);
  }

  const createSurfaceTab = (
    kind: 'cli' | 'mobile',
    options: {
      active: boolean;
      title: string;
      badgeMarkup: string;
      label: string;
      onFocus: () => void;
      onClose: () => void;
    },
  ): HTMLElement => {
    const tab = document.createElement('div');
    tab.className = 'tab-item tab-surface-item' + (options.active ? ' active' : '');
    tab.dataset.surfaceTab = kind;
    tab.title = options.title;
    const reorderHandle = project.sessions.length > 0
      ? '<span class="tab-reorder-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>'
      : '';
    tab.innerHTML = `
      ${reorderHandle}
      <span class="tab-name">
        <span class="tab-name-prefix">${options.badgeMarkup}</span>
        <span class="tab-name-label">${options.label}</span>
      </span>
      <span class="tab-close" title="Close ${options.label}">&times;</span>
    `;

    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab-close')) return;
      options.onFocus();
    });

    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        options.onClose();
      }
    });

    tab.querySelector('.tab-close')!.addEventListener('click', () => {
      options.onClose();
    });

    const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;
    if (reorderHandleEl) {
      reorderHandleEl.draggable = true;
      reorderHandleEl.addEventListener('dragstart', (e) => {
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', `__surface:${kind}`);
        tab.classList.add('dragging');
      });

      tab.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        tab.classList.remove('drag-over-left', 'drag-over-right');
        if (e.clientX < midX) {
          tab.classList.add('drag-over-left');
        } else {
          tab.classList.add('drag-over-right');
        }
      });

      tab.addEventListener('dragleave', () => {
        tab.classList.remove('drag-over-left', 'drag-over-right');
      });

      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        tab.classList.remove('drag-over-left', 'drag-over-right');
        const draggedId = e.dataTransfer!.getData('text/plain');
        if (!draggedId) return;

        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const currentSurface = getProjectSurface(project);

        if (draggedId.startsWith('__surface:')) {
          const draggedKind = draggedId.replace('__surface:', '') as 'cli' | 'mobile';
          if (draggedKind === kind) return;
          const baseOrder = Array.isArray(currentSurface.tabOrder)
            && currentSurface.tabOrder.length === 2
            && currentSurface.tabOrder.includes('cli')
            && currentSurface.tabOrder.includes('mobile')
            ? [...currentSurface.tabOrder]
            : ['cli', 'mobile'];
          const filtered = baseOrder.filter((entry) => entry !== draggedKind);
          const targetIndex = filtered.indexOf(kind);
          const insertIndex = e.clientX < midX ? targetIndex : targetIndex + 1;
          filtered.splice(Math.max(0, insertIndex), 0, draggedKind);
          updateProjectSurface(project, {
            ...currentSurface,
            tabOrder: filtered,
          });
          return;
        }

        const desiredPlacement = e.clientX < midX ? 'start' : 'end';
        if ((currentSurface.tabPlacement ?? 'end') !== desiredPlacement) {
          updateProjectSurface(project, {
            ...currentSurface,
            tabPlacement: desiredPlacement,
          });
        }
      });

      reorderHandleEl.addEventListener('dragend', () => {
        tab.classList.remove('dragging');
        tabListEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
          el.classList.remove('drag-over-left', 'drag-over-right');
        });
      });
    }

    return tab;
  };

  const surfaceTabFactories: Record<'cli' | 'mobile', () => HTMLElement | null> = {
    cli: () => {
      if (!(project.surface?.active && project.surface.kind === 'cli')) return null;
      return createSurfaceTab('cli', {
        active: cliSurfaceTabActive,
        title: buildCliSurfaceTabTitle(project),
        badgeMarkup: '<span class="tab-cli-surface-badge">CLI</span>',
        label: 'CLI Surface',
        onFocus: () => appState.focusCliSurfaceTab(project.id),
        onClose: () => appState.closeCliSurface(project.id),
      });
    },
    mobile: () => {
      if (!(project.surface?.active && project.surface.kind === 'mobile')) return null;
      return createSurfaceTab('mobile', {
        active: mobileSurfaceTabActive,
        title: 'Mobile Surface',
        badgeMarkup: '<span class="tab-browser-badge">MOB</span>',
        label: 'Mobile Surface',
        onFocus: () => appState.focusMobileSurfaceTab(project.id),
        onClose: () => appState.closeMobileSurface(project.id),
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

  syncMobileControlButton();
  renderGitStatus();
}

function renderGitStatus(): void {
  const project = appState.activeProject;
  if (!project) {
    gitStatusEl.innerHTML = '';
    gitStatusEl.dataset.state = 'hidden';
    gitStatusEl.removeAttribute('aria-busy');
    return;
  }

  const status = getGitStatus(project.id);
  if (!status) {
    gitStatusEl.innerHTML = '<span class="git-branch">\u2387 \u2026</span>';
    gitStatusEl.dataset.state = 'loading';
    gitStatusEl.setAttribute('aria-busy', 'true');
    void refreshGitStatus();
    return;
  }

  gitStatusEl.removeAttribute('aria-busy');
  if (!status.isGitRepo) {
    gitStatusEl.innerHTML = '';
    gitStatusEl.dataset.state = 'hidden';
    return;
  }

  const parts: string[] = [];

  if (status.branch) {
    parts.push(`<span class="git-branch">\u2387 ${esc(status.branch)}</span>`);
  }

  const ab: string[] = [];
  if (status.ahead > 0) ab.push(`\u2191${status.ahead}`);
  if (status.behind > 0) ab.push(`\u2193${status.behind}`);
  if (ab.length) {
    parts.push(`<span class="git-ahead-behind">${ab.join(' ')}</span>`);
  }

  if (status.staged > 0) parts.push(`<span class="git-staged">+${status.staged}</span>`);
  if (status.modified > 0) parts.push(`<span class="git-modified">~${status.modified}</span>`);
  if (status.untracked > 0) parts.push(`<span class="git-untracked">?${status.untracked}</span>`);
  if (status.conflicted > 0) parts.push(`<span class="git-conflicted">!${status.conflicted}</span>`);

  gitStatusEl.innerHTML = parts.join(' ');
  const dirtyCount = status.staged + status.modified + status.untracked + status.conflicted;
  gitStatusEl.dataset.state = dirtyCount > 0 ? 'dirty' : 'clean';
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
