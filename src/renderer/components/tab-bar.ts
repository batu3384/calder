import { appState, MAX_SESSION_NAME_LENGTH, type ProjectRecord, type SessionRecord } from '../state.js';
import type { CliSurfaceProfile, ProjectSurfaceRecord, ProviderId, ProviderUpdateSummary } from '../../shared/types.js';
import { showModal, closeModal, setModalError, FieldDef } from './modal.js';
import { createCustomSelect, type CustomSelectInstance } from './custom-select.js';
import { onChange as onStatusChange, getStatus, type SessionStatus } from '../session-activity.js';
import { onChange as onGitStatusChange, getGitStatus, getActiveGitPath, refreshGitStatus } from '../git-status.js';

import { isUnread, onChange as onUnreadChange } from '../session-unread.js';
import { showShareDialog } from './share-dialog.js';
import { showJoinDialog } from './join-dialog.js';
import { isSharing } from '../sharing/peer-host.js';
import { endShare, onShareChange } from '../sharing/share-manager.js';
import { openInspector, isInspectorOpen, getInspectedSessionId, closeInspector } from './session-inspector.js';
import {
  loadProviderAvailability,
  hasMultipleAvailableProviders,
  getProviderAvailabilitySnapshot,
  getProviderCapabilities,
  resolvePreferredProviderForLaunch,
  shouldRenderInlineProviderSelector,
} from '../provider-availability.js';
import { buildResumeWithProviderItems } from './resume-with-provider-menu.js';
import { buildProviderIconMarkup } from './tab-provider-icon.js';
import { openCliSurfaceWithSetup } from './cli-surface/setup.js';
import { showCliSurfaceQuickSetup } from './cli-surface/quick-setup.js';
import {
  createDemoCliSurfaceProfile,
  createDiscoveredCliSurfaceProfile,
  getCliSurfaceProfileLabel,
} from './cli-surface/profile.js';
import {
  cancelCliProviderUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
  runCliProviderUpdates,
  initUpdateCenter,
  type CliProviderProgressState,
  type CliUpdateCenterState,
} from '../update-center.js';

const tabListEl = document.getElementById('tab-list')!;
const gitStatusEl = document.getElementById('git-status')!;
const btnAddSession = document.getElementById('btn-add-session')!;
const btnUpdateCliTools = document.getElementById('btn-update-cli-tools') as HTMLButtonElement;
const tabActionsEl = document.getElementById('tab-actions')!;
const surfaceModeSlotEl = document.getElementById('surface-mode-slot')!;
const surfaceProfileSlotEl = document.getElementById('surface-profile-slot')!;
const sessionProviderSlotEl = document.getElementById('session-provider-slot')!;
const sessionLauncherEl = document.getElementById('session-launcher')!;

let activeContextMenu: HTMLElement | null = null;
let sessionProviderSelect: CustomSelectInstance | null = null;
let surfaceProfileSelect: CustomSelectInstance | null = null;
let sessionProviderSelectorSignature = '';
let surfaceControlsSignature = '';
const prevStatus = new Map<string, SessionStatus>();
let lastActiveTabRailKey = '';
let cliUpdatePanelEl: HTMLElement | null = null;
let cliUpdatePanelVisible = false;
let cliUpdatePanelStatusEl: HTMLElement | null = null;
let cliUpdatePanelMetaEl: HTMLElement | null = null;
let cliUpdatePanelProgressFillEl: HTMLElement | null = null;
let cliUpdatePanelProgressLabelEl: HTMLElement | null = null;
let cliUpdatePanelTimestampEl: HTMLElement | null = null;
let cliUpdatePanelListEl: HTMLElement | null = null;
let cliUpdatePanelCancelBtnEl: HTMLButtonElement | null = null;
let unsubscribeUpdateCenter: (() => void) | null = null;
type LauncherSelectKey = 'profile' | 'provider';
const launcherSelectOpenState: Record<LauncherSelectKey, boolean> = {
  profile: false,
  provider: false,
};

const CLI_UPDATE_BUTTON_GLYPHS = {
  refresh: '↻',
  warning: '⚠',
  cancelled: '✕',
  updated: '✓',
  upToDate: '•',
} as const;

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

