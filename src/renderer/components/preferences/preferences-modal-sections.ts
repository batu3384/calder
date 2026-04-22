import {
  checkForAppUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
} from '../../update-center.js';
import { appState } from '../../state.js';
import { createCustomSelect, type CustomSelectInstance } from '../custom-select.js';
import { loadProviderAvailability, getProviderAvailabilitySnapshot } from '../../provider-availability.js';
import { renderProjectBackgroundTaskSection } from './preferences-background-task-discovery.js';
import { renderProjectCheckpointSection } from './preferences-checkpoint-discovery.js';
import { renderProjectContextSection } from './preferences-context-discovery.js';
import { renderProjectGovernanceSection } from './preferences-governance-discovery.js';
import { renderOrchestrationOverviewSection } from './preferences-orchestration-overview.js';
import { renderProjectPreviewCenterSection } from './preferences-preview-discovery.js';
import {
  renderMobileSetupSection,
  renderSetupSection,
} from './preferences-provider-setup.js';
import { renderProjectReviewSection } from './preferences-review-discovery.js';
import { renderProjectTeamContextSection } from './preferences-team-context-discovery.js';
import { renderProjectWorkflowSection } from './preferences-workflow-discovery.js';
import type { MobileDependencyId } from '../../../shared/types/mobile.js';
import type { CliProviderMeta, ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import type { ProjectCheckpointDocument } from '../../../shared/types/project.js';

type AppendSectionIntro = (
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
) => void;

type AppendOverviewGrid = (
  container: HTMLElement,
  items: Array<{ label: string; value: string; note?: string }>,
) => void;

type AppendSectionCard = (container: HTMLElement, title: string, description?: string) => HTMLElement;
type AppendSectionGroup = (
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
) => HTMLElement;

interface LayoutSidebarViews {
  configSections: boolean;
  gitPanel: boolean;
  sessionHistory: boolean;
  costFooter: boolean;
}

interface LayoutDraft {
  sidebarViews: LayoutSidebarViews;
}

interface AboutDraft {
  debugMode: boolean;
}

interface GeneralDraft {
  soundOnSessionWaiting: boolean;
  notificationsDesktop: boolean;
  sessionHistoryEnabled: boolean;
  insightsEnabled: boolean;
  autoTitleEnabled: boolean;
  defaultProvider: ProviderId;
  language: UiLanguage;
}

interface RenderLayoutSectionArgs {
  content: HTMLElement;
  preferenceDraft: LayoutDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  appendSectionCard: AppendSectionCard;
}

interface RenderAboutSectionArgs {
  content: HTMLElement;
  preferenceDraft: AboutDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  formatRelativeTimestamp: (timestamp?: string) => string;
}

interface RenderGeneralSectionArgs {
  content: HTMLElement;
  preferenceDraft: GeneralDraft;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  isGeneralSectionActive: () => boolean;
  getDefaultProviderSelect: () => CustomSelectInstance | null;
  replaceDefaultProviderSelect: (select: CustomSelectInstance) => void;
  replaceLanguageSelect: (select: CustomSelectInstance) => void;
}

interface RenderProvidersSectionArgs {
  content: HTMLElement;
  appendSectionIntro: AppendSectionIntro;
  appendOverviewGrid: AppendOverviewGrid;
  appendSectionGroup: AppendSectionGroup;
  appendSectionCard: AppendSectionCard;
  closeWideModal: () => void;
  rerenderProviders: () => void;
  modalBody: HTMLElement;
  confirmButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  registerModalCleanup: (cleanup: () => void) => void;
  buildCheckpointRestoreConfirm: (
    projectId: string,
    projectPath: string,
    checkpointDocument: ProjectCheckpointDocument,
    restoreSummaryText: string,
  ) => HTMLElement;
  isProvidersSectionActive: () => boolean;
  onApplySetupBadge: (hasIssue: boolean) => void;
  onFixProvider: (providerId?: ProviderId) => Promise<void>;
  onInstallMobileDependency: (dependencyId: MobileDependencyId) => Promise<void>;
}

interface ProviderAvailabilitySnapshot {
  providers: CliProviderMeta[];
  availability: Map<ProviderId, boolean>;
}

function buildProviderOptions(snapshot: ProviderAvailabilitySnapshot): Array<{
  value: ProviderId;
  label: string;
  disabled: boolean;
}> {
  return snapshot.providers.map(provider => {
    const available = snapshot.availability.get(provider.id) ?? true;
    return {
      value: provider.id,
      label: available ? provider.displayName : `${provider.displayName} (not installed)`,
      disabled: !available,
    };
  });
}

function buildProviderNote(snapshot: ProviderAvailabilitySnapshot | null, providerId: ProviderId): string {
  if (!snapshot) return 'Calder falls back to the next installed tool if this one is missing.';
  if (snapshot.availability.get(providerId)) {
    return 'New sessions use this tool unless a workflow picks a different one.';
  }
  return 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.';
}

function appendGeneralToggleField(
  container: HTMLElement,
  id: string,
  labelText: string,
  checked: boolean,
  onChange: (checkedState: boolean) => void,
): void {
  const row = document.createElement('div');
  row.className = 'modal-toggle-field';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  row.appendChild(label);
  row.appendChild(checkbox);
  container.appendChild(row);
}

export function renderGeneralPreferencesSection({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  isGeneralSectionActive,
  getDefaultProviderSelect,
  replaceDefaultProviderSelect,
  replaceLanguageSelect,
}: RenderGeneralSectionArgs): void {
  appendSectionIntro(
    content,
    'Session',
    'Launch defaults',
    'Choose how Calder opens new work, how it names sessions, and which signals stay on while you code.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Language',
      value: preferenceDraft.language === 'tr' ? 'Turkish' : 'English',
      note: 'Applies to the full Calder interface.',
    },
    {
      label: 'Default tool',
      value: preferenceDraft.defaultProvider,
      note: 'Used when a new session has no explicit provider.',
    },
    {
      label: 'History',
      value: preferenceDraft.sessionHistoryEnabled ? 'On' : 'Off',
      note: 'Closed sessions can stay searchable in the run log.',
    },
    {
      label: 'Alerts',
      value: preferenceDraft.notificationsDesktop ? 'Desktop' : 'In-app only',
      note: 'Sound and notification behavior stays local to this workspace.',
    },
  ]);

  const providerRow = document.createElement('div');
  providerRow.className = 'modal-toggle-field';

  const providerLabel = document.createElement('label');
  providerLabel.textContent = 'Default coding tool';

  const currentDefault = preferenceDraft.defaultProvider;

  let snapshot = getProviderAvailabilitySnapshot();
  if (snapshot) {
    const defaultSelect = createCustomSelect('pref-default-provider', buildProviderOptions(snapshot), currentDefault);
    replaceDefaultProviderSelect(defaultSelect);
    preferenceDraft.defaultProvider = defaultSelect.getValue() as ProviderId;
  } else {
    const loadingSelect = createCustomSelect('pref-default-provider', [{ value: currentDefault, label: 'Loading…' }], currentDefault);
    replaceDefaultProviderSelect(loadingSelect);
    loadProviderAvailability().then(() => {
      if (!isGeneralSectionActive()) return;
      snapshot = getProviderAvailabilitySnapshot();
      if (!snapshot) return;

      const refreshedSelect = createCustomSelect(
        'pref-default-provider',
        buildProviderOptions(snapshot),
        preferenceDraft.defaultProvider,
      );
      replaceDefaultProviderSelect(refreshedSelect);
      providerRow.querySelector('.custom-select')?.remove();
      providerRow.appendChild(refreshedSelect.element);
      preferenceDraft.defaultProvider = refreshedSelect.getValue() as ProviderId;
      providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
      refreshedSelect.element.addEventListener('change', () => {
        const select = getDefaultProviderSelect();
        if (!select) return;
        preferenceDraft.defaultProvider = select.getValue() as ProviderId;
        providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
      });
    });
  }

  const providerNote = document.createElement('div');
  providerNote.className = 'preferences-control-note';
  providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);

  const providerSelect = getDefaultProviderSelect();
  if (providerSelect) {
    providerSelect.element.addEventListener('change', () => {
      const select = getDefaultProviderSelect();
      if (!select) return;
      preferenceDraft.defaultProvider = select.getValue() as ProviderId;
      providerNote.textContent = buildProviderNote(snapshot, preferenceDraft.defaultProvider);
    });
    providerRow.appendChild(providerLabel);
    providerRow.appendChild(providerSelect.element);
    content.appendChild(providerRow);
    content.appendChild(providerNote);
  }

  const languageRow = document.createElement('div');
  languageRow.className = 'modal-toggle-field';

  const languageLabel = document.createElement('label');
  languageLabel.textContent = 'Interface language';

  const languageSelect = createCustomSelect(
    'pref-language',
    [
      { value: 'en', label: 'English' },
      { value: 'tr', label: 'Turkish' },
    ],
    preferenceDraft.language,
  );
  replaceLanguageSelect(languageSelect);

  const languageNote = document.createElement('div');
  languageNote.className = 'preferences-control-note';
  languageNote.textContent = 'Language changes apply after the interface refreshes.';

  languageRow.appendChild(languageLabel);
  languageRow.appendChild(languageSelect.element);
  content.appendChild(languageRow);
  content.appendChild(languageNote);
  languageSelect.element.addEventListener('change', () => {
    preferenceDraft.language = languageSelect.getValue() as UiLanguage;
  });

  appendGeneralToggleField(
    content,
    'pref-sound-on-waiting',
    'Play sound when session finishes work',
    preferenceDraft.soundOnSessionWaiting,
    (checked) => {
      preferenceDraft.soundOnSessionWaiting = checked;
    },
  );
  appendGeneralToggleField(
    content,
    'pref-notifications-desktop',
    'Desktop notifications when sessions need attention',
    preferenceDraft.notificationsDesktop,
    (checked) => {
      preferenceDraft.notificationsDesktop = checked;
    },
  );
  appendGeneralToggleField(
    content,
    'pref-session-history',
    'Record session history when sessions close',
    preferenceDraft.sessionHistoryEnabled,
    (checked) => {
      preferenceDraft.sessionHistoryEnabled = checked;
    },
  );
  appendGeneralToggleField(
    content,
    'pref-insights-enabled',
    'Show insight alerts',
    preferenceDraft.insightsEnabled,
    (checked) => {
      preferenceDraft.insightsEnabled = checked;
    },
  );
  appendGeneralToggleField(
    content,
    'pref-auto-title',
    'Auto-name sessions from conversation title',
    preferenceDraft.autoTitleEnabled,
    (checked) => {
      preferenceDraft.autoTitleEnabled = checked;
    },
  );
}

