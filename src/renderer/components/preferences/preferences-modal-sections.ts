import { appState } from '../../state.js';
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
import { renderGeneralPreferencesSectionContent } from './preferences-modal-sections-general-content.js';
import { renderLayoutPreferencesSectionContent } from './preferences-modal-sections-layout-content.js';
import type {
  RenderGeneralSectionArgs,
  RenderLayoutSectionArgs,
  RenderProvidersSectionArgs,
} from './preferences-modal-sections-types.js';

const PROVIDER_UNAVAILABLE_SUFFIX = ' (not installed)';
const PROVIDER_DEFAULT_MISSING_MESSAGE = 'Calder falls back to the next installed tool if this one is missing.';
const PROVIDER_DEFAULT_INSTALLED_MESSAGE = 'New sessions use this tool unless a workflow picks a different one.';
const PROVIDER_DEFAULT_UNAVAILABLE_MESSAGE = 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.';
const LAYOUT_OPS_RAIL_TITLE = 'Ops Rail modules';
const LAYOUT_LIVE_VIEW_TITLE = 'Live View behavior';
const LAYOUT_SESSION_DECK_TITLE = 'Session Deck defaults';

export { renderAboutPreferencesSection } from './preferences-modal-sections-about.js';

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
  renderGeneralPreferencesSectionContent({
    content,
    preferenceDraft,
    appendSectionIntro,
    appendOverviewGrid,
    isGeneralSectionActive,
    getDefaultProviderSelect,
    replaceDefaultProviderSelect,
    replaceLanguageSelect,
    providerCopy: {
      unavailableSuffix: PROVIDER_UNAVAILABLE_SUFFIX,
      defaultMissingMessage: PROVIDER_DEFAULT_MISSING_MESSAGE,
      defaultInstalledMessage: PROVIDER_DEFAULT_INSTALLED_MESSAGE,
      defaultUnavailableMessage: PROVIDER_DEFAULT_UNAVAILABLE_MESSAGE,
    },
  });
}

export function renderLayoutPreferencesSection({
  content,
  preferenceDraft,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionCard,
}: RenderLayoutSectionArgs): void {
  renderLayoutPreferencesSectionContent({
    content,
    preferenceDraft,
    appendSectionIntro,
    appendOverviewGrid,
    appendSectionCard,
    copy: {
      opsRailTitle: LAYOUT_OPS_RAIL_TITLE,
      liveViewTitle: LAYOUT_LIVE_VIEW_TITLE,
      sessionDeckTitle: LAYOUT_SESSION_DECK_TITLE,
    },
  });
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
