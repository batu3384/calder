import { appState } from '../../state.js';
import { renderProjectBackgroundTaskSection } from './preferences-background-task-discovery.js';
import { renderProjectCheckpointSection } from './preferences-checkpoint-discovery.js';
import { renderProjectContextSection } from './preferences-context-discovery.js';
import { renderProjectGovernanceSection } from './preferences-governance-discovery.js';
import { renderGeneralPreferencesSectionContent } from './preferences-modal-sections-general-content.js';
import { renderLayoutPreferencesSectionContent } from './preferences-modal-sections-layout-content.js';
import type {
  RenderAutomationSectionArgs,
  RenderGeneralSectionArgs,
  RenderLayoutSectionArgs,
  RenderSafetySectionArgs,
  RenderToolsSectionArgs,
} from './preferences-modal-sections-types.js';
import { renderOrchestrationOverviewSection } from './preferences-orchestration-overview.js';
import { renderProjectPreviewCenterSection } from './preferences-preview-discovery.js';
import {
  renderMobileSetupSection,
  renderSetupSection,
} from './preferences-provider-setup.js';
import { renderProjectReviewSection } from './preferences-review-discovery.js';
import { renderProjectTeamContextSection } from './preferences-team-context-discovery.js';
import { renderProjectWorkflowSection } from './preferences-workflow-discovery.js';

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

export function renderToolsPreferencesSection({
  content,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionCard,
  isToolsSectionActive,
  onApplySetupBadge,
  onFixProvider,
  onInstallMobileDependency,
}: RenderToolsSectionArgs): void {
  appendSectionIntro(
    content,
    'Tools',
    'CLI health and mobile readiness',
    'Keep providers, local binaries, and mobile automation dependencies healthy without mixing them with project workflow settings.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Providers',
      value: 'Live',
      note: 'Installed tools, defaults, and repair actions refresh from the local machine.',
    },
    {
      label: 'Mobile',
      value: 'Doctor',
      note: 'Simulator dependencies stay visible without crowding the main workspace.',
    },
    {
      label: 'Scope',
      value: 'All CLIs',
      note: 'Claude, Codex, Antigravity, Qwen, Minimax, and the rest share one health view.',
    },
  ]);

  const providerHealthGroup = appendSectionCard(content, 'Provider health', 'Installed tools, defaults, and repair actions.');
  const mobileHealthGroup = appendSectionCard(content, 'Mobile automation readiness', 'Checks iOS/Android simulator requirements and provides guided installs for missing dependencies.');

  void renderSetupSection({
    container: providerHealthGroup,
    isProvidersSectionActive: isToolsSectionActive,
    onApplySetupBadge,
    onFixProvider,
  });
  void renderMobileSetupSection({
    container: mobileHealthGroup,
    isProvidersSectionActive: isToolsSectionActive,
    onInstallMobileDependency,
  });
}