export function renderLayoutPreferencesSection({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionCard,
}: RenderLayoutSectionArgs): void {
  appendSectionIntro(
    content,
    'Workspace',
    'Stage layout',
    'Keep the left surface stable while deciding which support modules stay visible around active sessions.',
  );

  const views = preferenceDraft.sidebarViews;
  appendOverviewGrid(content, [
    {
      label: 'Ops rail',
      value: `${Object.values(views).filter(Boolean).length - (views.costFooter ? 1 : 0)} modules`,
      note: 'The right-side support column stays focused when you trim unused tools.',
    },
    {
      label: 'Surface split',
      value: 'Pinned left',
      note: 'Browser and CLI surfaces keep the project visible while sessions change on the right.',
    },
    {
      label: 'Session strip',
      value: views.costFooter ? 'Cost chip visible' : 'Cost chip hidden',
      note: 'Session chrome stays compact until you need more context.',
    },
  ]);

  const toggles: Array<{ key: keyof LayoutSidebarViews; label: string; group: 'ops' | 'session' }> = [
    { key: 'configSections', label: 'Toolkit', group: 'ops' },
    { key: 'gitPanel', label: 'Git', group: 'ops' },
    { key: 'sessionHistory', label: 'Run log', group: 'ops' },
    { key: 'costFooter', label: 'Spend chip', group: 'session' },
  ];

  const opsCard = appendSectionCard(
    content,
    'Ops Rail modules',
    'Choose which support modules stay visible in the right-side operations rail.',
  );
  const liveViewCard = appendSectionCard(
    content,
    'Live View behavior',
    'Live View stays anchored on the left when a browser session is open so page context never disappears.',
  );
  const sessionDeckCard = appendSectionCard(
    content,
    'Session Deck defaults',
    'Tune the shared AI work area and the strip above active sessions.',
  );

  for (const toggle of toggles) {
    const row = document.createElement('div');
    row.className = 'modal-toggle-field';

    const label = document.createElement('label');
    label.htmlFor = `pref-sidebar-${toggle.key}`;
    label.textContent = toggle.label;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `pref-sidebar-${toggle.key}`;
    cb.checked = views[toggle.key];
    cb.addEventListener('change', () => {
      preferenceDraft.sidebarViews[toggle.key] = cb.checked;
    });

    row.appendChild(label);
    row.appendChild(cb);
    if (toggle.group === 'ops') {
      opsCard.appendChild(row);
    } else {
      sessionDeckCard.appendChild(row);
    }
  }

  const pinnedNote = document.createElement('div');
  pinnedNote.className = 'preferences-card-note';
  pinnedNote.textContent = 'Browser sessions automatically hold the left stage so inspection and handoff stay visible while you work.';
  liveViewCard.appendChild(pinnedNote);
}