export function initTabBar(): void {
  initUpdateCenter();
  btnAddSession.classList.add('tab-action-primary');
  btnUpdateCliTools.classList.add('tab-action-primary');
  setupCliUpdatePanel();
  unsubscribeUpdateCenter?.();
  let lastCliPhase: CliUpdateCenterState['phase'] = getUpdateCenterState().cli.phase;
  unsubscribeUpdateCenter = onUpdateCenterChange((snapshot) => {
    renderCliUpdateButton(snapshot.cli);
    renderCliUpdatePanel(snapshot.cli);
    if (snapshot.cli.phase === 'running' && lastCliPhase !== 'running' && !cliUpdatePanelVisible) {
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
    if (!cliUpdatePanelVisible) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (cliUpdatePanelEl?.contains(target)) return;
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
  renderCliUpdateButton(getUpdateCenterState().cli);
}

function destroySessionProviderSelector(): void {
  if (sessionProviderSelect) {
    sessionProviderSelect.destroy();
    sessionProviderSelect = null;
  }
  sessionProviderSelectorSignature = '';
  setSessionLauncherSelectOpen('provider', false);
  sessionProviderSlotEl.innerHTML = '';
  sessionProviderSlotEl.hidden = true;
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
    ],
    (values) => {
      const name = values['cli-profile-name']?.trim();
      const command = values['cli-profile-command']?.trim();
      const cwd = values['cli-profile-cwd']?.trim() || project.path;
      if (!name) {
        setModalError('cli-profile-name', 'Profile name is required');
        return;
      }
      if (!command) {
        setModalError('cli-profile-command', 'Command is required');
        return;
      }

      const profile: CliSurfaceProfile = {
        id: existing?.id ?? crypto.randomUUID(),
        name,
        command,
        args: parseCliSurfaceArgs(values['cli-profile-args'] ?? ''),
        cwd,
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
        onDemo: () => {
          persistAndLaunchCliSurfaceProfile(project, createDemoCliSurfaceProfile(project.path));
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
  ]).forEach(({ kind, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'surface-mode-button';
    button.dataset.surfaceKind = kind;
    button.textContent = label;
    button.classList.toggle('active', surface.kind === kind && surface.active);
    button.addEventListener('click', () => {
      if (kind === 'web') activateLiveViewSurface(project);
      else void activateCliSurface(project);
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
          strategy: 'absolute',
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
  const snapshot = getProviderAvailabilitySnapshot();
  const providerLabel = snapshot?.providers.find(provider => provider.id === providerId)?.displayName ?? providerId;
  btnAddSession.title = `New ${providerLabel} Session (Ctrl+Shift+N)`;
  btnAddSession.setAttribute('aria-label', `Create new ${providerLabel} session`);
}

function buildSessionProviderSelectorSignature(snapshot: ReturnType<typeof getProviderAvailabilitySnapshot>): string {
  if (!snapshot) return 'hidden';
  return snapshot.providers
    .map(provider => `${provider.id}:${provider.displayName}:${snapshot.availability.get(provider.id) ? '1' : '0'}`)
    .join('|');
}

function syncSessionProviderSelector(): void {
  const snapshot = getProviderAvailabilitySnapshot();
  const selectedProvider = resolvePreferredProviderForLaunch(appState.preferences.defaultProvider, snapshot);
  syncQuickSessionButtonMeta(selectedProvider);

  if (!snapshot || !shouldRenderInlineProviderSelector(snapshot)) {
    destroySessionProviderSelector();
    return;
  }

  const signature = buildSessionProviderSelectorSignature(snapshot);
  if (sessionProviderSelect && sessionProviderSelectorSignature === signature) {
    sessionProviderSelect?.setValue(selectedProvider);
    sessionProviderSlotEl.hidden = false;
    return;
  }

  destroySessionProviderSelector();

  const select = createCustomSelect(
    'command-deck-provider',
    snapshot.providers.map(provider => {
      const available = snapshot.availability.get(provider.id);
      return {
        value: provider.id,
        label: available ? provider.displayName : `${provider.displayName} (not installed)`,
        disabled: !available,
      };
    }),
    selectedProvider,
    {
      floating: {
        placement: 'bottom-end',
        offsetPx: 8,
        maxWidthPx: 280,
        maxHeightPx: 320,
        strategy: 'absolute',
      },
      align: 'end',
      onOpenChange: (open) => setSessionLauncherSelectOpen('provider', open),
    },
  );
  select.element.classList.add('command-deck-provider-select');

  const hiddenInput = select.element.querySelector('#command-deck-provider') as HTMLInputElement | null;
  hiddenInput?.addEventListener('change', () => {
    const providerId = hiddenInput.value as ProviderId;
    syncQuickSessionButtonMeta(providerId);
    appState.setPreference('defaultProvider', providerId);
  });

  sessionProviderSlotEl.hidden = false;
  sessionProviderSlotEl.appendChild(select.element);
  sessionProviderSelect = select;
  sessionProviderSelectorSignature = signature;
}

function summarizeCliUpdateStatuses(summary: ProviderUpdateSummary): {
  updated: number;
  upToDate: number;
  skipped: number;
  cancelled: number;
  error: number;
} {
  let updated = 0;
  let upToDate = 0;
  let skipped = 0;
  let cancelled = 0;
  let error = 0;
  for (const result of summary.results) {
    if (result.status === 'updated') updated += 1;
    else if (result.status === 'up_to_date') upToDate += 1;
    else if (result.status === 'skipped') skipped += 1;
    else if (result.status === 'cancelled') cancelled += 1;
    else error += 1;
  }
  return { updated, upToDate, skipped, cancelled, error };
}

function formatRelativeTimestamp(timestamp?: string): string {
  if (!timestamp) return 'No updates yet';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'No updates yet';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'just now';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getCliProviderStatusLabel(status: CliProviderProgressState['status']): string {
  if (status === 'up_to_date') return 'up to date';
  if (status === 'cancelled') return 'cancelled';
  return status.replace(/_/g, ' ');
}

function setupCliUpdatePanel(): void {
  if (cliUpdatePanelEl) return;
  const panel = document.createElement('section');
  panel.id = 'cli-update-panel';
  panel.className = 'cli-update-panel hidden';
  panel.innerHTML = `
    <div class="cli-update-panel-header">
      <div class="cli-update-panel-title">CLI Update Center</div>
      <div class="cli-update-panel-header-actions">
        <button type="button" class="cli-update-panel-cancel hidden" aria-label="Cancel CLI update">Cancel</button>
        <button type="button" class="cli-update-panel-close" aria-label="Close update panel">&times;</button>
      </div>
    </div>
    <div class="cli-update-panel-status">No update run yet.</div>
    <div class="cli-update-panel-progress-track">
      <div class="cli-update-panel-progress-fill" style="width: 0%"></div>
    </div>
    <div class="cli-update-panel-stats">
      <span class="cli-update-panel-progress-label">Progress: 0/0 (0%)</span>
      <span class="cli-update-panel-timestamp">Last run: No updates yet</span>
    </div>
    <div class="cli-update-panel-meta">Press the update button to start a provider refresh.</div>
    <div class="cli-update-panel-list"></div>
  `;
  panel.addEventListener('click', (event) => event.stopPropagation());

  const closeBtn = panel.querySelector('.cli-update-panel-close') as HTMLButtonElement | null;
  const cancelBtn = panel.querySelector('.cli-update-panel-cancel') as HTMLButtonElement | null;
  closeBtn?.addEventListener('click', () => toggleCliUpdatePanel(false));
  cancelBtn?.addEventListener('click', () => {
    if (cancelBtn.disabled) return;
    void cancelCliProviderUpdates().catch((error) => {
      console.error('[tab-bar] Failed to cancel CLI update', error);
    });
  });

  cliUpdatePanelStatusEl = panel.querySelector('.cli-update-panel-status');
  cliUpdatePanelMetaEl = panel.querySelector('.cli-update-panel-meta');
  cliUpdatePanelProgressFillEl = panel.querySelector('.cli-update-panel-progress-fill');
  cliUpdatePanelProgressLabelEl = panel.querySelector('.cli-update-panel-progress-label');
  cliUpdatePanelTimestampEl = panel.querySelector('.cli-update-panel-timestamp');
  cliUpdatePanelListEl = panel.querySelector('.cli-update-panel-list');
  cliUpdatePanelCancelBtnEl = cancelBtn;
  if (cliUpdatePanelStatusEl) {
    cliUpdatePanelStatusEl.setAttribute('role', 'status');
    cliUpdatePanelStatusEl.setAttribute('aria-live', 'polite');
  }
  if (cliUpdatePanelMetaEl) {
    cliUpdatePanelMetaEl.setAttribute('aria-live', 'polite');
  }
  panel.setAttribute('aria-busy', 'false');

  tabActionsEl.appendChild(panel);
  cliUpdatePanelEl = panel;
}

function toggleCliUpdatePanel(visible: boolean): void {
  if (!cliUpdatePanelEl) return;
  cliUpdatePanelVisible = visible;
  cliUpdatePanelEl.classList.toggle('hidden', !visible);
  btnUpdateCliTools.setAttribute('aria-expanded', visible ? 'true' : 'false');
}

function renderCliUpdateButton(cliState: CliUpdateCenterState): void {
  btnUpdateCliTools.classList.remove('is-warning', 'is-success', 'is-cancelled', 'is-idle');

  if (cliState.phase === 'running') {
    btnUpdateCliTools.classList.add('is-updating');
    btnUpdateCliTools.disabled = false;
    btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
    const progressLabel = cliState.totalProviders > 0
      ? `${cliState.completedProviders}/${cliState.totalProviders}`
      : 'running';
    btnUpdateCliTools.title = `Updating CLI tools... (${progressLabel})`;
    btnUpdateCliTools.setAttribute('aria-label', 'Updating CLI tools');
    return;
  }

  btnUpdateCliTools.classList.remove('is-updating');
  btnUpdateCliTools.disabled = false;

  if (cliState.phase === 'error') {
    btnUpdateCliTools.classList.add('is-warning');
    btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
    btnUpdateCliTools.title = 'CLI update failed.';
    btnUpdateCliTools.setAttribute('aria-label', 'CLI update failed');
    return;
  }

  if (cliState.phase === 'cancelled') {
    btnUpdateCliTools.classList.add('is-cancelled');
    btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.cancelled;
    btnUpdateCliTools.title = 'CLI update cancelled.';
    btnUpdateCliTools.setAttribute('aria-label', 'CLI update cancelled');
    return;
  }

  if (cliState.phase === 'completed' && cliState.lastSummary) {
    const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
    if (counters.error > 0) {
      btnUpdateCliTools.classList.add('is-warning');
      btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.warning;
      btnUpdateCliTools.title = 'CLI update completed with errors';
      btnUpdateCliTools.setAttribute('aria-label', 'CLI update completed with errors');
    } else if (counters.updated > 0) {
      btnUpdateCliTools.classList.add('is-success');
      btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.updated;
      btnUpdateCliTools.title = 'CLI tools updated';
      btnUpdateCliTools.setAttribute('aria-label', 'CLI tools updated');
    } else {
      btnUpdateCliTools.classList.add('is-idle');
      btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.upToDate;
      btnUpdateCliTools.title = 'CLI tools are already up to date.';
      btnUpdateCliTools.setAttribute('aria-label', 'CLI tools are already up to date');
    }
    return;
  }

  btnUpdateCliTools.classList.add('is-idle');
  btnUpdateCliTools.textContent = CLI_UPDATE_BUTTON_GLYPHS.refresh;
  btnUpdateCliTools.title = 'Update CLI Tools';
  btnUpdateCliTools.setAttribute('aria-label', 'Update CLI tools');
}

function renderCliUpdatePanel(cliState: CliUpdateCenterState): void {
  if (
    !cliUpdatePanelStatusEl
    || !cliUpdatePanelMetaEl
    || !cliUpdatePanelProgressFillEl
    || !cliUpdatePanelListEl
    || !cliUpdatePanelProgressLabelEl
    || !cliUpdatePanelTimestampEl
  ) return;
  if (cliUpdatePanelEl) {
    cliUpdatePanelEl.setAttribute('aria-busy', cliState.phase === 'running' ? 'true' : 'false');
  }

  if (cliUpdatePanelCancelBtnEl) {
    const running = cliState.phase === 'running';
    cliUpdatePanelCancelBtnEl.classList.toggle('hidden', !running);
    cliUpdatePanelCancelBtnEl.disabled = !running || cliState.cancelRequested;
    cliUpdatePanelCancelBtnEl.textContent = cliState.cancelRequested ? 'Cancelling...' : 'Cancel';
  }

  const total = cliState.totalProviders > 0 ? cliState.totalProviders : Math.max(cliState.providers.length, 0);
  const completed = Math.min(cliState.completedProviders, total || cliState.completedProviders);
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const progressLabel = total > 0 ? `${completed}/${total}` : '0/0';
  cliUpdatePanelProgressLabelEl.textContent = `Progress: ${progressLabel} (${progressPercent}%)`;

  if (cliState.phase === 'running') {
    cliUpdatePanelTimestampEl.textContent = cliState.startedAt
      ? `Started: ${formatRelativeTimestamp(cliState.startedAt)}`
      : 'Started: just now';
  } else {
    const reference = cliState.finishedAt ?? cliState.startedAt;
    cliUpdatePanelTimestampEl.textContent = reference
      ? `Last run: ${formatRelativeTimestamp(reference)}`
      : 'Last run: No updates yet';
  }

  if (cliState.phase === 'running') {
    const activeProvider = cliState.providers.find((provider) => provider.providerId === cliState.activeProviderId);
    const activeLabel = cliState.cancelRequested
      ? 'Cancellation requested. Waiting for the active command to stop...'
      : activeProvider
        ? `${activeProvider.providerName} in progress.`
        : 'Waiting for provider progress...';
    cliUpdatePanelStatusEl.textContent = total > 0
      ? `${cliState.cancelRequested ? 'Cancelling CLI update' : 'Updating CLI tools'} (${completed}/${total})`
      : 'Updating CLI tools...';
    cliUpdatePanelMetaEl.textContent = activeLabel;
  } else if (cliState.phase === 'cancelled') {
    const processedLabel = total > 0
      ? `${completed}/${total} providers finished before cancellation.`
      : `${completed} provider${completed === 1 ? '' : 's'} finished before cancellation.`;
    cliUpdatePanelStatusEl.textContent = 'CLI update cancelled.';
    cliUpdatePanelMetaEl.textContent = `Cancelled ${formatRelativeTimestamp(cliState.finishedAt)}. ${processedLabel}`;
  } else if (cliState.phase === 'completed' && cliState.lastSummary) {
    const counters = summarizeCliUpdateStatuses(cliState.lastSummary);
    if (counters.error > 0) {
      cliUpdatePanelStatusEl.textContent = `Completed with ${counters.error} issue${counters.error === 1 ? '' : 's'}.`;
    } else if (counters.updated > 0) {
      cliUpdatePanelStatusEl.textContent = `${counters.updated} provider${counters.updated === 1 ? '' : 's'} updated.`;
    } else {
      cliUpdatePanelStatusEl.textContent = 'All providers are already up to date.';
    }
    const summaryParts = [
      `Updated ${counters.updated}`,
      `Up to date ${counters.upToDate}`,
      `Skipped ${counters.skipped}`,
      `Cancelled ${counters.cancelled}`,
    ];
    if (counters.error > 0) summaryParts.push(`Errors ${counters.error}`);
    cliUpdatePanelMetaEl.textContent = `Finished ${formatRelativeTimestamp(cliState.finishedAt)}. ${summaryParts.join(' · ')}`;
  } else if (cliState.phase === 'error') {
    cliUpdatePanelStatusEl.textContent = 'CLI update failed.';
    cliUpdatePanelMetaEl.textContent = cliState.errorMessage ?? 'An unknown error occurred.';
  } else {
    cliUpdatePanelStatusEl.textContent = 'No update run yet.';
    cliUpdatePanelMetaEl.textContent = 'Press the update button to start a provider refresh.';
  }

  cliUpdatePanelProgressFillEl.style.width = `${Math.max(progressPercent, cliState.phase === 'running' ? 8 : 0)}%`;
  cliUpdatePanelProgressFillEl.classList.toggle('is-running', cliState.phase === 'running');

  cliUpdatePanelListEl.innerHTML = '';
  const providers = cliState.providers;
  if (providers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cli-update-panel-empty';
    empty.textContent = 'Provider status will appear here as checks complete.';
    cliUpdatePanelListEl.appendChild(empty);
    return;
  }

  for (const provider of providers) {
    const row = document.createElement('div');
    row.className = 'cli-update-provider-row';

    const top = document.createElement('div');
    top.className = 'cli-update-provider-head';

    const name = document.createElement('div');
    name.className = 'cli-update-provider-name';
    name.textContent = provider.providerName;

    const status = document.createElement('div');
    status.className = `cli-update-provider-status ${provider.status}`;
    status.textContent = getCliProviderStatusLabel(provider.status);

    top.appendChild(name);
    top.appendChild(status);

    const detail = document.createElement('div');
    detail.className = 'cli-update-provider-detail';
    const versionParts = [provider.beforeVersion, provider.afterVersion].filter(Boolean);
    if (versionParts.length === 2) {
      detail.textContent = `${versionParts[0]} → ${versionParts[1]}`;
    } else if (provider.latestVersion) {
      detail.textContent = `Latest: ${provider.latestVersion}`;
    } else if (provider.message) {
      detail.textContent = provider.message;
    } else {
      detail.textContent = provider.status === 'running' ? 'Running...' : 'Waiting...';
    }

    row.appendChild(top);
    row.appendChild(detail);
    cliUpdatePanelListEl.appendChild(row);
  }
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
  shareItem.className = 'tab-context-menu-item' + (!isCliSession || currentlySharing ? ' disabled' : '');
  shareItem.textContent = 'Share Session\u2026';
  if (isCliSession && !currentlySharing) {
    shareItem.addEventListener('click', (e) => {
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
    if (!currentlySharing) menu.appendChild(shareItem);
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
  if (!project) return;
  const cliSurfaceTabActive = project.surface?.active && project.surface.kind === 'cli' && project.surface.tabFocus === 'cli';

  for (const session of project.sessions) {
    const tab = document.createElement('div');
    const isActive = !cliSurfaceTabActive && session.id === project.activeSessionId;
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
      if (session.id !== project.activeSessionId) {
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

    tabListEl.appendChild(tab);
  }

  if (project.surface?.active && project.surface.kind === 'cli') {
    const tab = document.createElement('div');
    tab.className = 'tab-item tab-surface-item' + (cliSurfaceTabActive ? ' active' : '');
    tab.dataset.surfaceTab = 'cli';
    tab.title = buildCliSurfaceTabTitle(project);
    tab.innerHTML = `
      <span class="tab-name">
        <span class="tab-name-prefix"><span class="tab-cli-surface-badge">CLI</span></span>
        <span class="tab-name-label">CLI Surface</span>
      </span>
      <span class="tab-close" title="Close CLI surface">&times;</span>
    `;

    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('tab-close')) return;
      appState.focusCliSurfaceTab(project.id);
    });

    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        appState.closeCliSurface(project.id);
      }
    });

    tab.querySelector('.tab-close')!.addEventListener('click', () => {
      appState.closeCliSurface(project.id);
    });

    tabListEl.appendChild(tab);
  }

  ensureActiveTabVisible([
    appState.activeProjectId,
    project.activeSessionId,
    project.sessions.length,
    project.surface?.kind ?? 'none',
    project.surface?.active ? 'surface-open' : 'surface-closed',
    project.surface?.tabFocus ?? 'session',
  ].join(':'));
}

function renderGitStatus(): void {
  const project = appState.activeProject;
  if (!project) {
    gitStatusEl.innerHTML = '';
    return;
  }

  const status = getGitStatus(project.id);
  if (!status || !status.isGitRepo) {
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

async function showBranchContextMenu(e: MouseEvent): Promise<void> {
  e.stopPropagation();
  hideTabContextMenu();

  const project = appState.activeProject;
  if (!project) return;

  const status = getGitStatus(project.id);
  if (!status || !status.isGitRepo) return;

  const gitPath = getActiveGitPath(project.id);

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Branch actions');

  // Position below the git status element
  const elRect = gitStatusEl.getBoundingClientRect();
  menu.style.left = `${elRect.left}px`;
  menu.style.top = `${elRect.bottom + 4}px`;

  // Show loading
  const loadingItem = document.createElement('div');
  loadingItem.className = 'tab-context-menu-item disabled';
  loadingItem.textContent = 'Loading branches\u2026';
  menu.appendChild(loadingItem);

  document.body.appendChild(menu);
  activeContextMenu = menu;

  try {
    const branches = await window.calder.git.listBranches(gitPath);

    // Menu was dismissed during loading
    if (activeContextMenu !== menu) return;

    menu.innerHTML = '';
    menu.addEventListener('click', (ev) => ev.stopPropagation());

    const searchInput = document.createElement('input');
    searchInput.className = 'branch-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = 'Filter branches\u2026';
    searchInput.setAttribute('aria-label', 'Filter branches');
    menu.appendChild(searchInput);

    const container = document.createElement('div');
    container.className = 'branch-list-container';
    menu.appendChild(container);

    let filteredBranches = branches;
    let activeIndex = 0;
    let itemElements: HTMLElement[] = [];

    function renderBranchItems(query: string): void {
      const lowerQuery = query.toLowerCase();
      filteredBranches = lowerQuery
        ? branches.filter(b => b.name.toLowerCase().includes(lowerQuery))
        : branches;
      activeIndex = 0;
      itemElements = [];
      container.innerHTML = '';

      if (filteredBranches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tab-context-menu-item disabled';
        empty.textContent = 'No matching branches';
        empty.setAttribute('role', 'menuitem');
        empty.setAttribute('aria-disabled', 'true');
        empty.tabIndex = -1;
        container.appendChild(empty);
        return;
      }

      for (let i = 0; i < filteredBranches.length; i++) {
        const branch = filteredBranches[i];
        const item = document.createElement('div');
        item.className = 'tab-context-menu-item'
          + (branch.current ? ' active' : '')
          + (i === activeIndex ? ' keyboard-active' : '');
        item.textContent = (branch.current ? '\u2713 ' : '  ') + branch.name;
        item.setAttribute('role', 'menuitem');
        item.setAttribute('aria-disabled', branch.current ? 'true' : 'false');
        item.tabIndex = -1;

        item.addEventListener('mouseenter', () => {
          activeIndex = i;
          setActiveHighlight();
        });

        if (!branch.current) {
          item.addEventListener('click', () => {
            hideTabContextMenu();
            switchBranch(gitPath, branch.name);
          });
        }
        itemElements.push(item);
        container.appendChild(item);
      }
    }

    function setActiveHighlight(): void {
      itemElements.forEach((el, i) => {
        el.classList.toggle('keyboard-active', i === activeIndex);
      });
    }

    function setActiveAndScroll(): void {
      setActiveHighlight();
      itemElements[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }

    searchInput.addEventListener('input', () => renderBranchItems(searchInput.value));

    searchInput.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      switch (ev.key) {
        case 'ArrowDown':
          ev.preventDefault();
          if (filteredBranches.length > 0) {
            activeIndex = (activeIndex + 1) % filteredBranches.length;
            setActiveAndScroll();
          }
          break;
        case 'ArrowUp':
          ev.preventDefault();
          if (filteredBranches.length > 0) {
            activeIndex = (activeIndex - 1 + filteredBranches.length) % filteredBranches.length;
            setActiveAndScroll();
          }
          break;
        case 'Enter':
          ev.preventDefault();
          if (activeIndex < filteredBranches.length) {
            const selected = filteredBranches[activeIndex];
            if (!selected.current) {
              hideTabContextMenu();
              switchBranch(gitPath, selected.name);
            }
          }
          break;
        case 'Escape':
          ev.preventDefault();
          hideTabContextMenu();
          break;
      }
    });

    renderBranchItems('');

    // Separator + Create New Branch
    const separator = document.createElement('div');
    separator.className = 'tab-context-menu-separator';
    menu.appendChild(separator);

    const createItem = document.createElement('div');
    createItem.className = 'tab-context-menu-item';
    createItem.textContent = 'Create New Branch\u2026';
    createItem.addEventListener('click', () => {
      hideTabContextMenu();
      promptCreateBranch(gitPath);
    });
    menu.appendChild(createItem);

    // Adjust if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

    applyContextMenuSemantics(menu, 'Branch actions', false);
    searchInput.focus();
  } catch {
    if (activeContextMenu !== menu) return;
    menu.innerHTML = '';
    const errItem = document.createElement('div');
    errItem.className = 'tab-context-menu-item disabled';
    errItem.textContent = 'Failed to load branches';
    menu.appendChild(errItem);
    applyContextMenuSemantics(menu, 'Branch actions', false);
  }
}

async function switchBranch(gitPath: string, branchName: string): Promise<void> {
  const project = appState.activeProject;
  const freshStatus = project ? getGitStatus(project.id) : null;
  const dirty = freshStatus ? freshStatus.staged + freshStatus.modified + freshStatus.conflicted : 0;
  if (dirty > 0) {
    const confirmed = confirm(`You have uncommitted changes. Switch to "${branchName}" anyway?`);
    if (!confirmed) return;
  }

  try {
    await window.calder.git.checkoutBranch(gitPath, branchName);
    refreshGitStatus();
  } catch (err) {
    alert(`Failed to switch branch: ${err instanceof Error ? err.message : err}`);
  }
}

function promptCreateBranch(gitPath: string): void {
  showModal('Create New Branch', [
    { label: 'Branch name', id: 'branch-name', placeholder: 'feature/my-branch' },
  ], async (values) => {
    const name = values['branch-name']?.trim();
    if (!name) {
      setModalError('branch-name', 'Branch name is required');
      return;
    }
    if (/\s/.test(name)) {
      setModalError('branch-name', 'Branch name cannot contain spaces');
      return;
    }
    try {
      await window.calder.git.createBranch(gitPath, name);
      closeModal();
      refreshGitStatus();
    } catch (err) {
      setModalError('branch-name', err instanceof Error ? err.message : 'Failed to create branch');
    }
  });
}

export function quickNewSession(): void {
  const project = appState.activeProject;
  if (!project) return;
  (document.activeElement as HTMLElement)?.blur?.();
  const sessionNum = project.sessions.length + 1;
  const providerId = resolvePreferredProviderForLaunch(
    appState.preferences.defaultProvider,
    getProviderAvailabilitySnapshot(),
  );
  appState.addSession(project.id, `Session ${sessionNum}`, undefined, providerId);
}

function showAddSessionContextMenu(x: number, y: number): void {
  hideTabContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());

  const quickItem = document.createElement('div');
  quickItem.className = 'tab-context-menu-item';
  quickItem.textContent = 'New Session';
  quickItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    quickNewSession();
  });

  const customItem = document.createElement('div');
  customItem.className = 'tab-context-menu-item';
  customItem.textContent = 'New Custom Session\u2026';
  customItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    promptNewSession();
  });

  const joinSeparator = document.createElement('div');
  joinSeparator.className = 'tab-context-menu-separator';

  const joinItem = document.createElement('div');
  joinItem.className = 'tab-context-menu-item';
  joinItem.textContent = 'Join Remote Session\u2026';
  joinItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    showJoinDialog();
  });

  const browserItem = document.createElement('div');
  browserItem.className = 'tab-context-menu-item';
  browserItem.textContent = 'New Browser Tab';
  browserItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTabContextMenu();
    const project = appState.activeProject;
    if (project) appState.addBrowserTabSession(project.id);
  });

  menu.appendChild(quickItem);
  menu.appendChild(customItem);
  menu.appendChild(browserItem);
  menu.appendChild(joinSeparator);
  menu.appendChild(joinItem);
  document.body.appendChild(menu);
  activeContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  applyContextMenuSemantics(menu, 'New session actions');
}

