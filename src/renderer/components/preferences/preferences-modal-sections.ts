import { appState } from '../../state.js';
import { createCustomSelect } from '../custom-select.js';
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
import {
  appendPreferencesToggleField,
  buildProviderNote,
  buildProviderOptions,
} from './preferences-modal-general-helpers.js';
import type { ProviderId, UiLanguage } from '../../../shared/types/provider.js';
import type {
  LayoutSidebarViews,
  RenderGeneralSectionArgs,
  RenderLayoutSectionArgs,
  RenderProvidersSectionArgs,
} from './preferences-modal-sections-types.js';

const PROVIDER_UNAVAILABLE_SUFFIX = ' (not installed)';
const PROVIDER_DEFAULT_MISSING_MESSAGE = 'Calder falls back to the next installed tool if this one is missing.';
const PROVIDER_DEFAULT_INSTALLED_MESSAGE = 'New sessions use this tool unless a workflow picks a different one.';
const PROVIDER_DEFAULT_UNAVAILABLE_MESSAGE = 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.';

export { renderAboutPreferencesSection } from './preferences-modal-sections-about.js';

function appendGeneralSectionOverview(
  content: HTMLElement,
  preferenceDraft: RenderGeneralSectionArgs['preferenceDraft'],
  appendSectionIntro: RenderGeneralSectionArgs['appendSectionIntro'],
  appendOverviewGrid: RenderGeneralSectionArgs['appendOverviewGrid'],
): void {
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
}

function buildDefaultProviderNote(
  snapshot: ReturnType<typeof getProviderAvailabilitySnapshot>,
  providerId: ProviderId,
): string {
  return buildProviderNote(
    snapshot,
    providerId,
    PROVIDER_DEFAULT_MISSING_MESSAGE,
    PROVIDER_DEFAULT_INSTALLED_MESSAGE,
    PROVIDER_DEFAULT_UNAVAILABLE_MESSAGE,
  );
}

function appendDefaultProviderField({
  content,
  preferenceDraft,
  isGeneralSectionActive,
  getDefaultProviderSelect,
  replaceDefaultProviderSelect,
}: Pick<
  RenderGeneralSectionArgs,
  'content'
  | 'preferenceDraft'
  | 'isGeneralSectionActive'
  | 'getDefaultProviderSelect'
  | 'replaceDefaultProviderSelect'
>): void {
  const providerRow = document.createElement('div');
  providerRow.className = 'modal-toggle-field';

  const providerLabel = document.createElement('label');
  providerLabel.textContent = 'Default coding tool';

  const providerNote = document.createElement('div');
  providerNote.className = 'preferences-control-note';

  const currentDefault = preferenceDraft.defaultProvider;
  const providerSnapshot = { current: getProviderAvailabilitySnapshot() };

  const updateProviderDraftAndNote = (): void => {
    const select = getDefaultProviderSelect();
    if (!select) return;
    preferenceDraft.defaultProvider = select.getValue() as ProviderId;
    providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider);
  };

  const bindProviderSelectChange = (): void => {
    const select = getDefaultProviderSelect();
    if (!select) return;
    select.element.addEventListener('change', () => {
      updateProviderDraftAndNote();
    });
  };

  if (providerSnapshot.current) {
    const defaultSelect = createCustomSelect(
      'pref-default-provider',
      buildProviderOptions(providerSnapshot.current, PROVIDER_UNAVAILABLE_SUFFIX),
      currentDefault,
    );
    replaceDefaultProviderSelect(defaultSelect);
    preferenceDraft.defaultProvider = defaultSelect.getValue() as ProviderId;
  } else {
    const loadingSelect = createCustomSelect(
      'pref-default-provider',
      [{ value: currentDefault, label: 'Loading…' }],
      currentDefault,
    );
    replaceDefaultProviderSelect(loadingSelect);
    void loadProviderAvailability().then(() => {
      if (!isGeneralSectionActive()) return;
      providerSnapshot.current = getProviderAvailabilitySnapshot();
      if (!providerSnapshot.current) return;

      const refreshedSelect = createCustomSelect(
        'pref-default-provider',
        buildProviderOptions(providerSnapshot.current, PROVIDER_UNAVAILABLE_SUFFIX),
        preferenceDraft.defaultProvider,
      );
      replaceDefaultProviderSelect(refreshedSelect);
      providerRow.querySelector('.custom-select')?.remove();
      providerRow.appendChild(refreshedSelect.element);
      preferenceDraft.defaultProvider = refreshedSelect.getValue() as ProviderId;
      providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider);
      bindProviderSelectChange();
    });
  }

  const providerSelect = getDefaultProviderSelect();
  if (!providerSelect) return;

  providerNote.textContent = buildDefaultProviderNote(providerSnapshot.current, preferenceDraft.defaultProvider);
  bindProviderSelectChange();
  providerRow.appendChild(providerLabel);
  providerRow.appendChild(providerSelect.element);
  content.appendChild(providerRow);
  content.appendChild(providerNote);
}

function appendLanguageField({
  content,
  preferenceDraft,
  replaceLanguageSelect,
}: Pick<RenderGeneralSectionArgs, 'content' | 'preferenceDraft' | 'replaceLanguageSelect'>): void {
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
}

function appendGeneralSessionToggles(
  content: HTMLElement,
  preferenceDraft: RenderGeneralSectionArgs['preferenceDraft'],
): void {
  appendPreferencesToggleField(
    content,
    'pref-sound-on-waiting',
    'Play sound when session finishes work',
    preferenceDraft.soundOnSessionWaiting,
    (checked) => {
      preferenceDraft.soundOnSessionWaiting = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-notifications-desktop',
    'Desktop notifications when sessions need attention',
    preferenceDraft.notificationsDesktop,
    (checked) => {
      preferenceDraft.notificationsDesktop = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-session-history',
    'Record session history when sessions close',
    preferenceDraft.sessionHistoryEnabled,
    (checked) => {
      preferenceDraft.sessionHistoryEnabled = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-insights-enabled',
    'Show insight alerts',
    preferenceDraft.insightsEnabled,
    (checked) => {
      preferenceDraft.insightsEnabled = checked;
    },
  );
  appendPreferencesToggleField(
    content,
    'pref-auto-title',
    'Auto-name sessions from conversation title',
    preferenceDraft.autoTitleEnabled,
    (checked) => {
      preferenceDraft.autoTitleEnabled = checked;
    },
  );
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
  appendGeneralSectionOverview(content, preferenceDraft, appendSectionIntro, appendOverviewGrid);
  appendDefaultProviderField({
    content,
    preferenceDraft,
    isGeneralSectionActive,
    getDefaultProviderSelect,
    replaceDefaultProviderSelect,
  });
  appendLanguageField({
    content,
    preferenceDraft,
    replaceLanguageSelect,
  });
  appendGeneralSessionToggles(content, preferenceDraft);
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

// about-hero + about-link-grid are rendered in preferences-modal-sections-about.ts.

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