interface AboutHeroElements {
  hero: HTMLElement;
  versionLine: HTMLElement;
}

interface AboutUpdateElements {
  row: HTMLElement;
  cleanup: () => void;
}

interface AboutUpdateRendererArgs {
  appUpdateState: ReturnType<typeof getUpdateCenterState>['app'];
  formatRelativeTimestamp: (timestamp?: string) => string;
  updateBtn: HTMLButtonElement;
  updateStatus: HTMLElement;
  updateMeta: HTMLElement;
  updateActivity: HTMLElement;
  updateProgress: HTMLElement;
  updateProgressFill: HTMLElement;
}

function renderAboutUpdateState({
  appUpdateState,
  formatRelativeTimestamp,
  updateBtn,
  updateStatus,
  updateMeta,
  updateActivity,
  updateProgress,
  updateProgressFill,
}: AboutUpdateRendererArgs): void {
  if (appUpdateState.phase === 'checking') {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Checking...';
    updateStatus.textContent = 'Checking for updates...';
    updateMeta.textContent = 'Contacting update server.';
    updateActivity.textContent = 'Status: request sent to release channel.';
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'downloading') {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Downloading...';
    const versionLabel = appUpdateState.targetVersion ? `v${appUpdateState.targetVersion}` : 'new version';
    const percent = typeof appUpdateState.downloadPercent === 'number' ? appUpdateState.downloadPercent : 0;
    updateStatus.textContent = `Downloading ${versionLabel}...`;
    updateMeta.textContent = `${percent}% completed`;
    updateActivity.textContent = 'Status: package download is in progress.';
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    return;
  }
  if (appUpdateState.phase === 'ready_to_restart') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Restart to Apply';
    const versionLabel = appUpdateState.targetVersion ? `v${appUpdateState.targetVersion}` : 'new update';
    updateStatus.textContent = `${versionLabel} is ready. Restart to apply.`;
    updateMeta.textContent = 'The update is downloaded.';
    updateActivity.textContent = 'Status: restart is required to finish update.';
    updateProgress.classList.remove('hidden');
    updateProgressFill.style.width = '100%';
    return;
  }
  if (appUpdateState.phase === 'up_to_date') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Check for Updates';
    updateStatus.textContent = 'You’re up to date.';
    updateMeta.textContent = appUpdateState.lastCheckedAt
      ? `Checked ${formatRelativeTimestamp(appUpdateState.lastCheckedAt)}`
      : 'No recent check.';
    updateActivity.textContent = 'Status: no newer build found.';
    updateProgress.classList.add('hidden');
    return;
  }
  if (appUpdateState.phase === 'error') {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Retry Check';
    updateStatus.textContent = 'Update check failed.';
    updateMeta.textContent = appUpdateState.errorMessage ?? 'Try again in a moment.';
    updateActivity.textContent = 'Status: check failed, retry is available.';
    updateProgress.classList.add('hidden');
    return;
  }
  updateBtn.disabled = false;
  updateBtn.textContent = 'Check for Updates';
  updateStatus.textContent = 'No check yet.';
  updateMeta.textContent = 'Use this to check for a newer Calder build.';
  updateActivity.textContent = 'Status: update check has not run in this session.';
  updateProgress.classList.add('hidden');
}