export async function promptNewSession(onCreated?: (session: SessionRecord) => void): Promise<void> {
  const project = appState.activeProject;
  if (!project) return;

  const sessionNum = project.sessions.length + 1;

  let providerSnapshot = getProviderAvailabilitySnapshot();
  if (!providerSnapshot) {
    await loadProviderAvailability();
    providerSnapshot = getProviderAvailabilitySnapshot();
  }
  const providers = providerSnapshot?.providers ?? [];
  const availabilityMap = providerSnapshot?.availability ?? new Map();

  const fields: FieldDef[] = [
    { label: 'Name', id: 'session-name', placeholder: `Session ${sessionNum}`, defaultValue: `Session ${sessionNum}` },
    { label: 'Arguments', id: 'session-args', placeholder: 'e.g. --model sonnet', defaultValue: project.defaultArgs ?? '' },
    {
      label: 'Keep args for future sessions',
      id: 'keep-args',
      type: 'checkbox',
      defaultValue: project.defaultArgs ? 'true' : undefined,
    },
  ];

  if (providers.length > 1) {
    const preferred = resolvePreferredProviderForLaunch(appState.preferences.defaultProvider, providerSnapshot);
    fields.unshift({
      label: 'Provider',
      id: 'provider',
      type: 'select',
      defaultValue: preferred,
      options: providers.map(p => {
        const available = availabilityMap.get(p.id);
        return { value: p.id, label: available ? p.displayName : `${p.displayName} (not installed)`, disabled: !available };
      }),
    });
  }

  showModal('New Session', fields, (values) => {
    const name = values['session-name']?.trim();
    if (name) {
      closeModal();
      const args = values['session-args']?.trim() || undefined;
      const keepArgs = values['keep-args'] === 'true';
      project.defaultArgs = keepArgs ? (args || undefined) : undefined;
      const providerId = (values['provider'] || 'claude') as ProviderId;
      const session = appState.addSession(project.id, name, args, providerId);
      if (session && onCreated) onCreated(session);
    }
  });
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}