export function renderAutomationPreferencesSection({
  content,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionGroup,
  appendSectionCard,
  closeWideModal,
  rerenderAutomation,
  modalBody,
  confirmButton,
  cancelButton,
  registerModalCleanup,
}: RenderAutomationSectionArgs): void {
  appendSectionIntro(
    content,
    'Automation',
    'Project workflow system',
    'Preview capture, project workflows, background tasks, and orchestration live here as one operational layer.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Flow',
      value: 'Contextual',
      note: 'Workflow helpers are scoped to the active project instead of global tool setup.',
    },
    {
      label: 'Preview',
      value: 'Browser + app',
      note: 'Capture, visual checks, and project previews stay near the workflows that use them.',
    },
    {
      label: 'Tasks',
      value: 'Background',
      note: 'Long-running project tasks remain inspectable without blocking the shell.',
    },
  ]);

  const orchestrationGroup = appendSectionGroup(
    content,
    'Project flow',
    'Orchestration phases',
    'Preview capture, workflow files, and long-running tasks grouped by project flow.',
  );

  renderOrchestrationOverviewSection({
    container: orchestrationGroup,
    project: appState.activeProject,
    appendSectionCard,
    onBootstrapStarters: async (project) => {
      const bootstrapErrors: string[] = [];

      try {
        const contextResult = await window.calder.context.createStarterFiles(project.path);
        appState.setProjectContext(project.id, contextResult.state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[preferences] createStarterFiles(context) failed:', msg);
        bootstrapErrors.push(`Context: ${msg}`);
      }

      try {
        const workflowResult = await window.calder.workflow.createStarterFiles(project.path);
        appState.setProjectWorkflows(project.id, workflowResult.state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[preferences] createStarterFiles(workflow) failed:', msg);
        bootstrapErrors.push(`Workflows: ${msg}`);
      }

      try {
        const teamResult = await window.calder.teamContext.createStarterFiles(project.path);
        appState.setProjectTeamContext(project.id, teamResult.state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[preferences] createStarterFiles(teamContext) failed:', msg);
        bootstrapErrors.push(`Team spaces: ${msg}`);
      }

      try {
        const governanceResult = await window.calder.governance.createStarterPolicy(project.path);
        appState.setProjectGovernance(project.id, governanceResult.state);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[preferences] createStarterPolicy failed:', msg);
        bootstrapErrors.push(`Governance: ${msg}`);
      }

      rerenderAutomation();

      if (bootstrapErrors.length > 0) {
        return `[Partial] ${bootstrapErrors.join(' · ')}`;
      }
      return 'All starter files created successfully.';
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
    onRefreshProviders: rerenderAutomation,
    onCloseModalWide: closeWideModal,
  });
  renderProjectBackgroundTaskSection({
    container: orchestrationGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
    modalBody,
    confirmButton,
    cancelButton,
    registerModalCleanup,
  });
}

export function renderSafetyPreferencesSection({
  content,
  appendSectionIntro,
  appendOverviewGrid,
  appendSectionGroup,
  appendSectionCard,
  closeWideModal,
  rerenderSafety,
  modalBody,
  confirmButton,
  cancelButton,
  registerModalCleanup,
  buildCheckpointRestoreConfirm,
}: RenderSafetySectionArgs): void {
  appendSectionIntro(
    content,
    'Safety',
    'Memory, policy, and recovery',
    'Project memory, team context, governance, review rules, and checkpoints are grouped away from raw tool setup.',
  );
  appendOverviewGrid(content, [
    {
      label: 'Memory',
      value: 'Project-aware',
      note: 'Context files and team notes feed Calder without hiding where they come from.',
    },
    {
      label: 'Policy',
      value: 'Governed',
      note: 'Approval and review rules stay visible before automation acts.',
    },
    {
      label: 'Recovery',
      value: 'Checkpoints',
      note: 'Restore points are managed beside the safety rules that protect work.',
    },
  ]);

  const memoryGroup = appendSectionGroup(
    content,
    'Memory',
    'Context and team knowledge',
    'Project context and team notes that Calder can reuse across CLI sessions.',
  );

  const policyGroup = appendSectionGroup(
    content,
    'Policy',
    'Governance and review',
    'Approval rules, review expectations, and guardrails for automation.',
  );

  const recoveryGroup = appendSectionGroup(
    content,
    'Recovery',
    'Checkpoints',
    'Restore points and rollback helpers for project changes.',
  );

  renderProjectContextSection({
    container: memoryGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderSafety,
    onCloseModalWide: closeWideModal,
  });
  renderProjectTeamContextSection({
    container: memoryGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderSafety,
    onCloseModalWide: closeWideModal,
  });
  renderProjectGovernanceSection({
    container: policyGroup,
    project: appState.activeProject,
    appendSectionCard,
    onRefreshProviders: rerenderSafety,
    onCloseModalWide: closeWideModal,
  });
  renderProjectReviewSection({
    container: policyGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
  });
  renderProjectCheckpointSection({
    container: recoveryGroup,
    project: appState.activeProject,
    appendSectionCard,
    onCloseModalWide: closeWideModal,
    onRefreshProviders: rerenderSafety,
    confirmButton,
    cancelButton,
    modalBody,
    registerModalCleanup,
    buildCheckpointRestoreConfirm,
  });
}