function createAboutHero(): AboutHeroElements {
  const aboutHero = document.createElement('div');
  aboutHero.className = 'about-hero';

  const appName = document.createElement('div');
  appName.className = 'about-app-name';
  appName.textContent = 'Calder';

  const versionLine = document.createElement('div');
  versionLine.className = 'about-version';
  versionLine.textContent = 'Version: loading...';

  const aboutLead = document.createElement('div');
  aboutLead.className = 'about-lead';
  aboutLead.textContent = 'A focused desktop workspace for browser context, CLI surfaces, and AI session flow.';

  aboutHero.appendChild(appName);
  aboutHero.appendChild(versionLine);
  aboutHero.appendChild(aboutLead);
  return { hero: aboutHero, versionLine };
}

function createAboutUpdateRow(
  formatRelativeTimestamp: (timestamp?: string) => string,
): AboutUpdateElements {
  const updateRow = document.createElement('div');
  updateRow.className = 'about-update-row';

  const updateBtn = document.createElement('button');
  updateBtn.className = 'about-update-btn';
  updateBtn.textContent = 'Check for Updates';

  const updateInfo = document.createElement('div');
  updateInfo.className = 'about-update-info';

  const updateStatus = document.createElement('div');
  updateStatus.className = 'about-update-status';

  const updateMeta = document.createElement('div');
  updateMeta.className = 'about-update-meta';

  const updateActivity = document.createElement('div');
  updateActivity.className = 'about-update-activity';

  const updateProgress = document.createElement('div');
  updateProgress.className = 'about-update-progress hidden';

  const updateProgressFill = document.createElement('div');
  updateProgressFill.className = 'about-update-progress-fill';
  updateProgress.appendChild(updateProgressFill);

  updateBtn.addEventListener('click', () => {
    const appStateSnapshot = getUpdateCenterState().app;
    if (appStateSnapshot.phase === 'ready_to_restart') {
      void window.calder.update.install();
      return;
    }
    void checkForAppUpdates();
  });

  updateInfo.appendChild(updateStatus);
  updateInfo.appendChild(updateMeta);
  updateInfo.appendChild(updateActivity);
  updateInfo.appendChild(updateProgress);
  updateRow.appendChild(updateBtn);
  updateRow.appendChild(updateInfo);

  const renderState = (appUpdateState: ReturnType<typeof getUpdateCenterState>['app']) => {
    renderAboutUpdateState({
      appUpdateState,
      formatRelativeTimestamp,
      updateBtn,
      updateStatus,
      updateMeta,
      updateActivity,
      updateProgress,
      updateProgressFill,
    });
  };

  renderState(getUpdateCenterState().app);
  const cleanup = onUpdateCenterChange((snapshot) => {
    renderState(snapshot.app);
  });
  return { row: updateRow, cleanup };
}

function createExternalAboutLink(label: string, url: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'about-link';
  link.textContent = label;
  link.href = '#';
  link.addEventListener('click', (event) => {
    event.preventDefault();
    window.calder.app.openExternal(url);
  });
  return link;
}

function createAboutLinks(): HTMLElement {
  const linksDiv = document.createElement('div');
  linksDiv.className = 'about-links about-link-grid';
  linksDiv.appendChild(createExternalAboutLink('GitHub', 'https://github.com/batuhanyuksel/calder'));
  linksDiv.appendChild(createExternalAboutLink('Report a Bug', 'https://github.com/batuhanyuksel/calder/issues'));
  return linksDiv;
}

function createAboutCommunity(): HTMLElement {
  const communityDiv = document.createElement('div');
  communityDiv.className = 'about-community';
  communityDiv.append(
    'Calder is open source. ',
    createExternalAboutLink('Contribute on GitHub', 'https://github.com/batuhanyuksel/calder'),
    ' — and if you find it useful, give it a star!',
  );
  return communityDiv;
}

function createDebugModeRow(preferenceDraft: AboutDraft): HTMLElement {
  const debugRow = document.createElement('div');
  debugRow.className = 'modal-toggle-field';

  const debugLabel = document.createElement('label');
  debugLabel.htmlFor = 'pref-debug-mode';
  debugLabel.textContent = 'Debug Mode';

  const debugModeCheckbox = document.createElement('input');
  debugModeCheckbox.type = 'checkbox';
  debugModeCheckbox.id = 'pref-debug-mode';
  debugModeCheckbox.checked = preferenceDraft.debugMode;
  debugModeCheckbox.addEventListener('change', () => {
    preferenceDraft.debugMode = debugModeCheckbox.checked;
  });

  debugRow.appendChild(debugLabel);
  debugRow.appendChild(debugModeCheckbox);
  return debugRow;
}

export function renderAboutPreferencesSection({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  formatRelativeTimestamp,
}: RenderAboutSectionArgs): () => void {
  appendSectionIntro(
    content,
    'Project',
    'Calder',
    'Version details, update checks, and source links for the current build.',
  );

  appendOverviewGrid(content, [
    {
      label: 'Channel',
      value: 'Desktop app',
      note: 'This workspace is tuned for side-by-side surface and session work.',
    },
    {
      label: 'Source',
      value: 'Open source',
      note: 'The repo and issue tracker stay one click away.',
    },
    {
      label: 'Updates',
      value: 'Manual check',
      note: 'Run a direct check whenever you want to confirm a newer build.',
    },
  ]);

  const aboutDiv = document.createElement('div');
  aboutDiv.className = 'about-section';

  const { hero: aboutHero, versionLine } = createAboutHero();
  const { row: updateRow, cleanup: updateCleanup } = createAboutUpdateRow(formatRelativeTimestamp);
  const linksDiv = createAboutLinks();
  const communityDiv = createAboutCommunity();
  const debugRow = createDebugModeRow(preferenceDraft);

  aboutDiv.appendChild(aboutHero);
  aboutDiv.appendChild(updateRow);
  aboutDiv.appendChild(linksDiv);
  aboutDiv.appendChild(communityDiv);
  aboutDiv.appendChild(debugRow);
  content.appendChild(aboutDiv);

  void window.calder.app.getVersion().then((ver) => {
    versionLine.textContent = `Version: ${ver}`;
  });

  return updateCleanup;
}

export function renderProvidersPreferencesSection({
  content,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionGroup,
  appendSectionCard,
  closeWideModal,
  rerenderProviders,
  modalBody,
  confirmButton,
  cancelButton,
  registerModalCleanup,
  buildCheckpointRestoreConfirm,
  isProvidersSectionActive,
  onApplySetupBadge,
  onFixProvider,
  onInstallMobileDependency,
}: RenderProvidersSectionArgs): void {
  appendSectionIntro(
    content,
    'Integrations',
    'Tool connections',
    'Check binaries, hooks, and tracking health without leaving the workspace.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Checks',
      value: 'Live',
      note: 'Binary status and tracking checks are refreshed from the local setup.',
    },
    {
      label: 'Tracking',
      value: 'Status line + hooks',
      note: 'Cost, context, and session activity depend on these staying healthy.',
    },
    {
      label: 'Scope',
      value: 'All coding tools',
      note: 'Claude, Codex, Gemini, Qwen, and the rest share one health view.',
    },
  ]);

  const providerHealthGroup = appendSectionGroup(
    content,
    'Integrations',
    'Provider health',
    'Installed tools, defaults, and repair actions.',
  );

  const mobileHealthGroup = appendSectionGroup(
    content,
    'Mobile',
    'Mobile automation readiness',
    'Checks iOS/Android simulator requirements and provides guided installs for missing dependencies.',
  );

  const orchestrationGroup = appendSectionGroup(
    content,
    'Project flow',
    'Orchestration phases',
    'Context, previews, reviews, checkpoints, and workflow health in calmer groups.',
  );

  const trackingGroup = appendSectionGroup(
    content,
    'Diagnostics',
    'Tracking & fixes',
    'Validation, install health, and direct repair actions.',
  );

  renderOrchestrationOverviewSection({
    container: orchestrationGroup,
    project: appState.activeProject,
    appendSectionCard,
    onBootstrapStarters: async (project) => {
      const contextResult = await window.calder.context.createStarterFiles(project.path);
      appState.setProjectContext(project.id, contextResult.state);

      const workflowResult = await window.calder.workflow.createStarterFiles(project.path);
      appState.setProjectWorkflows(project.id, workflowResult.state);

      const teamResult = await window.calder.teamContext.createStarterFiles(project.path);
      appState.setProjectTeamContext(project.id, teamResult.state);

      const governanceResult = await window.calder.governance.createStarterPolicy(project.path);
      appState.setProjectGovernance(project.id, governanceResult.state);

      rerenderProviders();
      return [
        `Context +${contextResult.created.length}`,
        `Workflows +${workflowResult.created.length}`,
        `Team spaces +${teamResult.created.length}`,
        governanceResult.created ? 'Governance policy created' : 'Governance policy already present',
      ].join(' · ');
    },
  });

  renderProjectPreviewCenterSection({
    container: orchestrationGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
  });
  renderProjectWorkflowSection({
    container: orchestrationGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderProviders,
    onCloseModalWide: closeWideModal,
  });

  renderProjectContextSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderProviders,
    onCloseModalWide: closeWideModal,
  });
  renderProjectGovernanceSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderProviders,
    onCloseModalWide: closeWideModal,
  });
  renderProjectTeamContextSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderProviders,
    onCloseModalWide: closeWideModal,
  });
  renderProjectReviewSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
  });
  renderProjectBackgroundTaskSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
    modalBody,
    confirmButton,
    cancelButton,
    registerModalCleanup,
  });
  renderProjectCheckpointSection({
    container: trackingGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
    onRefreshProviders: rerenderProviders,
    confirmButton,
    cancelButton,
    modalBody,
    registerModalCleanup,
    buildCheckpointRestoreConfirm,
  });

  void renderSetupSection({
    container: providerHealthGroup,
    isProvidersSectionActive,
    onApplySetupBadge,
    onFixProvider,
  });
  void renderMobileSetupSection({
    container: mobileHealthGroup,
    isProvidersSectionActive,
    onInstallMobileDependency,
  });
}
