import { appState } from '../state.js';
import {
  closeModal,
  extendModalCleanup,
  prepareModalSurface,
  registerModalCleanup,
  runModalCleanup,
  setModalError,
  showModal,
} from './modal.js';
import { createCustomSelect, type CustomSelectInstance } from './custom-select.js';
import { shortcutManager, displayKeys, eventToAccelerator } from '../shortcuts.js';
import { loadProviderAvailability, getProviderAvailabilitySnapshot } from '../provider-availability.js';
import { toProjectRelativeContextPath } from '../project-context-utils.js';
import {
  describePreviewRuntimeHealth,
  focusCliPreviewSurface,
  openPreviewTargetInLiveView,
  openWorkspaceShellLogs,
  restartPreviewRuntime,
} from '../project-preview-actions.js';
import { sendProjectReviewToSelectedSession } from '../project-review-actions.js';
import {
  resumeProjectBackgroundTaskInNewSession,
  sendProjectBackgroundTaskToSelectedSession,
} from '../project-background-task-actions.js';
import {
  checkForAppUpdates,
  getUpdateCenterState,
  onUpdateCenterChange,
} from '../update-center.js';
import {
  appendOverviewGrid as appendOverviewGridLayout,
  appendSectionCard as appendSectionCardLayout,
  appendSectionGroup as appendSectionGroupLayout,
  appendSectionIntro as appendSectionIntroLayout,
} from './preferences-layout.js';
import type {
  CliProviderMeta,
  ProjectCheckpointDocument,
  ProviderId,
  SettingsValidationResult,
  UiLanguage,
} from '../../shared/types.js';
import { isTrackingHealthy } from '../../shared/tracking-health.js';


const overlay = document.getElementById('modal-overlay')!;
const modal = document.getElementById('modal')!;
const titleEl = document.getElementById('modal-title')!;
const bodyEl = document.getElementById('modal-body')!;
const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;

type Section = 'general' | 'layout' | 'providers' | 'shortcuts' | 'about';
type OrchestrationPhaseTone = 'active' | 'partial' | 'empty';
type OrchestrationHealthTone = 'healthy' | 'watch' | 'risk';

interface OrchestrationPhaseState {
  phase: string;
  title: string;
  tone: OrchestrationPhaseTone;
  statusLabel: string;
  summary: string;
  detail: string;
  updatedAt?: string;
}

interface OrchestrationHealthState {
  tone: OrchestrationHealthTone;
  label: string;
}

function appendSectionIntro(container: HTMLElement, eyebrow: string, title: string, description: string): void {
  // preferences-section-intro
  appendSectionIntroLayout(container, eyebrow, title, description);
}

function appendSectionCard(container: HTMLElement, title: string, description?: string): HTMLElement {
  // preferences-section-card
  return appendSectionCardLayout(container, title, description);
}

function appendSectionGroup(
  container: HTMLElement,
  eyebrow: string,
  title: string,
  description: string,
): HTMLElement {
  // preferences-subsection + preferences-subsection-grid
  return appendSectionGroupLayout(container, eyebrow, title, description);
}

function appendOverviewGrid(
  container: HTMLElement,
  items: Array<{ label: string; value: string; note?: string }>,
): void {
  // preferences-overview-grid
  appendOverviewGridLayout(container, items);
}

export function showPreferencesModal(): void {
  prepareModalSurface();
  titleEl.textContent = 'Workspace Center';
  bodyEl.innerHTML = '';
  modal.classList.add('modal-wide');
  bodyEl.classList.add('preferences-body');

  // Build two-pane layout
  const layout = document.createElement('div');
  layout.className = 'preferences-layout preferences-shell';

  // Side menu
  const menu = document.createElement('div');
  menu.className = 'preferences-menu';

  const menuHeader = document.createElement('div');
  menuHeader.className = 'preferences-menu-header';
  menuHeader.innerHTML = `
    <div class="preferences-menu-kicker shell-kicker">Calder</div>
    <div class="preferences-menu-title">Calder workspace</div>
    <div class="preferences-menu-caption">Defaults, layout, integrations, and the rules that shape every session.</div>
  `;
  menu.appendChild(menuHeader);

  const sections: { id: Section; label: string; caption: string }[] = [
    { id: 'general', label: 'Session', caption: 'How Calder starts and remembers work' },
    { id: 'layout', label: 'Layout', caption: 'Surface and rail visibility defaults' },
    { id: 'shortcuts', label: 'Keys', caption: 'Command bindings and overrides' },
    { id: 'providers', label: 'Integrations', caption: 'Tool health, orchestration phases, and tracking' },
    { id: 'about', label: 'About', caption: 'Version, updates, and project links' },
  ];

  const menuItems: Map<Section, HTMLButtonElement> = new Map();
  for (const section of sections) {
    const item = document.createElement('button');
    item.className = 'preferences-menu-item';
    item.type = 'button';
    item.dataset.section = section.id;
    item.innerHTML = `
      <span class="preferences-menu-item-label">${section.label}</span>
      <span class="preferences-menu-item-caption">${section.caption}</span>
    `;
    menu.appendChild(item);
    menuItems.set(section.id, item);
  }

  // Content area
  const contentShell = document.createElement('div');
  contentShell.className = 'preferences-content-shell';

  const content = document.createElement('div');
  content.className = 'preferences-content preferences-section';

  layout.appendChild(menu);
  contentShell.appendChild(content);
  layout.appendChild(contentShell);
  bodyEl.appendChild(layout);

  // Build section content
  let currentSection: Section = 'general';
  let soundCheckbox: HTMLInputElement | null = null;
  let notificationsCheckbox: HTMLInputElement | null = null;
  let historyCheckbox: HTMLInputElement | null = null;
  let insightsCheckbox: HTMLInputElement | null = null;
  let autoTitleCheckbox: HTMLInputElement | null = null;
  let defaultProviderSelect: CustomSelectInstance | null = null;
  let languageSelect: CustomSelectInstance | null = null;
  let debugModeCheckbox: HTMLInputElement | null = null;
  let sidebarCheckboxes: { configSections: HTMLInputElement; gitPanel: HTMLInputElement; sessionHistory: HTMLInputElement; costFooter: HTMLInputElement } | null = null;
  let activeRecorder: { cleanup: () => void } | null = null;
  let aboutUpdateCleanup: (() => void) | null = null;

  function formatCountLabel(count: number, singular: string, plural: string): string {
    return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
  }

  function resolveProjectFilePath(projectPath: string, filePath: string): string {
    if (!filePath) return projectPath;
    if (/^(?:[A-Za-z]:[\\/]|\/)/.test(filePath)) {
      return filePath.replace(/\\/g, '/');
    }
    const normalizedProject = projectPath.replace(/[\\/]+$/, '');
    const normalizedFile = filePath.replace(/^[\\/]+/, '').replace(/\\/g, '/');
    return `${normalizedProject}/${normalizedFile}`;
  }

  function getPhaseStatusLabel(tone: OrchestrationPhaseTone): string {
    switch (tone) {
      case 'active':
        return 'Active';
      case 'partial':
        return 'Partial';
      default:
        return 'Empty';
    }
  }

  function buildOrchestrationHealthState(phases: OrchestrationPhaseState[]): OrchestrationHealthState {
    const activeCount = phases.filter((phase) => phase.tone === 'active').length;
    const partialCount = phases.filter((phase) => phase.tone === 'partial').length;
    const emptyCount = phases.length - activeCount - partialCount;

    if (emptyCount === 0 && partialCount <= 1) {
      return { tone: 'healthy', label: 'Stable' };
    }
    if (activeCount >= Math.ceil(phases.length / 2)) {
      return { tone: 'watch', label: 'Needs tuning' };
    }
    return { tone: 'risk', label: 'Needs setup' };
  }

  function pickLatestTimestamp(...values: Array<string | undefined>): string | undefined {
    const filtered = values.filter((entry): entry is string => Boolean(entry));
    if (filtered.length === 0) return undefined;
    return filtered.sort().at(-1);
  }

  function formatRelativeTimestamp(timestamp?: string): string {
    if (!timestamp) return 'No sync yet';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'No sync yet';
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) {
      return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (diffMs < 60_000) return 'Updated just now';
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    return `Updated ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function buildOrchestrationPhaseStates(
    project: NonNullable<typeof appState.activeProject>,
  ): OrchestrationPhaseState[] {
    const projectContext = project.projectContext;
    const providerSourceCount = projectContext?.providerSourceCount ?? 0;
    const sharedRuleCount = projectContext?.sharedRuleCount ?? 0;
    const contextTone: OrchestrationPhaseTone =
      providerSourceCount > 0 && sharedRuleCount > 0
        ? 'active'
        : providerSourceCount > 0 || sharedRuleCount > 0
          ? 'partial'
          : 'empty';

    const workflowCount = project.projectWorkflows?.workflows.length ?? 0;
    const checkpointCount = project.projectCheckpoints?.checkpoints.length ?? 0;
    const workflowTone: OrchestrationPhaseTone =
      workflowCount > 0 && checkpointCount > 0
        ? 'active'
        : workflowCount > 0 || checkpointCount > 0
          ? 'partial'
          : 'empty';

    const reviewCount = project.projectReviews?.reviews.length ?? 0;
    const previewRuntimeStatus = project.surface?.cli?.runtime?.status ?? 'idle';
    const hasPreviewTarget = Boolean(project.surface?.web?.url || project.surface?.web?.history?.length);
    const reviewPreviewTone: OrchestrationPhaseTone =
      reviewCount > 0 && (previewRuntimeStatus === 'running' || hasPreviewTarget)
        ? 'active'
        : reviewCount > 0 || previewRuntimeStatus === 'running' || hasPreviewTarget
          ? 'partial'
          : 'empty';

    const governancePolicy = project.projectGovernance?.policy;
    const governanceTone: OrchestrationPhaseTone = governancePolicy
      ? governancePolicy.mode === 'enforced'
        ? 'active'
        : 'partial'
      : 'empty';

    const queuedTasks = project.projectBackgroundTasks?.queuedCount ?? 0;
    const runningTasks = project.projectBackgroundTasks?.runningCount ?? 0;
    const completedTasks = project.projectBackgroundTasks?.completedCount ?? 0;
    const backgroundTaskTone: OrchestrationPhaseTone =
      runningTasks > 0 || completedTasks > 0
        ? 'active'
        : queuedTasks > 0
          ? 'partial'
          : 'empty';

    const teamSpaceCount = project.projectTeamContext?.spaces.length ?? 0;
    const teamRuleCount = project.projectTeamContext?.sharedRuleCount ?? 0;
    const teamWorkflowCount = project.projectTeamContext?.workflowCount ?? 0;
    const teamContextTone: OrchestrationPhaseTone =
      teamSpaceCount > 0 && (teamRuleCount > 0 || teamWorkflowCount > 0)
        ? 'active'
        : teamSpaceCount > 0 || teamRuleCount > 0 || teamWorkflowCount > 0
          ? 'partial'
          : 'empty';

    return [
      {
        phase: 'Phase 0-1',
        title: 'Hybrid context',
        tone: contextTone,
        statusLabel: getPhaseStatusLabel(contextTone),
        summary: `${providerSourceCount} provider memory · ${sharedRuleCount} shared rules`,
        detail: 'Discovers repo context and appends compact applied-context summaries to routed prompts.',
        updatedAt: projectContext?.lastUpdated,
      },
      {
        phase: 'Phase 2',
        title: 'Workflows & checkpoints',
        tone: workflowTone,
        statusLabel: getPhaseStatusLabel(workflowTone),
        summary: `${workflowCount} workflows · ${checkpointCount} checkpoints`,
        detail: 'Launches repeatable workflows and restores safe snapshots after risky changes.',
        updatedAt: pickLatestTimestamp(
          project.projectWorkflows?.lastUpdated,
          project.projectCheckpoints?.lastUpdated,
        ),
      },
      {
        phase: 'Phase 3',
        title: 'Review & preview loop',
        tone: reviewPreviewTone,
        statusLabel: getPhaseStatusLabel(reviewPreviewTone),
        summary: `${reviewCount} review files · preview ${previewRuntimeStatus}`,
        detail: 'Keeps review notes and preview runtime feedback in the same workspace loop.',
        updatedAt: project.projectReviews?.lastUpdated,
      },
      {
        phase: 'Phase 4',
        title: 'Governance layer',
        tone: governanceTone,
        statusLabel: getPhaseStatusLabel(governanceTone),
        summary: governancePolicy
          ? `${governancePolicy.mode} · tools ${governancePolicy.toolPolicy} · writes ${governancePolicy.writePolicy}`
          : 'No policy discovered',
        detail: 'Applies repo-local safety policy before write, network, MCP, and budget operations.',
        updatedAt: pickLatestTimestamp(
          project.projectGovernance?.lastUpdated,
          governancePolicy?.lastUpdated,
        ),
      },
      {
        phase: 'Phase 5',
        title: 'Background tasks',
        tone: backgroundTaskTone,
        statusLabel: getPhaseStatusLabel(backgroundTaskTone),
        summary: `${queuedTasks} queued · ${runningTasks} running · ${completedTasks} completed`,
        detail: 'Stores queued background work and enables controlled takeover or resume.',
        updatedAt: project.projectBackgroundTasks?.lastUpdated,
      },
      {
        phase: 'Phase 6',
        title: 'Team context',
        tone: teamContextTone,
        statusLabel: getPhaseStatusLabel(teamContextTone),
        summary: `${teamSpaceCount} spaces · ${teamRuleCount} shared rules · ${teamWorkflowCount} workflows`,
        detail: 'Keeps cross-session team guidance visible alongside rules and reusable workflows.',
        updatedAt: project.projectTeamContext?.lastUpdated,
      },
    ];
  }

  function renderOrchestrationOverviewSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Calder orchestration map',
      'A compact, phase-by-phase view of what is active in this repo and how Calder routes it during real work.',
    );

    const shell = document.createElement('div');
    shell.className = 'orchestration-overview-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'orchestration-overview-empty';
      empty.textContent = 'Open a project to inspect orchestration phase status.';
      shell.appendChild(empty);
      return;
    }

    const phaseStates = buildOrchestrationPhaseStates(project);
    const activeCount = phaseStates.filter((phase) => phase.tone === 'active').length;
    const partialCount = phaseStates.filter((phase) => phase.tone === 'partial').length;
    const emptyCount = phaseStates.length - activeCount - partialCount;
    const latestUpdatedAt = pickLatestTimestamp(...phaseStates.map((phase) => phase.updatedAt));
    const healthState = buildOrchestrationHealthState(phaseStates);

    const summary = document.createElement('div');
    summary.className = 'orchestration-overview-summary';

    const snapshot = document.createElement('div');
    snapshot.className = 'orchestration-overview-snapshot';
    snapshot.textContent = `${activeCount}/${phaseStates.length} phases active · ${partialCount} partial · ${emptyCount} empty · ${formatRelativeTimestamp(latestUpdatedAt)}`;
    summary.appendChild(snapshot);

    const health = document.createElement('div');
    health.className = 'orchestration-overview-health';
    health.dataset.tone = healthState.tone;

    const healthLabel = document.createElement('span');
    healthLabel.className = 'orchestration-overview-health-label';
    healthLabel.textContent = 'System health';

    const healthValue = document.createElement('span');
    healthValue.className = 'orchestration-overview-health-value';
    healthValue.textContent = healthState.label;

    health.appendChild(healthLabel);
    health.appendChild(healthValue);
    summary.appendChild(health);

    const pulse = document.createElement('div');
    pulse.className = 'orchestration-overview-pulse';
    for (const phase of phaseStates) {
      const segment = document.createElement('span');
      segment.className = 'orchestration-overview-pulse-segment';
      segment.dataset.tone = phase.tone;
      segment.title = `${phase.phase} · ${phase.statusLabel}`;
      pulse.appendChild(segment);
    }
    summary.appendChild(pulse);
    shell.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'orchestration-overview-actions';

    let detailsOpen = false;

    const detailsToggle = document.createElement('button');
    detailsToggle.className = 'orchestration-overview-action-btn';
    detailsToggle.dataset.role = 'toggle-details';
    detailsToggle.type = 'button';
    actions.appendChild(detailsToggle);

    const bootstrapBtn = document.createElement('button');
    bootstrapBtn.className = 'orchestration-overview-action-btn';
    bootstrapBtn.type = 'button';
    bootstrapBtn.textContent = 'Bootstrap phase starters';
    actions.appendChild(bootstrapBtn);

    const status = document.createElement('div');
    status.className = 'orchestration-overview-status';
    status.textContent = 'Starter files are optional. Use them to make each phase immediately visible in this repo.';
    actions.appendChild(status);
    shell.appendChild(actions);

    bootstrapBtn.addEventListener('click', async () => {
      bootstrapBtn.disabled = true;
      bootstrapBtn.textContent = 'Bootstrapping…';
      status.textContent = 'Creating starter files for context, workflows, team spaces, and governance…';
      try {
        const contextResult = await window.calder.context.createStarterFiles(project.path);
        appState.setProjectContext(project.id, contextResult.state);

        const workflowResult = await window.calder.workflow.createStarterFiles(project.path);
        appState.setProjectWorkflows(project.id, workflowResult.state);

        const teamResult = await window.calder.teamContext.createStarterFiles(project.path);
        appState.setProjectTeamContext(project.id, teamResult.state);

        const governanceResult = await window.calder.governance.createStarterPolicy(project.path);
        appState.setProjectGovernance(project.id, governanceResult.state);

        status.textContent = [
          `Context +${contextResult.created.length}`,
          `Workflows +${workflowResult.created.length}`,
          `Team spaces +${teamResult.created.length}`,
          governanceResult.created ? 'Governance policy created' : 'Governance policy already present',
        ].join(' · ');
        renderSection('providers');
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        status.textContent = `Bootstrap failed: ${detail}`;
        bootstrapBtn.disabled = false;
        bootstrapBtn.textContent = 'Bootstrap phase starters';
      }
    });

    const details = document.createElement('div');
    details.className = 'orchestration-overview-details';
    details.hidden = true;

    const setDetailsOpen = (open: boolean) => {
      detailsOpen = open;
      details.hidden = !detailsOpen;
      detailsToggle.textContent = detailsOpen ? 'Hide phase details' : 'Show phase details';
      detailsToggle.setAttribute('aria-expanded', detailsOpen ? 'true' : 'false');
    };

    detailsToggle.addEventListener('click', () => setDetailsOpen(!detailsOpen));
    setDetailsOpen(false);

    const flow = document.createElement('div');
    flow.className = 'orchestration-overview-flow';
    flow.innerHTML = `
      <div class="orchestration-overview-flow-item"><span class="orchestration-overview-flow-step">01</span><span class="orchestration-overview-flow-copy">Calder discovers repo sources and keeps them live with watchers.</span></div>
      <div class="orchestration-overview-flow-item"><span class="orchestration-overview-flow-step">02</span><span class="orchestration-overview-flow-copy">Routing adds compact context blocks instead of large prompt dumps.</span></div>
      <div class="orchestration-overview-flow-item"><span class="orchestration-overview-flow-step">03</span><span class="orchestration-overview-flow-copy">Governance checks write and MCP actions before they run.</span></div>
    `;
    details.appendChild(flow);

    const phaseGrid = document.createElement('div');
    phaseGrid.className = 'orchestration-overview-grid';

    for (const phase of phaseStates) {
      const item = document.createElement('div');
      item.className = 'orchestration-overview-item';
      item.dataset.tone = phase.tone;
      item.innerHTML = `
        <div class="orchestration-overview-item-header">
          <span class="orchestration-overview-item-phase">${phase.phase}</span>
          <span class="orchestration-overview-item-state">${phase.statusLabel}</span>
        </div>
        <div class="orchestration-overview-item-title">${phase.title}</div>
        <div class="orchestration-overview-item-summary">${phase.summary}</div>
        <div class="orchestration-overview-item-updated">${formatRelativeTimestamp(phase.updatedAt)}</div>
        <div class="orchestration-overview-item-detail">${phase.detail}</div>
      `;
      phaseGrid.appendChild(item);
    }
    details.appendChild(phaseGrid);
    shell.appendChild(details);
  }

  function appendCheckpointRestoreFact(container: HTMLElement, label: string, value: string) {
    const row = document.createElement('div');
    row.className = 'checkpoint-restore-confirm-fact';

    const labelEl = document.createElement('div');
    labelEl.className = 'checkpoint-restore-confirm-fact-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'checkpoint-restore-confirm-fact-value';
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    container.appendChild(row);
  }

  function buildCheckpointRestoreConfirm(
    projectId: string,
    projectPath: string,
    checkpointDocument: ProjectCheckpointDocument,
    restoreSummaryText: string,
  ): HTMLElement {
    const sessionKinds = checkpointDocument.sessions.reduce((counts, session) => {
      const type = session.type ?? 'claude';
      counts.set(type, (counts.get(type) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    const sessionParts = [
      sessionKinds.get('claude') ? formatCountLabel(sessionKinds.get('claude')!, 'CLI session', 'CLI sessions') : null,
      sessionKinds.get('browser-tab') ? formatCountLabel(sessionKinds.get('browser-tab')!, 'browser surface', 'browser surfaces') : null,
      sessionKinds.get('file-reader') ? formatCountLabel(sessionKinds.get('file-reader')!, 'file view', 'file views') : null,
      sessionKinds.get('diff-viewer') ? formatCountLabel(sessionKinds.get('diff-viewer')!, 'diff view', 'diff views') : null,
      sessionKinds.get('remote-terminal') ? formatCountLabel(sessionKinds.get('remote-terminal')!, 'remote session', 'remote sessions') : null,
      sessionKinds.get('mcp-inspector') ? formatCountLabel(sessionKinds.get('mcp-inspector')!, 'inspector', 'inspectors') : null,
    ].filter((entry): entry is string => Boolean(entry));

    const gitSummary = checkpointDocument.git.isGitRepo
      ? [
          checkpointDocument.git.branch ?? 'Detached HEAD',
          formatCountLabel(checkpointDocument.changedFileCount, 'changed file', 'changed files'),
        ].join(' · ')
      : 'Git metadata unavailable';

    const surfaceSummary = checkpointDocument.surface
      ? checkpointDocument.surface.kind === 'web'
        ? `Live View${checkpointDocument.surface.webUrl ? ` · ${checkpointDocument.surface.webUrl}` : ''}`
        : `CLI Surface${checkpointDocument.surface.cliStatus ? ` · ${checkpointDocument.surface.cliStatus}` : ''}`
      : 'No focused surface snapshot';

    const contextSummary = checkpointDocument.projectContext
      ? [
          formatCountLabel(checkpointDocument.projectContext.sharedRuleCount, 'shared rule', 'shared rules'),
          formatCountLabel(checkpointDocument.projectContext.providerSourceCount, 'provider source', 'provider sources'),
        ].join(' · ')
      : 'No shared project context snapshot';

    const workflowSummary = checkpointDocument.projectWorkflows
      ? formatCountLabel(checkpointDocument.projectWorkflows.workflowCount, 'workflow', 'workflows')
      : 'No workflow snapshot';

    const teamContextSummary = checkpointDocument.projectTeamContext
      ? [
          formatCountLabel(checkpointDocument.projectTeamContext.spaceCount, 'shared space', 'shared spaces'),
          formatCountLabel(checkpointDocument.projectTeamContext.sharedRuleCount, 'shared rule', 'shared rules'),
          formatCountLabel(checkpointDocument.projectTeamContext.workflowCount, 'workflow', 'workflows'),
        ].join(' · ')
      : 'No team context snapshot';

    const confirm = document.createElement('div');
    confirm.className = 'checkpoint-restore-confirm';

    const intro = document.createElement('div');
    intro.className = 'checkpoint-restore-confirm-copy';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'checkpoint-restore-confirm-kicker shell-kicker';
    eyebrow.textContent = 'Checkpoint restore';
    intro.appendChild(eyebrow);

    const title = document.createElement('div');
    title.className = 'checkpoint-restore-confirm-title';
    title.textContent = checkpointDocument.label;
    intro.appendChild(title);

    const description = document.createElement('div');
    description.className = 'checkpoint-restore-confirm-description';
    description.textContent = restoreSummaryText;
    intro.appendChild(description);
    confirm.appendChild(intro);

    const stats = document.createElement('div');
    stats.className = 'checkpoint-restore-confirm-stats';
    for (const stat of [
      { label: 'Saved', value: new Date(checkpointDocument.createdAt).toLocaleString() },
      { label: 'Sessions', value: formatCountLabel(checkpointDocument.sessionCount, 'session', 'sessions') },
      { label: 'Changed files', value: String(checkpointDocument.changedFileCount) },
    ]) {
      const statCard = document.createElement('div');
      statCard.className = 'checkpoint-restore-confirm-stat';

      const statLabel = document.createElement('div');
      statLabel.className = 'checkpoint-restore-confirm-stat-label';
      statLabel.textContent = stat.label;

      const statValue = document.createElement('div');
      statValue.className = 'checkpoint-restore-confirm-stat-value';
      statValue.textContent = stat.value;

      statCard.appendChild(statLabel);
      statCard.appendChild(statValue);
      stats.appendChild(statCard);
    }
    confirm.appendChild(stats);

    const facts = document.createElement('div');
    facts.className = 'checkpoint-restore-confirm-facts';
    appendCheckpointRestoreFact(
      facts,
      'Restores',
      sessionParts.length > 0 ? sessionParts.join(', ') : 'Saved session state',
    );
    appendCheckpointRestoreFact(facts, 'Surface', surfaceSummary);
    appendCheckpointRestoreFact(facts, 'Git', gitSummary);
    appendCheckpointRestoreFact(facts, 'Shared context', contextSummary);
    appendCheckpointRestoreFact(facts, 'Team context', teamContextSummary);
    appendCheckpointRestoreFact(facts, 'Workflows', workflowSummary);
    appendCheckpointRestoreFact(
      facts,
      'Restore modes',
      'Additive keeps your current work open. Replace swaps the current layout for this checkpoint.',
    );
    confirm.appendChild(facts);

    if (checkpointDocument.git.changedFiles.length > 0) {
      const changedFiles = checkpointDocument.git.changedFiles.slice(0, 5);
      const fileBlock = document.createElement('div');
      fileBlock.className = 'checkpoint-restore-confirm-file-block';

      const fileTitle = document.createElement('div');
      fileTitle.className = 'checkpoint-restore-confirm-fact-label';
      fileTitle.textContent = 'Changed files snapshot';
      fileBlock.appendChild(fileTitle);

      const fileList = document.createElement('div');
      fileList.className = 'checkpoint-restore-confirm-file-list';

      for (const file of changedFiles) {
        const fileItem = document.createElement('button');
        fileItem.className = 'checkpoint-restore-confirm-file-item';
        fileItem.type = 'button';

        const status = document.createElement('span');
        status.className = 'checkpoint-restore-confirm-file-status';
        status.textContent = `${file.status} · ${file.area}`;

        const filePath = document.createElement('span');
        filePath.className = 'checkpoint-restore-confirm-file-path';
        filePath.textContent = file.path;

        fileItem.addEventListener('click', () => {
          const resolvedPath = resolveProjectFilePath(projectPath, file.path);
          if (file.area === 'untracked') {
            appState.addFileReaderSession(projectId, resolvedPath);
          } else {
            appState.addDiffViewerSession(projectId, resolvedPath, file.area, checkpointDocument.project.path);
          }
          closeModal();
          modal.classList.remove('modal-wide');
        });

        fileItem.appendChild(status);
        fileItem.appendChild(filePath);
        fileList.appendChild(fileItem);
      }

      if (checkpointDocument.git.changedFiles.length > changedFiles.length) {
        const more = document.createElement('div');
        more.className = 'checkpoint-restore-confirm-file-more';
        more.textContent = `+${checkpointDocument.git.changedFiles.length - changedFiles.length} more saved file change${checkpointDocument.git.changedFiles.length - changedFiles.length === 1 ? '' : 's'}`;
        fileList.appendChild(more);
      }

      fileBlock.appendChild(fileList);
      confirm.appendChild(fileBlock);
    }

    return confirm;
  }

  function renderProjectContextSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Project context',
      'Calder discovers provider-native memory and shared project rules for the active repo without replacing each CLI tool’s own history.',
    );

    const shell = document.createElement('div');
    shell.className = 'context-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'context-discovery-empty';
      empty.textContent = 'Open a project to inspect provider-native memory and shared project rules.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'context-discovery-actions';

    const starterBtn = document.createElement('button');
    starterBtn.className = 'context-discovery-action-btn';
    starterBtn.type = 'button';
    starterBtn.textContent = 'Create starter files';
    starterBtn.addEventListener('click', async () => {
      starterBtn.disabled = true;
      starterBtn.textContent = 'Creating…';
      try {
        const result = await window.calder.context.createStarterFiles(project.path);
        appState.setProjectContext(project.id, result.state);
        renderSection('providers');
      } catch {
        starterBtn.disabled = false;
        starterBtn.textContent = 'Create starter files';
      }
    });
    actions.appendChild(starterBtn);

    const createRuleBtn = document.createElement('button');
    createRuleBtn.className = 'context-discovery-action-btn';
    createRuleBtn.type = 'button';
    createRuleBtn.textContent = 'New shared rule';
    createRuleBtn.addEventListener('click', () => {
      showModal('New Shared Rule', [
        {
          label: 'Rule name',
          id: 'context-rule-name',
          placeholder: 'Review checklist',
          defaultValue: 'Review checklist',
        },
        {
          label: 'Priority',
          id: 'context-rule-priority',
          type: 'select',
          defaultValue: 'soft',
          options: [
            { value: 'soft', label: 'Soft guideline' },
            { value: 'hard', label: 'Hard requirement' },
          ],
        },
      ], async (values) => {
        const title = values['context-rule-name']?.trim() ?? '';
        if (!title) {
          setModalError('context-rule-name', 'Rule name is required');
          return;
        }

        const priority = values['context-rule-priority'] === 'hard' ? 'hard' : 'soft';
        const result = await window.calder.context.createSharedRule(project.path, title, priority);
        appState.setProjectContext(project.id, result.state);
        closeModal();
        modal.classList.remove('modal-wide');
        void window.calder.git.openInEditor(project.path, result.relativePath);
      });
    });
    actions.appendChild(createRuleBtn);
    shell.appendChild(actions);

    const projectContext = project.projectContext;
    if (!projectContext || projectContext.sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'context-discovery-empty';
      empty.textContent = 'No provider-native memory or shared project rules have been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const providerMemoryCount = projectContext.sources.filter((source) => source.provider !== 'shared').length;
    const summary = document.createElement('div');
    summary.className = 'context-discovery-summary';
    summary.innerHTML = `
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Project</span>
        <span class="context-discovery-stat-value">${project.name}</span>
      </div>
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Provider memory</span>
        <span class="context-discovery-stat-value">${providerMemoryCount}</span>
      </div>
      <div class="context-discovery-stat">
        <span class="context-discovery-stat-label">Shared rules</span>
        <span class="context-discovery-stat-value">${projectContext.sharedRuleCount}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'context-discovery-list';
    for (const source of projectContext.sources.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'context-discovery-item';

      const header = document.createElement('div');
      header.className = 'context-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'context-discovery-item-title';
      title.textContent = source.displayName;
      header.appendChild(title);

      const status = document.createElement('div');
      status.className = 'context-discovery-item-status';

      const itemActions = document.createElement('div');
      itemActions.className = 'context-discovery-item-actions';

      const relativePath = toProjectRelativeContextPath(project.path, source.path);
      const previewBtn = document.createElement('button');
      previewBtn.className = 'context-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, source.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'context-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      const meta = document.createElement('div');
      meta.className = 'context-discovery-item-meta';
      const scopeLabel = source.provider === 'shared' ? 'Shared rule' : `${source.provider} memory`;
      meta.textContent = source.summary
        ? `${scopeLabel} · ${source.summary}`
        : scopeLabel;

      if (source.provider === 'shared' && source.kind === 'rules') {
        if (relativePath) {
          const renameBtn = document.createElement('button');
          renameBtn.className = 'context-discovery-item-btn';
          renameBtn.type = 'button';
          renameBtn.textContent = 'Rename';
          renameBtn.addEventListener('click', () => {
            const initialTitle = source.summary?.trim() || source.displayName.replace(/\.(hard|soft)\.md$/i, '');
            const currentPriority = source.priority === 'hard' ? 'hard' : 'soft';
            showModal('Rename Shared Rule', [
              {
                label: 'Rule name',
                id: 'context-rule-rename-name',
                placeholder: 'Review checklist',
                defaultValue: initialTitle,
              },
              {
                label: 'Priority',
                id: 'context-rule-rename-priority',
                type: 'select',
                defaultValue: currentPriority,
                options: [
                  { value: 'soft', label: 'Soft guideline' },
                  { value: 'hard', label: 'Hard requirement' },
                ],
              },
            ], async (values) => {
              const title = values['context-rule-rename-name']?.trim() ?? '';
              if (!title) {
                setModalError('context-rule-rename-name', 'Rule name is required');
                return;
              }

              const priority = values['context-rule-rename-priority'] === 'hard' ? 'hard' : 'soft';
              const result = await window.calder.context.renameSharedRule(project.path, relativePath, title, priority);
              appState.setProjectContext(project.id, result.state);
              closeModal();
              modal.classList.remove('modal-wide');
              void window.calder.git.openInEditor(project.path, result.relativePath);
            });
          });
          itemActions.appendChild(renameBtn);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'context-discovery-item-btn';
          deleteBtn.type = 'button';
          deleteBtn.textContent = 'Delete';
          deleteBtn.addEventListener('click', async () => {
            if (!confirm(`Delete shared rule "${source.displayName}"?`)) {
              return;
            }
            const result = await window.calder.context.deleteSharedRule(project.path, relativePath);
            appState.setProjectContext(project.id, result.state);
            renderSection('providers');
          });
          itemActions.appendChild(deleteBtn);
        }

        const toggle = document.createElement('label');
        toggle.className = 'context-discovery-toggle';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = source.enabled !== false;

        const label = document.createElement('span');
        label.textContent = checkbox.checked ? 'Active in prompts' : 'Muted';

        checkbox.addEventListener('change', () => {
          const nextState = {
            ...projectContext,
            sources: projectContext.sources.map((entry) => (
              entry.id === source.id
                ? { ...entry, enabled: checkbox.checked }
                : entry
            )),
          };
          appState.setProjectContext(project.id, nextState);
          renderSection('providers');
        });

        toggle.appendChild(checkbox);
        toggle.appendChild(label);
        status.appendChild(toggle);
      } else {
        status.textContent = 'Provider memory';
      }

      itemActions.appendChild(status);
      if (itemActions.childElementCount > 0) {
        header.appendChild(itemActions);
      }
      item.appendChild(header);
      item.appendChild(meta);
      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function renderProjectGovernanceSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Governance policies',
      'Define repo-local guardrails for write, network, MCP, and budget decisions before Calder starts enforcing them.',
    );

    const shell = document.createElement('div');
    shell.className = 'governance-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'governance-discovery-empty';
      empty.textContent = 'Open a project to inspect or create repo-local governance policies.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'governance-discovery-actions';

    const starterBtn = document.createElement('button');
    starterBtn.className = 'governance-discovery-action-btn';
    starterBtn.type = 'button';
    starterBtn.textContent = 'Create starter policy';
    starterBtn.addEventListener('click', async () => {
      starterBtn.disabled = true;
      starterBtn.textContent = 'Creating…';
      try {
        const result = await window.calder.governance.createStarterPolicy(project.path);
        appState.setProjectGovernance(project.id, result.state);
        renderSection('providers');
      } catch {
        starterBtn.disabled = false;
        starterBtn.textContent = 'Create starter policy';
      }
    });
    actions.appendChild(starterBtn);
    shell.appendChild(actions);

    const policy = project.projectGovernance?.policy;
    if (!policy) {
      const empty = document.createElement('div');
      empty.className = 'governance-discovery-empty';
      empty.textContent = 'No governance policy has been discovered for this repo yet. Start in advisory mode, tune the policy, then enforce when the team is ready.';
      shell.appendChild(empty);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'governance-discovery-summary';
    summary.innerHTML = `
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Mode</span>
        <span class="governance-discovery-stat-value">${policy.mode}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Tool policy</span>
        <span class="governance-discovery-stat-value">${policy.toolPolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Write policy</span>
        <span class="governance-discovery-stat-value">${policy.writePolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Network policy</span>
        <span class="governance-discovery-stat-value">${policy.networkPolicy}</span>
      </div>
      <div class="governance-discovery-stat">
        <span class="governance-discovery-stat-label">Provider profiles</span>
        <span class="governance-discovery-stat-value">${policy.providerProfileCount}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'governance-discovery-list';

    const item = document.createElement('div');
    item.className = 'governance-discovery-item';

    const header = document.createElement('div');
    header.className = 'governance-discovery-item-header';

    const title = document.createElement('div');
    title.className = 'governance-discovery-item-title';
    title.textContent = policy.displayName;
    header.appendChild(title);

    const itemActions = document.createElement('div');
    itemActions.className = 'governance-discovery-item-actions';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'governance-discovery-item-btn';
    previewBtn.type = 'button';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => {
      appState.addFileReaderSession(project.id, policy.path);
      closeModal();
      modal.classList.remove('modal-wide');
    });
    itemActions.appendChild(previewBtn);

    const relativePath = toProjectRelativeContextPath(project.path, policy.path);
    if (relativePath) {
      const openBtn = document.createElement('button');
      openBtn.className = 'governance-discovery-item-btn';
      openBtn.type = 'button';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', async () => {
        openBtn.disabled = true;
        try {
          await window.calder.git.openInEditor(project.path, relativePath);
        } finally {
          openBtn.disabled = false;
        }
      });
      itemActions.appendChild(openBtn);
    }

    const status = document.createElement('div');
    status.className = 'governance-discovery-item-status';
    status.textContent = `MCP allowlist: ${policy.mcpAllowlistCount} · Provider profiles: ${policy.providerProfileCount}`;
    itemActions.appendChild(status);

    header.appendChild(itemActions);
    item.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'governance-discovery-item-meta';
    const budget = typeof policy.budgetLimitUsd === 'number'
      ? ` · Budget limit: $${policy.budgetLimitUsd}`
      : '';
    meta.textContent = `${policy.summary}${budget}`;
    item.appendChild(meta);

    list.appendChild(item);
    shell.appendChild(list);
  }

  function renderProjectWorkflowSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Workflow templates',
      'Keep reusable workflows in the repo so repeated tasks start from the same playbook instead of a blank prompt.',
    );

    const shell = document.createElement('div');
    shell.className = 'workflow-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'workflow-discovery-empty';
      empty.textContent = 'Open a project to inspect and manage reusable workflows for this repo.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'workflow-discovery-actions';

    const starterBtn = document.createElement('button');
    starterBtn.className = 'workflow-discovery-action-btn';
    starterBtn.type = 'button';
    starterBtn.textContent = 'Create starter workflows';
    starterBtn.addEventListener('click', async () => {
      starterBtn.disabled = true;
      starterBtn.textContent = 'Creating…';
      try {
        const result = await window.calder.workflow.createStarterFiles(project.path);
        appState.setProjectWorkflows(project.id, result.state);
        renderSection('providers');
      } catch {
        starterBtn.disabled = false;
        starterBtn.textContent = 'Create starter workflows';
      }
    });
    actions.appendChild(starterBtn);

    const createWorkflowBtn = document.createElement('button');
    createWorkflowBtn.className = 'workflow-discovery-action-btn';
    createWorkflowBtn.type = 'button';
    createWorkflowBtn.textContent = 'New workflow';
    createWorkflowBtn.addEventListener('click', () => {
      showModal('New Workflow', [
        {
          label: 'Workflow name',
          id: 'workflow-name',
          placeholder: 'Incident triage',
          defaultValue: 'Incident triage',
        },
      ], async (values) => {
        const title = values['workflow-name']?.trim() ?? '';
        if (!title) {
          setModalError('workflow-name', 'Workflow name is required');
          return;
        }

        const result = await window.calder.workflow.createFile(project.path, title);
        appState.setProjectWorkflows(project.id, result.state);
        closeModal();
        modal.classList.remove('modal-wide');
        void window.calder.git.openInEditor(project.path, result.relativePath);
      });
    });
    actions.appendChild(createWorkflowBtn);
    shell.appendChild(actions);

    const projectWorkflows = project.projectWorkflows;
    if (!projectWorkflows || projectWorkflows.workflows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'workflow-discovery-empty';
      empty.textContent = 'No reusable workflows have been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'workflow-discovery-summary';
    summary.innerHTML = `
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Project</span>
        <span class="workflow-discovery-stat-value">${project.name}</span>
      </div>
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Workflows</span>
        <span class="workflow-discovery-stat-value">${projectWorkflows.workflows.length}</span>
      </div>
      <div class="workflow-discovery-stat">
        <span class="workflow-discovery-stat-label">Mode</span>
        <span class="workflow-discovery-stat-value">Repo playbooks</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'workflow-discovery-list';
    for (const workflow of projectWorkflows.workflows.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'workflow-discovery-item';

      const header = document.createElement('div');
      header.className = 'workflow-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'workflow-discovery-item-title';
      title.textContent = workflow.displayName;
      header.appendChild(title);

      const status = document.createElement('div');
      status.className = 'workflow-discovery-item-status';
      status.textContent = 'Reusable workflow';

      const itemActions = document.createElement('div');
      itemActions.className = 'workflow-discovery-item-actions';

      const runBtn = document.createElement('button');
      runBtn.className = 'workflow-discovery-item-btn';
      runBtn.type = 'button';
      runBtn.textContent = 'Run';
      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        try {
          const workflowDocument = await window.calder.workflow.readFile(project.path, workflow.path);
          appState.launchWorkflowSession(project.id, workflowDocument);
          closeModal();
          modal.classList.remove('modal-wide');
        } finally {
          runBtn.disabled = false;
        }
      });
      itemActions.appendChild(runBtn);

      const previewBtn = document.createElement('button');
      previewBtn.className = 'workflow-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, workflow.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      const relativePath = toProjectRelativeContextPath(project.path, workflow.path);
      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'workflow-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      itemActions.appendChild(status);
      if (itemActions.childElementCount > 0) {
        header.appendChild(itemActions);
      }
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'workflow-discovery-item-meta';
      meta.textContent = workflow.summary
        ? `Reusable workflow · ${workflow.summary}`
        : 'Reusable workflow';
      item.appendChild(meta);

      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function renderProjectTeamContextSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Team context',
      'Keep repo-local team spaces, shared rules, and reusable workflows visible so every CLI starts from the same collaboration map.',
    );

    const shell = document.createElement('div');
    shell.className = 'team-context-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'team-context-discovery-empty';
      empty.textContent = 'Open a project to inspect shared team context spaces.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'team-context-discovery-actions';

    const starterBtn = document.createElement('button');
    starterBtn.className = 'team-context-discovery-action-btn';
    starterBtn.type = 'button';
    starterBtn.textContent = 'Create starter spaces';
    starterBtn.addEventListener('click', async () => {
      starterBtn.disabled = true;
      try {
        const result = await window.calder.teamContext.createStarterFiles(project.path);
        appState.setProjectTeamContext(project.id, result.state);
        renderSection('providers');
      } finally {
        starterBtn.disabled = false;
      }
    });
    actions.appendChild(starterBtn);

    const createSpaceBtn = document.createElement('button');
    createSpaceBtn.className = 'team-context-discovery-action-btn';
    createSpaceBtn.type = 'button';
    createSpaceBtn.textContent = 'New shared space';
    createSpaceBtn.addEventListener('click', () => {
      showModal('New Shared Team Space', [
        {
          label: 'Space title',
          id: 'team-context-title',
          placeholder: 'Frontend alignment',
          defaultValue: 'Team Space',
        },
      ], async (values) => {
        const title = values['team-context-title']?.trim() ?? '';
        if (!title) {
          setModalError('team-context-title', 'Space title is required');
          return;
        }

        const result = await window.calder.teamContext.createSpace(project.path, title);
        appState.setProjectTeamContext(project.id, result.state);
        closeModal();
        modal.classList.remove('modal-wide');

        const relativePath = toProjectRelativeContextPath(project.path, `${project.path}/${result.relativePath}`);
        if (relativePath) {
          await window.calder.git.openInEditor(project.path, relativePath);
        }
      });
    });
    actions.appendChild(createSpaceBtn);
    shell.appendChild(actions);

    const projectTeamContext = project.projectTeamContext;
    if (!projectTeamContext || (projectTeamContext.spaces.length === 0 && projectTeamContext.sharedRuleCount === 0 && projectTeamContext.workflowCount === 0)) {
      const empty = document.createElement('div');
      empty.className = 'team-context-discovery-empty';
      empty.textContent = 'No shared team context has been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const summary = document.createElement('div');
    summary.className = 'team-context-discovery-summary';
    summary.innerHTML = `
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Spaces</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.spaces.length}</span>
      </div>
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Shared rules</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.sharedRuleCount}</span>
      </div>
      <div class="team-context-discovery-stat">
        <span class="team-context-discovery-stat-label">Workflows</span>
        <span class="team-context-discovery-stat-value">${projectTeamContext.workflowCount}</span>
      </div>
    `;
    shell.appendChild(summary);

    if (projectTeamContext.spaces.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'team-context-discovery-empty';
      empty.textContent = 'Shared rules or workflows exist, but no team context spaces have been created yet.';
      shell.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'team-context-discovery-list';
    for (const space of projectTeamContext.spaces.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'team-context-discovery-item';

      const header = document.createElement('div');
      header.className = 'team-context-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'team-context-discovery-item-title';
      title.textContent = space.displayName;
      header.appendChild(title);

      const itemActions = document.createElement('div');
      itemActions.className = 'team-context-discovery-item-actions';

      const status = document.createElement('div');
      status.className = 'team-context-discovery-item-status';
      status.textContent = `${space.linkedRuleCount} rule${space.linkedRuleCount === 1 ? '' : 's'} · ${space.linkedWorkflowCount} workflow${space.linkedWorkflowCount === 1 ? '' : 's'}`;

      const previewBtn = document.createElement('button');
      previewBtn.className = 'team-context-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, space.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      const relativePath = toProjectRelativeContextPath(project.path, space.path);
      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'team-context-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      itemActions.appendChild(status);
      header.appendChild(itemActions);
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'team-context-discovery-item-meta';
      meta.textContent = space.summary
        ? `Shared team space · ${space.summary}`
        : 'Shared team space';
      item.appendChild(meta);

      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function renderProjectPreviewCenterSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Preview center',
      'Spot local preview targets, open them in Live View, and jump straight to the CLI or workspace shell when you need logs.',
    );

    const shell = document.createElement('div');
    shell.className = 'preview-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'preview-discovery-empty';
      empty.textContent = 'Open a project to inspect local preview targets and connect them to Live View.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'preview-discovery-actions';

    const focusCliBtn = document.createElement('button');
    focusCliBtn.className = 'preview-discovery-action-btn';
    focusCliBtn.type = 'button';
    focusCliBtn.textContent = 'Focus CLI Surface';
    focusCliBtn.addEventListener('click', () => {
      focusCliPreviewSurface(project.id);
      closeModal();
      modal.classList.remove('modal-wide');
    });
    actions.appendChild(focusCliBtn);

    const openShellBtn = document.createElement('button');
    openShellBtn.className = 'preview-discovery-action-btn';
    openShellBtn.type = 'button';
    openShellBtn.textContent = 'Open workspace shell';
    openShellBtn.addEventListener('click', () => {
      openWorkspaceShellLogs(project.id);
      closeModal();
      modal.classList.remove('modal-wide');
    });
    actions.appendChild(openShellBtn);

    const restartRuntimeBtn = document.createElement('button');
    restartRuntimeBtn.className = 'preview-discovery-action-btn';
    restartRuntimeBtn.type = 'button';
    restartRuntimeBtn.textContent = 'Restart preview runtime';
    restartRuntimeBtn.addEventListener('click', async () => {
      restartRuntimeBtn.disabled = true;
      restartRuntimeBtn.textContent = 'Restarting…';
      const result = await restartPreviewRuntime(project.id);
      if (result.ok) {
        focusCliPreviewSurface(project.id);
        openWorkspaceShellLogs(project.id);
        closeModal();
        modal.classList.remove('modal-wide');
      } else {
        restartRuntimeBtn.disabled = false;
        restartRuntimeBtn.textContent = 'Restart failed';
      }
    });
    actions.appendChild(restartRuntimeBtn);

    shell.appendChild(actions);

    const surface = project.surface;
    const cliRuntime = surface?.cli?.runtime;
    const runtimeHealth = describePreviewRuntimeHealth(project.id);
    const activeSurfaceLabel = surface?.kind === 'cli' ? 'CLI Surface' : 'Live View';

    const summary = document.createElement('div');
    summary.className = 'preview-discovery-summary';
    summary.innerHTML = `
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Project</span>
        <span class="preview-discovery-stat-value">${project.name}</span>
      </div>
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Active surface</span>
        <span class="preview-discovery-stat-value">${activeSurfaceLabel}</span>
      </div>
      <div class="preview-discovery-stat">
        <span class="preview-discovery-stat-label">Runtime health</span>
        <span class="preview-discovery-stat-value">${runtimeHealth.statusLabel}</span>
      </div>
    `;
    shell.appendChild(summary);

    const health = document.createElement('div');
    health.className = 'preview-discovery-health';
    health.dataset.tone = runtimeHealth.tone;

    const healthHeader = document.createElement('div');
    healthHeader.className = 'preview-discovery-health-header';

    const healthStatus = document.createElement('div');
    healthStatus.className = 'preview-discovery-health-status';
    healthStatus.textContent = runtimeHealth.statusLabel;
    healthHeader.appendChild(healthStatus);

    const healthDetail = document.createElement('div');
    healthDetail.className = 'preview-discovery-health-detail';
    healthDetail.textContent = runtimeHealth.detail;
    healthHeader.appendChild(healthDetail);

    health.appendChild(healthHeader);

    if (runtimeHealth.lastExitLabel || runtimeHealth.lastErrorLabel) {
      const facts = document.createElement('div');
      facts.className = 'preview-discovery-health-facts';

      if (runtimeHealth.lastExitLabel) {
        const exit = document.createElement('div');
        exit.className = 'preview-discovery-health-fact';
        exit.textContent = `Last exit: ${runtimeHealth.lastExitLabel}`;
        facts.appendChild(exit);
      }

      if (runtimeHealth.lastErrorLabel) {
        const error = document.createElement('div');
        error.className = 'preview-discovery-health-fact';
        error.textContent = `Last error: ${runtimeHealth.lastErrorLabel}`;
        facts.appendChild(error);
      }

      health.appendChild(facts);
    } else if (cliRuntime?.cwd) {
      const cwd = document.createElement('div');
      cwd.className = 'preview-discovery-health-fact';
      cwd.textContent = `Runtime cwd: ${cliRuntime.cwd}`;
      health.appendChild(cwd);
    }

    shell.appendChild(health);

    const list = document.createElement('div');
    list.className = 'preview-discovery-list';
    shell.appendChild(list);

    const loading = document.createElement('div');
    loading.className = 'preview-discovery-empty';
    loading.textContent = 'Scanning local preview targets…';
    list.appendChild(loading);

    void window.calder.browser.listLocalTargets().then((targets) => {
      if (!list.isConnected) return;
      list.innerHTML = '';

      if (targets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'preview-discovery-empty';
        empty.textContent = 'No local preview targets are responding right now. Start a dev server and it will show up here.';
        list.appendChild(empty);
        return;
      }

      for (const target of targets) {
        const item = document.createElement('div');
        item.className = 'preview-discovery-item';

        const header = document.createElement('div');
        header.className = 'preview-discovery-item-header';

        const copy = document.createElement('div');
        copy.className = 'preview-discovery-item-copy';

        const title = document.createElement('div');
        title.className = 'preview-discovery-item-title';
        title.textContent = target.label;

        const meta = document.createElement('div');
        meta.className = 'preview-discovery-item-meta';
        meta.textContent = target.meta ? `${target.meta} · ${target.url}` : target.url;

        copy.appendChild(title);
        copy.appendChild(meta);
        header.appendChild(copy);

        const itemActions = document.createElement('div');
        itemActions.className = 'preview-discovery-item-actions';

        const openLiveViewBtn = document.createElement('button');
        openLiveViewBtn.className = 'preview-discovery-item-btn';
        openLiveViewBtn.type = 'button';
        openLiveViewBtn.textContent = 'Open in Live View';
        openLiveViewBtn.addEventListener('click', () => {
          openPreviewTargetInLiveView(project.id, target.url);
          closeModal();
          modal.classList.remove('modal-wide');
        });
        itemActions.appendChild(openLiveViewBtn);

        header.appendChild(itemActions);
        item.appendChild(header);
        list.appendChild(item);
      }
    }).catch(() => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'preview-discovery-empty';
      empty.textContent = 'Preview discovery is unavailable right now. You can still open the workspace shell and check logs manually.';
      list.appendChild(empty);
    });
  }

  function renderProjectReviewSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Review findings',
      'Keep saved PR review notes close to the workspace, preview them quickly, and send the next fix pass straight into the selected session.',
    );

    const shell = document.createElement('div');
    shell.className = 'review-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'review-discovery-empty';
      empty.textContent = 'Open a project to manage saved PR review notes.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'review-discovery-actions';

    const createBtn = document.createElement('button');
    createBtn.className = 'review-discovery-action-btn';
    createBtn.type = 'button';
    createBtn.textContent = 'New findings file';
    createBtn.addEventListener('click', () => {
      showModal('New Review Findings', [
        {
          label: 'Findings title',
          id: 'review-title',
          placeholder: 'PR 42 Findings',
          defaultValue: 'PR Review Findings',
        },
      ], async (values) => {
        const title = values['review-title']?.trim() ?? '';
        if (!title) {
          setModalError('review-title', 'Findings title is required');
          return;
        }

        const result = await window.calder.review.createFile(project.path, title);
        appState.setProjectReviews(project.id, result.state);
        closeModal();
        modal.classList.remove('modal-wide');

        const relativePath = toProjectRelativeContextPath(project.path, `${project.path}/${result.relativePath}`);
        if (relativePath) {
          await window.calder.git.openInEditor(project.path, relativePath);
        }
      });
    });
    actions.appendChild(createBtn);
    shell.appendChild(actions);

    const projectReviews = project.projectReviews;
    if (!projectReviews || projectReviews.reviews.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'review-discovery-empty';
      empty.textContent = 'No saved review findings have been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const selectedFixSession = appState.resolveSurfaceTargetSession(project.id);
    const summary = document.createElement('div');
    summary.className = 'review-discovery-summary';
    summary.innerHTML = `
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Project</span>
        <span class="review-discovery-stat-value">${project.name}</span>
      </div>
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Findings</span>
        <span class="review-discovery-stat-value">${projectReviews.reviews.length}</span>
      </div>
      <div class="review-discovery-stat">
        <span class="review-discovery-stat-label">Fix target</span>
        <span class="review-discovery-stat-value">${selectedFixSession?.name ?? 'No CLI session'}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'review-discovery-list';
    for (const review of projectReviews.reviews.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'review-discovery-item';

      const header = document.createElement('div');
      header.className = 'review-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'review-discovery-item-title';
      title.textContent = review.displayName;
      header.appendChild(title);

      const itemActions = document.createElement('div');
      itemActions.className = 'review-discovery-item-actions';

      const status = document.createElement('div');
      status.className = 'review-discovery-item-status';
      status.textContent = selectedFixSession
        ? `Selected: ${selectedFixSession.name}`
        : 'Open a CLI session first';

      const fixBtn = document.createElement('button');
      fixBtn.className = 'review-discovery-item-btn';
      fixBtn.type = 'button';
      fixBtn.textContent = 'Fix in selected session';
      fixBtn.disabled = !selectedFixSession;
      fixBtn.addEventListener('click', async () => {
        fixBtn.disabled = true;
        try {
          const reviewDocument = await window.calder.review.readFile(project.path, review.path);
          const result = await sendProjectReviewToSelectedSession(project.id, reviewDocument);
          if (!result.ok) {
            status.textContent = result.error ?? 'Unable to send findings.';
            return;
          }
          closeModal();
          modal.classList.remove('modal-wide');
        } finally {
          fixBtn.disabled = !selectedFixSession;
        }
      });
      itemActions.appendChild(fixBtn);

      const previewBtn = document.createElement('button');
      previewBtn.className = 'review-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, review.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      const relativePath = toProjectRelativeContextPath(project.path, review.path);
      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'review-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      itemActions.appendChild(status);
      header.appendChild(itemActions);
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'review-discovery-item-meta';
      meta.textContent = review.summary
        ? `Saved PR review notes · ${review.summary}`
        : 'Saved PR review notes';
      item.appendChild(meta);

      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function renderProjectBackgroundTaskSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Background agents',
      'Queue safe local work items in .calder/tasks, preview them, and take one over in the selected CLI session when you are ready.',
    );

    const shell = document.createElement('div');
    shell.className = 'task-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'task-discovery-empty';
      empty.textContent = 'Open a project to manage queued background tasks.';
      shell.appendChild(empty);
      return;
    }
    const projectPath = project.path;
    const projectId = project.id;

    const actions = document.createElement('div');
    actions.className = 'task-discovery-actions';

    function resolveArtifactPath(artifactPath: string): { fullPath: string; relativePath: string | null } {
      const isAbsolute = artifactPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(artifactPath);
      const normalizedProject = projectPath.replace(/[\\/]+$/, '');
      const fullPath = isAbsolute
        ? artifactPath
        : `${normalizedProject}/${artifactPath.replace(/^\.?[\\/]/, '').replace(/\\/g, '/')}`;
      return {
        fullPath,
        relativePath: toProjectRelativeContextPath(projectPath, fullPath),
      };
    }

    function showBackgroundTaskDetails(taskDocument: import('../../shared/types.js').ProjectBackgroundTaskDocument): void {
      showModal('Background Task Details', [], async () => {
        closeModal();
        modal.classList.remove('modal-wide');
      });

      const previousConfirmText = btnConfirm.textContent;
      const previousCancelText = btnCancel.textContent;
      btnConfirm.textContent = 'Close';
      btnCancel.textContent = 'Back';

      extendModalCleanup(() => {
        btnConfirm.textContent = previousConfirmText;
        btnCancel.textContent = previousCancelText;
      });

      const shell = document.createElement('div');
      shell.className = 'checkpoint-restore-confirm';

      const copy = document.createElement('div');
      copy.className = 'checkpoint-restore-confirm-copy';

      const title = document.createElement('div');
      title.className = 'checkpoint-restore-confirm-title';
      title.textContent = taskDocument.title;
      copy.appendChild(title);

      const description = document.createElement('div');
      description.className = 'checkpoint-restore-confirm-description';
      description.textContent = taskDocument.prompt;
      copy.appendChild(description);
      shell.appendChild(copy);

      const facts = document.createElement('div');
      facts.className = 'checkpoint-restore-confirm-facts';

      const statusFact = document.createElement('div');
      statusFact.className = 'checkpoint-restore-confirm-fact';
      statusFact.innerHTML = `
        <span class="checkpoint-restore-confirm-fact-label">Status</span>
        <span class="checkpoint-restore-confirm-fact-value">${taskDocument.status}</span>
      `;
      facts.appendChild(statusFact);

      if (taskDocument.handoff.trim()) {
        const handoffFact = document.createElement('div');
        handoffFact.className = 'checkpoint-restore-confirm-fact';
        handoffFact.innerHTML = `
          <span class="checkpoint-restore-confirm-fact-label">Handoff</span>
          <span class="checkpoint-restore-confirm-fact-value">${taskDocument.handoff}</span>
        `;
        facts.appendChild(handoffFact);
      }

      shell.appendChild(facts);

      if (taskDocument.artifacts.length > 0) {
        const artifactBlock = document.createElement('div');
        artifactBlock.className = 'checkpoint-restore-confirm-file-block';

        const artifactTitle = document.createElement('div');
        artifactTitle.className = 'checkpoint-restore-confirm-fact-label';
        artifactTitle.textContent = 'Artifacts';
        artifactBlock.appendChild(artifactTitle);

        const artifactList = document.createElement('div');
        artifactList.className = 'checkpoint-restore-confirm-file-list';

        for (const artifact of taskDocument.artifacts) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'checkpoint-restore-confirm-file-item';

          const pathEl = document.createElement('div');
          pathEl.className = 'checkpoint-restore-confirm-file-path';
          pathEl.textContent = artifact;
          item.appendChild(pathEl);

          item.addEventListener('click', async () => {
            const resolved = resolveArtifactPath(artifact);
            if (resolved.relativePath) {
              await window.calder.git.openInEditor(projectPath, resolved.relativePath);
            } else {
              appState.addFileReaderSession(projectId, resolved.fullPath);
            }
            closeModal();
            modal.classList.remove('modal-wide');
          });

          artifactList.appendChild(item);
        }

        artifactBlock.appendChild(artifactList);
        shell.appendChild(artifactBlock);
      }

      bodyEl.appendChild(shell);
    }

    const createBtn = document.createElement('button');
    createBtn.className = 'task-discovery-action-btn';
    createBtn.type = 'button';
    createBtn.textContent = 'New queued task';
    createBtn.addEventListener('click', () => {
      showModal('New Queued Task', [
        {
          label: 'Task title',
          id: 'task-title',
          placeholder: 'Audit onboarding flow',
          defaultValue: 'Queued Background Task',
        },
        {
          label: 'Task prompt',
          id: 'task-prompt',
          placeholder: 'Describe the work that should be picked up later',
        },
      ], async (values) => {
        const title = values['task-title']?.trim() ?? '';
        const prompt = values['task-prompt']?.trim() ?? '';
        if (!title) {
          setModalError('task-title', 'Task title is required');
          return;
        }
        if (!prompt) {
          setModalError('task-prompt', 'Task prompt is required');
          return;
        }

        const result = await window.calder.task.create(projectPath, title, prompt);
        appState.setProjectBackgroundTasks(projectId, result.state);
        closeModal();
        modal.classList.remove('modal-wide');

        const relativePath = toProjectRelativeContextPath(projectPath, `${projectPath}/${result.relativePath}`);
        if (relativePath) {
          await window.calder.git.openInEditor(projectPath, relativePath);
        }
      });
    });
    actions.appendChild(createBtn);
    shell.appendChild(actions);

    const projectBackgroundTasks = project.projectBackgroundTasks;
    if (!projectBackgroundTasks || projectBackgroundTasks.tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-discovery-empty';
      empty.textContent = 'No queued background tasks have been discovered for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const selectedTaskSession = appState.resolveSurfaceTargetSession(projectId);
    const summary = document.createElement('div');
    summary.className = 'task-discovery-summary';
    summary.innerHTML = `
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Queued</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.queuedCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Running</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.runningCount}</span>
      </div>
      <div class="task-discovery-stat">
        <span class="task-discovery-stat-label">Completed</span>
        <span class="task-discovery-stat-value">${projectBackgroundTasks.completedCount}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'task-discovery-list';
    for (const task of projectBackgroundTasks.tasks.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'task-discovery-item';

      const header = document.createElement('div');
      header.className = 'task-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'task-discovery-item-title';
      title.textContent = task.title;
      header.appendChild(title);

      const itemActions = document.createElement('div');
      itemActions.className = 'task-discovery-item-actions';

      const status = document.createElement('div');
      status.className = 'task-discovery-item-status';
      status.textContent = selectedTaskSession
        ? `Selected: ${selectedTaskSession.name}`
        : 'Open a CLI session first';

      const takeOverBtn = document.createElement('button');
      takeOverBtn.className = 'task-discovery-item-btn';
      takeOverBtn.type = 'button';
      takeOverBtn.textContent = 'Take over';
      takeOverBtn.disabled = !selectedTaskSession;
      takeOverBtn.addEventListener('click', async () => {
        takeOverBtn.disabled = true;
        try {
          const taskDocument = await window.calder.task.read(projectPath, task.path);
          const result = await sendProjectBackgroundTaskToSelectedSession(projectId, taskDocument);
          if (!result.ok) {
            status.textContent = result.error ?? 'Unable to send queued task.';
            return;
          }
          closeModal();
          modal.classList.remove('modal-wide');
        } finally {
          takeOverBtn.disabled = !selectedTaskSession;
        }
      });
      itemActions.appendChild(takeOverBtn);

      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'task-discovery-item-btn';
      resumeBtn.type = 'button';
      resumeBtn.textContent = 'Resume';
      resumeBtn.addEventListener('click', async () => {
        resumeBtn.disabled = true;
        try {
          const taskDocument = await window.calder.task.read(projectPath, task.path);
          const result = resumeProjectBackgroundTaskInNewSession(projectId, taskDocument);
          if (!result.ok) {
            status.textContent = result.error ?? 'Unable to resume task.';
            return;
          }
          closeModal();
          modal.classList.remove('modal-wide');
        } finally {
          resumeBtn.disabled = false;
        }
      });
      itemActions.appendChild(resumeBtn);

      const previewBtn = document.createElement('button');
      previewBtn.className = 'task-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, task.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      if (task.artifactCount > 0 || task.handoffSummary) {
        const artifactsBtn = document.createElement('button');
        artifactsBtn.className = 'task-discovery-item-btn';
        artifactsBtn.type = 'button';
        artifactsBtn.textContent = 'Artifacts';
        artifactsBtn.addEventListener('click', async () => {
          artifactsBtn.disabled = true;
          try {
            const taskDocument = await window.calder.task.read(project.path, task.path);
            showBackgroundTaskDetails(taskDocument);
          } finally {
            artifactsBtn.disabled = false;
          }
        });
        itemActions.appendChild(artifactsBtn);
      }

      const relativePath = toProjectRelativeContextPath(project.path, task.path);
      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'task-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      itemActions.appendChild(status);
      header.appendChild(itemActions);
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'task-discovery-item-meta';
      const artifactLabel = task.artifactCount === 1 ? '1 artifact' : `${task.artifactCount} artifacts`;
      meta.textContent = task.summary
        ? `${task.status} · ${artifactLabel} · ${task.summary}`
        : `${task.status} · ${artifactLabel}`;
      item.appendChild(meta);

      if (task.handoffSummary) {
        const handoff = document.createElement('div');
        handoff.className = 'task-discovery-item-meta';
        handoff.textContent = `Handoff: ${task.handoffSummary}`;
        item.appendChild(handoff);
      }

      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function renderProjectCheckpointSection(container: HTMLElement) {
    const card = appendSectionCard(
      container,
      'Recovery checkpoints',
      'Capture a safe working point with the current sessions, stage surface, git diff summary, and active project context so a risky turn is easier to unwind.',
    );

    const shell = document.createElement('div');
    shell.className = 'checkpoint-discovery-shell';
    card.appendChild(shell);

    const project = appState.activeProject;
    if (!project) {
      const empty = document.createElement('div');
      empty.className = 'checkpoint-discovery-empty';
      empty.textContent = 'Open a project to capture and manage recovery checkpoints.';
      shell.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'checkpoint-discovery-actions';

    const createBtn = document.createElement('button');
    createBtn.className = 'checkpoint-discovery-action-btn';
    createBtn.type = 'button';
    createBtn.textContent = 'Create checkpoint';
    createBtn.addEventListener('click', () => {
      showModal('New Checkpoint', [
        {
          label: 'Checkpoint label',
          id: 'checkpoint-label',
          placeholder: 'Before risky refactor',
          defaultValue: 'Manual checkpoint',
        },
      ], async (values) => {
        const label = values['checkpoint-label']?.trim() ?? '';
        if (!label) {
          setModalError('checkpoint-label', 'Checkpoint label is required');
          return;
        }

        const snapshot = {
          label,
          projectName: project.name,
          activeSessionId: project.activeSessionId,
          sessions: project.sessions.map((session) => ({
            id: session.id,
            name: session.name,
            type: session.type,
            providerId: session.providerId,
            args: session.args,
            cliSessionId: session.cliSessionId,
            browserTabUrl: session.browserTabUrl,
            browserTargetSessionId: session.browserTargetSessionId,
            diffFilePath: session.diffFilePath,
            diffArea: session.diffArea,
            worktreePath: session.worktreePath,
            fileReaderPath: session.fileReaderPath,
            fileReaderLine: session.fileReaderLine,
          })),
          surface: project.surface ? {
            kind: project.surface.kind,
            active: project.surface.active,
            targetSessionId: project.surface.targetSessionId,
            webUrl: project.surface.web?.url,
            webSessionId: project.surface.web?.sessionId,
            cliSelectedProfileId: project.surface.cli?.selectedProfileId,
            cliStatus: project.surface.cli?.runtime?.status,
          } : undefined,
          projectContext: project.projectContext ? {
            sharedRuleCount: project.projectContext.sharedRuleCount,
            providerSourceCount: project.projectContext.providerSourceCount,
          } : undefined,
          projectWorkflows: project.projectWorkflows ? {
            workflowCount: project.projectWorkflows.workflows.length,
          } : undefined,
          projectTeamContext: project.projectTeamContext ? {
            spaceCount: project.projectTeamContext.spaces.length,
            sharedRuleCount: project.projectTeamContext.sharedRuleCount,
            workflowCount: project.projectTeamContext.workflowCount,
          } : undefined,
        };

        const result = await window.calder.checkpoint.create(project.path, snapshot);
        appState.setProjectCheckpoints(project.id, result.state);
        closeModal();
        modal.classList.remove('modal-wide');
        renderSection('providers');
      });
    });
    actions.appendChild(createBtn);
    shell.appendChild(actions);

    const projectCheckpoints = project.projectCheckpoints;
    if (!projectCheckpoints || projectCheckpoints.checkpoints.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'checkpoint-discovery-empty';
      empty.textContent = 'No recovery checkpoints have been saved for this repo yet.';
      shell.appendChild(empty);
      return;
    }

    const latest = projectCheckpoints.checkpoints[0];
    const summary = document.createElement('div');
    summary.className = 'checkpoint-discovery-summary';
    summary.innerHTML = `
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Saved</span>
        <span class="checkpoint-discovery-stat-value">${projectCheckpoints.checkpoints.length}</span>
      </div>
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Latest</span>
        <span class="checkpoint-discovery-stat-value">${latest?.label ?? '—'}</span>
      </div>
      <div class="checkpoint-discovery-stat">
        <span class="checkpoint-discovery-stat-label">Changed files</span>
        <span class="checkpoint-discovery-stat-value">${latest?.changedFileCount ?? 0}</span>
      </div>
    `;
    shell.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'checkpoint-discovery-list';
    for (const checkpoint of projectCheckpoints.checkpoints.slice(0, 6)) {
      const item = document.createElement('div');
      item.className = 'checkpoint-discovery-item';

      const header = document.createElement('div');
      header.className = 'checkpoint-discovery-item-header';

      const title = document.createElement('div');
      title.className = 'checkpoint-discovery-item-title';
      title.textContent = checkpoint.label;
      header.appendChild(title);

      const itemActions = document.createElement('div');
      itemActions.className = 'checkpoint-discovery-item-actions';

      const previewBtn = document.createElement('button');
      previewBtn.className = 'checkpoint-discovery-item-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        appState.addFileReaderSession(project.id, checkpoint.path);
        closeModal();
        modal.classList.remove('modal-wide');
      });
      itemActions.appendChild(previewBtn);

      const relativePath = toProjectRelativeContextPath(project.path, checkpoint.path);
      if (relativePath) {
        const openBtn = document.createElement('button');
        openBtn.className = 'checkpoint-discovery-item-btn';
        openBtn.type = 'button';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', async () => {
          openBtn.disabled = true;
          try {
            await window.calder.git.openInEditor(project.path, relativePath);
          } finally {
            openBtn.disabled = false;
          }
        });
        itemActions.appendChild(openBtn);
      }

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'checkpoint-discovery-item-btn';
      restoreBtn.type = 'button';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', async () => {
        restoreBtn.disabled = true;
        try {
          const checkpointDocument = await window.calder.checkpoint.read(project.path, checkpoint.path);
          showModal('Restore Checkpoint', [
            {
              label: 'Restore mode',
              id: 'checkpoint-restore-mode',
              type: 'select',
              defaultValue: 'additive',
              options: [
                { value: 'additive', label: 'Keep current layout (additive)' },
                { value: 'replace', label: 'Replace current layout' },
              ],
            },
          ], async (values) => {
            const restoreMode = values['checkpoint-restore-mode'] === 'replace' ? 'replace' : 'additive';
            btnConfirm.disabled = true;
            btnCancel.disabled = true;
            try {
              appState.restoreProjectCheckpoint(project.id, checkpointDocument, restoreMode);
              closeModal();
              modal.classList.remove('modal-wide');
            } finally {
              btnConfirm.disabled = false;
              btnCancel.disabled = false;
            }
          });

          const previousConfirmText = btnConfirm.textContent;
          const previousCancelText = btnCancel.textContent;
          btnConfirm.textContent = 'Restore';
          btnCancel.textContent = 'Cancel';

          extendModalCleanup(() => {
            btnConfirm.textContent = previousConfirmText;
            btnCancel.textContent = previousCancelText;
            btnConfirm.disabled = false;
            btnCancel.disabled = false;
          });

          bodyEl.appendChild(buildCheckpointRestoreConfirm(project.id, project.path, checkpointDocument, checkpoint.restoreSummary));
          requestAnimationFrame(() => btnConfirm.focus());
        } finally {
          restoreBtn.disabled = false;
        }
      });
      itemActions.appendChild(restoreBtn);

      const status = document.createElement('div');
      status.className = 'checkpoint-discovery-item-status';
      status.textContent = `${checkpoint.sessionCount} session${checkpoint.sessionCount === 1 ? '' : 's'} · ${checkpoint.changedFileCount} changed file${checkpoint.changedFileCount === 1 ? '' : 's'}`;
      itemActions.appendChild(status);
      header.appendChild(itemActions);
      item.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'checkpoint-discovery-item-meta';
      meta.textContent = `${checkpoint.displayName} · ${new Date(checkpoint.createdAt).toLocaleString()}`;
      item.appendChild(meta);

      const restoreSummary = document.createElement('div');
      restoreSummary.className = 'checkpoint-discovery-item-restore-summary';
      restoreSummary.textContent = checkpoint.restoreSummary;
      item.appendChild(restoreSummary);

      list.appendChild(item);
    }

    shell.appendChild(list);
  }

  function countCustomizedShortcuts(): number {
    let count = 0;
    for (const [, shortcuts] of shortcutManager.getAll()) {
      for (const shortcut of shortcuts) {
        if (shortcutManager.hasOverride(shortcut.id)) count += 1;
      }
    }
    return count;
  }

  function cleanupRecorder() {
    if (activeRecorder) {
      activeRecorder.cleanup();
      activeRecorder = null;
    }
  }

  function cleanupAboutUpdateListeners() {
    if (aboutUpdateCleanup) {
      aboutUpdateCleanup();
      aboutUpdateCleanup = null;
    }
  }

  function renderSection(section: Section) {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    currentSection = section;
    content.innerHTML = '';
    content.scrollTop = 0;

    // Update active menu item
    for (const [id, item] of menuItems) {
      item.classList.toggle('active', id === section);
    }

    if (section === 'general') {
      appendSectionIntro(
        content,
        'Session',
        'Launch defaults',
        'Choose how Calder opens new work, how it names sessions, and which signals stay on while you code.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Language',
          value: appState.preferences.language === 'tr' ? 'Turkish' : 'English',
          note: 'Applies to the full Calder interface.',
        },
        {
          label: 'Default tool',
          value: appState.preferences.defaultProvider ?? 'claude',
          note: 'Used when a new session has no explicit provider.',
        },
        {
          label: 'History',
          value: appState.preferences.sessionHistoryEnabled ? 'On' : 'Off',
          note: 'Closed sessions can stay searchable in the run log.',
        },
        {
          label: 'Alerts',
          value: appState.preferences.notificationsDesktop ? 'Desktop' : 'In-app only',
          note: 'Sound and notification behavior stays local to this workspace.',
        },
      ]);
      // Default provider dropdown
      const providerRow = document.createElement('div');
      providerRow.className = 'modal-toggle-field';

      const providerLabel = document.createElement('label');
      providerLabel.textContent = 'Default coding tool';

      const currentDefault = appState.preferences.defaultProvider ?? 'claude';

      const buildProviderOptions = (snapshot: { providers: CliProviderMeta[]; availability: Map<ProviderId, boolean> }) =>
        snapshot.providers.map(provider => {
          const available = snapshot.availability.get(provider.id) ?? true;
          return {
            value: provider.id,
            label: available ? provider.displayName : `${provider.displayName} (not installed)`,
            disabled: !available,
          };
        });

      const buildProviderNote = (snapshot: { availability: Map<ProviderId, boolean> } | null, providerId: ProviderId): string => {
        if (!snapshot) return 'Calder falls back to the next installed tool if this one is missing.';
        if (snapshot.availability.get(providerId)) {
          return 'New sessions use this tool unless a workflow picks a different one.';
        }
        return 'This default is not installed on this Mac. Calder will fall back to the next installed tool until you install it.';
      };

      let snapshot = getProviderAvailabilitySnapshot();
      if (snapshot) {
        defaultProviderSelect = createCustomSelect('pref-default-provider', buildProviderOptions(snapshot), currentDefault);
      } else {
        defaultProviderSelect = createCustomSelect('pref-default-provider', [{ value: currentDefault, label: 'Loading…' }], currentDefault);
        loadProviderAvailability().then(() => {
          if (currentSection !== 'general') return;
          snapshot = getProviderAvailabilitySnapshot();
          if (snapshot) {
            if (defaultProviderSelect) defaultProviderSelect.destroy();
            defaultProviderSelect = createCustomSelect('pref-default-provider', buildProviderOptions(snapshot), currentDefault);
            providerRow.querySelector('.custom-select')?.remove();
            providerRow.appendChild(defaultProviderSelect.element);
            providerNote.textContent = buildProviderNote(snapshot, currentDefault);
          }
        });
      }

      const providerNote = document.createElement('div');
      providerNote.className = 'preferences-control-note';
      providerNote.textContent = buildProviderNote(snapshot, currentDefault);

      providerRow.appendChild(providerLabel);
      providerRow.appendChild(defaultProviderSelect.element);
      content.appendChild(providerRow);
      content.appendChild(providerNote);

      const languageRow = document.createElement('div');
      languageRow.className = 'modal-toggle-field';

      const languageLabel = document.createElement('label');
      languageLabel.textContent = 'Interface language';

      const currentLanguage = appState.preferences.language ?? 'en';
      languageSelect = createCustomSelect(
        'pref-language',
        [
          { value: 'en', label: 'English' },
          { value: 'tr', label: 'Turkish' },
        ],
        currentLanguage,
      );

      const languageNote = document.createElement('div');
      languageNote.className = 'preferences-control-note';
      languageNote.textContent = 'Language changes apply after the interface refreshes.';

      languageRow.appendChild(languageLabel);
      languageRow.appendChild(languageSelect.element);
      content.appendChild(languageRow);
      content.appendChild(languageNote);

      const row = document.createElement('div');
      row.className = 'modal-toggle-field';

      const label = document.createElement('label');
      label.htmlFor = 'pref-sound-on-waiting';
      label.textContent = 'Play sound when session finishes work';

      soundCheckbox = document.createElement('input');
      soundCheckbox.type = 'checkbox';
      soundCheckbox.id = 'pref-sound-on-waiting';
      soundCheckbox.checked = appState.preferences.soundOnSessionWaiting;

      row.appendChild(label);
      row.appendChild(soundCheckbox);
      content.appendChild(row);

      const notifRow = document.createElement('div');
      notifRow.className = 'modal-toggle-field';

      const notifLabel = document.createElement('label');
      notifLabel.htmlFor = 'pref-notifications-desktop';
      notifLabel.textContent = 'Desktop notifications when sessions need attention';

      notificationsCheckbox = document.createElement('input');
      notificationsCheckbox.type = 'checkbox';
      notificationsCheckbox.id = 'pref-notifications-desktop';
      notificationsCheckbox.checked = appState.preferences.notificationsDesktop;

      notifRow.appendChild(notifLabel);
      notifRow.appendChild(notificationsCheckbox);
      content.appendChild(notifRow);

      const historyRow = document.createElement('div');
      historyRow.className = 'modal-toggle-field';

      const historyLabel = document.createElement('label');
      historyLabel.htmlFor = 'pref-session-history';
      historyLabel.textContent = 'Record session history when sessions close';

      historyCheckbox = document.createElement('input');
      historyCheckbox.type = 'checkbox';
      historyCheckbox.id = 'pref-session-history';
      historyCheckbox.checked = appState.preferences.sessionHistoryEnabled;

      historyRow.appendChild(historyLabel);
      historyRow.appendChild(historyCheckbox);
      content.appendChild(historyRow);

      const insightsRow = document.createElement('div');
      insightsRow.className = 'modal-toggle-field';

      const insightsLabel = document.createElement('label');
      insightsLabel.htmlFor = 'pref-insights-enabled';
      insightsLabel.textContent = 'Show insight alerts';

      insightsCheckbox = document.createElement('input');
      insightsCheckbox.type = 'checkbox';
      insightsCheckbox.id = 'pref-insights-enabled';
      insightsCheckbox.checked = appState.preferences.insightsEnabled;

      insightsRow.appendChild(insightsLabel);
      insightsRow.appendChild(insightsCheckbox);
      content.appendChild(insightsRow);

      const autoTitleRow = document.createElement('div');
      autoTitleRow.className = 'modal-toggle-field';

      const autoTitleLabel = document.createElement('label');
      autoTitleLabel.htmlFor = 'pref-auto-title';
      autoTitleLabel.textContent = 'Auto-name sessions from conversation title';

      autoTitleCheckbox = document.createElement('input');
      autoTitleCheckbox.type = 'checkbox';
      autoTitleCheckbox.id = 'pref-auto-title';
      autoTitleCheckbox.checked = appState.preferences.autoTitleEnabled;

      autoTitleRow.appendChild(autoTitleLabel);
      autoTitleRow.appendChild(autoTitleCheckbox);
      content.appendChild(autoTitleRow);

    } else if (section === 'layout') {
      appendSectionIntro(
        content,
        'Workspace',
        'Stage layout',
        'Keep the left surface stable while deciding which support modules stay visible around active sessions.',
      );
      const views = appState.preferences.sidebarViews ?? { configSections: true, gitPanel: true, sessionHistory: true, costFooter: true };
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
      const toggles: Array<{ key: keyof typeof views; label: string; group: 'ops' | 'session' }> = [
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

      const checkboxes: Record<string, HTMLInputElement> = {};
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

        row.appendChild(label);
        row.appendChild(cb);
        if (toggle.group === 'ops') {
          opsCard.appendChild(row);
        } else {
          sessionDeckCard.appendChild(row);
        }
        checkboxes[toggle.key] = cb;
      }

      const pinnedNote = document.createElement('div');
      pinnedNote.className = 'preferences-card-note';
      pinnedNote.textContent = 'Browser sessions automatically hold the left stage so inspection and handoff stay visible while you work.';
      liveViewCard.appendChild(pinnedNote);

      sidebarCheckboxes = checkboxes as typeof sidebarCheckboxes;

    } else if (section === 'shortcuts') {
      appendSectionIntro(
        content,
        'Keyboard',
        'Working keys',
        'Keep the shortcuts you use every day close to hand and override only the ones that really help.',
      );
      appendOverviewGrid(content, [
        {
          label: 'Customized',
          value: `${countCustomizedShortcuts()}`,
          note: 'Only explicit overrides are tracked here.',
        },
        {
          label: 'Focus',
          value: 'Session + surface',
          note: 'Bindings cover sessions, the left stage, and shell navigation.',
        },
        {
          label: 'Style',
          value: 'Command-first',
          note: 'Record a new combo directly from the keyboard when you need one.',
        },
      ]);
      renderShortcutsSection(content);

    } else if (section === 'providers') {
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

      renderOrchestrationOverviewSection(orchestrationGroup);
      renderProjectPreviewCenterSection(orchestrationGroup);
      renderProjectWorkflowSection(orchestrationGroup);

      renderProjectContextSection(trackingGroup);
      renderProjectGovernanceSection(trackingGroup);
      renderProjectTeamContextSection(trackingGroup);
      renderProjectReviewSection(trackingGroup);
      renderProjectBackgroundTaskSection(trackingGroup);
      renderProjectCheckpointSection(trackingGroup);
      renderSetupSection(providerHealthGroup);

    } else if (section === 'about') {
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

      const renderAppUpdateState = (
        appUpdateState: ReturnType<typeof getUpdateCenterState>['app'],
      ) => {
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
      };

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
      renderAppUpdateState(getUpdateCenterState().app);
      aboutUpdateCleanup = onUpdateCenterChange((snapshot) => {
        renderAppUpdateState(snapshot.app);
      });

      const linksDiv = document.createElement('div');
      linksDiv.className = 'about-links about-link-grid';

      const ghLink = document.createElement('a');
      ghLink.className = 'about-link';
      ghLink.textContent = 'GitHub';
      ghLink.href = '#';
      ghLink.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder'); });

      const bugLink = document.createElement('a');
      bugLink.className = 'about-link';
      bugLink.textContent = 'Report a Bug';
      bugLink.href = '#';
      bugLink.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder/issues'); });

      linksDiv.appendChild(ghLink);
      linksDiv.appendChild(bugLink);

      const communityDiv = document.createElement('div');
      communityDiv.className = 'about-community';
      communityDiv.append(
        'Calder is open source. ',
        (() => { const a = document.createElement('a'); a.className = 'about-link'; a.href = '#'; a.textContent = 'Contribute on GitHub'; a.addEventListener('click', (e) => { e.preventDefault(); window.calder.app.openExternal('https://github.com/batuhanyuksel/calder'); }); return a; })(),
        ' \u2014 and if you find it useful, give it a star!',
      );

      const debugRow = document.createElement('div');
      debugRow.className = 'modal-toggle-field';

      const debugLabel = document.createElement('label');
      debugLabel.htmlFor = 'pref-debug-mode';
      debugLabel.textContent = 'Debug Mode';

      debugModeCheckbox = document.createElement('input');
      debugModeCheckbox.type = 'checkbox';
      debugModeCheckbox.id = 'pref-debug-mode';
      debugModeCheckbox.checked = appState.preferences.debugMode;

      debugRow.appendChild(debugLabel);
      debugRow.appendChild(debugModeCheckbox);

      aboutDiv.appendChild(aboutHero);
      aboutDiv.appendChild(updateRow);
      aboutDiv.appendChild(linksDiv);
      aboutDiv.appendChild(communityDiv);
      aboutDiv.appendChild(debugRow);
      content.appendChild(aboutDiv);

      window.calder.app.getVersion().then((ver) => {
        versionLine.textContent = `Version: ${ver}`;
      });
    }
  }

  function renderShortcutsSection(container: HTMLElement) {
    const grouped = shortcutManager.getAll();

    for (const [category, shortcuts] of grouped) {
      const groupShell = document.createElement('div');
      groupShell.className = 'shortcut-group-shell';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'shortcut-group-header';

      const header = document.createElement('div');
      header.className = 'shortcut-category-header';
      header.textContent = category;

      const count = document.createElement('div');
      count.className = 'shortcut-group-count';
      count.textContent = `${shortcuts.length} commands`;

      groupHeader.appendChild(header);
      groupHeader.appendChild(count);
      groupShell.appendChild(groupHeader);

      for (const shortcut of shortcuts) {
        const row = document.createElement('div');
        row.className = 'shortcut-row shortcut-row-shell';

        const copy = document.createElement('div');
        copy.className = 'shortcut-row-copy';

        const label = document.createElement('div');
        label.className = 'shortcut-row-label';
        label.textContent = shortcut.label;

        copy.appendChild(label);

        const keyBtn = document.createElement('button');
        keyBtn.className = 'shortcut-key-btn';
        keyBtn.textContent = displayKeys(shortcut.resolvedKeys);

        const hasOverride = shortcutManager.hasOverride(shortcut.id);
        if (hasOverride) {
          keyBtn.classList.add('customized');
        }

        const resetBtn = document.createElement('button');
        resetBtn.className = 'shortcut-reset-btn';
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Reset to default';
        if (!hasOverride) {
          resetBtn.style.visibility = 'hidden';
        }

        const actions = document.createElement('div');
        actions.className = 'shortcut-row-actions';

        // Click key button to start recording
        keyBtn.addEventListener('click', () => {
          cleanupRecorder();
          keyBtn.textContent = 'Press keys...';
          keyBtn.classList.add('recording');

          const onKeydown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const accelerator = eventToAccelerator(e);
            if (!accelerator) return; // Bare modifier press

            // Save the override
            shortcutManager.setOverride(shortcut.id, accelerator);
            cleanup();
            // Re-render to update display
            renderSection('shortcuts');
          };

          const onBlur = () => {
            cleanup();
            keyBtn.textContent = displayKeys(shortcutManager.getKeys(shortcut.id));
            keyBtn.classList.remove('recording');
          };

          const cleanup = () => {
            document.removeEventListener('keydown', onKeydown, true);
            keyBtn.removeEventListener('blur', onBlur);
            keyBtn.classList.remove('recording');
            activeRecorder = null;
          };

          document.addEventListener('keydown', onKeydown, true);
          keyBtn.addEventListener('blur', onBlur);
          activeRecorder = { cleanup };
        });

        // Reset button
        resetBtn.addEventListener('click', () => {
          cleanupRecorder();
          shortcutManager.resetOverride(shortcut.id);
          renderSection('shortcuts');
        });

        actions.appendChild(keyBtn);
        actions.appendChild(resetBtn);
        row.appendChild(copy);
        row.appendChild(actions);
        groupShell.appendChild(row);
      }

      container.appendChild(groupShell);
    }
  }

  function renderCheckItem(parent: HTMLElement, opts: {
    label: string;
    description: string;
    ok: boolean;
    statusText: string;
    helpText?: string;
    onFix?: () => Promise<void>;
  }) {
    const row = document.createElement('div');
    row.className = 'setup-check-row';

    const icon = document.createElement('span');
    icon.className = opts.ok ? 'setup-check-icon ok' : 'setup-check-icon error';
    icon.textContent = opts.ok ? '\u2713' : '\u2717';

    const info = document.createElement('div');
    info.className = 'setup-check-info';

    const title = document.createElement('div');
    title.className = 'setup-check-label';
    title.textContent = opts.label;

    const desc = document.createElement('div');
    desc.className = 'setup-check-desc';
    desc.textContent = opts.description;

    info.appendChild(title);
    info.appendChild(desc);

    if (!opts.ok && opts.helpText) {
      const help = document.createElement('div');
      help.className = 'setup-check-help';
      help.textContent = opts.helpText;
      info.appendChild(help);
    }

    const status = document.createElement('div');
    status.className = opts.ok ? 'setup-check-status setup-check-status-pill ok' : 'setup-check-status setup-check-status-pill error';
    status.textContent = opts.statusText;

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(status);

    const { onFix } = opts;
    if (onFix) {
      const btn = document.createElement('button');
      btn.className = 'setup-fix-btn';
      btn.textContent = 'Fix';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Fixing\u2026';
        try {
          await onFix();
        } catch {
          btn.disabled = false;
          btn.textContent = 'Fix';
        }
      });
      row.appendChild(btn);
    }

    parent.appendChild(row);
  }

  async function fixAndRerender(providerId?: ProviderId) {
    await window.calder.settings.reinstall(providerId);
    renderSection('providers');
  }

  function renderProviderHeader(parent: HTMLElement, displayName: string, hasIssue: boolean) {
    const header = document.createElement('div');
    header.className = 'setup-provider-header';

    const row = document.createElement('div');
    row.className = 'setup-provider-header-row';

    const name = document.createElement('div');
    name.className = 'setup-provider-name';
    name.textContent = displayName;

    const status = document.createElement('div');
    status.className = hasIssue ? 'setup-provider-status error' : 'setup-provider-status ok';
    status.textContent = hasIssue ? 'Needs attention' : 'Ready';

    row.appendChild(name);
    row.appendChild(status);
    header.appendChild(row);
    parent.appendChild(header);
  }

  interface ProviderStatus {
    meta: CliProviderMeta;
    validation: SettingsValidationResult;
    binary: { ok: boolean; message: string };
  }

  async function fetchProviderStatuses(): Promise<ProviderStatus[]> {
    const providers = await window.calder.provider.listProviders();
    return Promise.all(
      providers.map(meta =>
        Promise.all([
          window.calder.settings.validate(meta.id),
          window.calder.provider.checkBinary(meta.id),
        ]).then(([validation, binary]) => ({ meta, validation, binary })),
      ),
    );
  }

  function hasProviderIssue({ meta, validation, binary }: ProviderStatus): boolean {
    if (!binary.ok) return true;
    return !isTrackingHealthy(meta, validation);
  }

  async function renderSetupSection(container: HTMLElement) {
    const section = document.createElement('div');
    section.className = 'setup-section';

    const loading = document.createElement('div');
    loading.className = 'setup-loading';
    loading.textContent = 'Checking configuration\u2026';
    section.appendChild(loading);
    container.appendChild(section);

    const results = await fetchProviderStatuses();

    if (currentSection !== 'providers') return;

    applySetupBadge(results.some(hasProviderIssue));

    section.innerHTML = '';

    for (const { meta, validation, binary } of results) {
      const providerShell = document.createElement('div');
      providerShell.className = 'setup-provider-shell';
      section.appendChild(providerShell);

      renderProviderHeader(providerShell, meta.displayName, hasProviderIssue({ meta, validation, binary }));

      renderCheckItem(providerShell, {
        label: meta.displayName,
        description: `The ${meta.binaryName} binary must be installed for sessions to work.`,
        ok: binary.ok,
        statusText: binary.ok ? 'Installed' : 'Not found',
        helpText: binary.ok ? undefined : binary.message,
      });

      if (!binary.ok) continue;

      const { capabilities } = meta;

      if (capabilities.costTracking || capabilities.contextWindow) {
        const slOk = validation.statusLine === 'calder';
        let slStatus = 'Configured';
        if (validation.statusLine === 'missing') slStatus = 'Not configured';
        else if (validation.statusLine === 'foreign') slStatus = 'Overwritten by another tool';

        renderCheckItem(providerShell, {
          label: 'Status Line',
          description: 'Required for cost tracking and context window monitoring.',
          ok: slOk,
          statusText: slStatus,
          onFix: slOk ? undefined : () => fixAndRerender(meta.id),
        });
      }

      if (capabilities.hookStatus) {
        const hooksOk = validation.hooks === 'complete';
        let hooksStatus = 'All hooks installed';
        if (validation.hooks === 'missing') hooksStatus = 'No hooks installed';
        else if (validation.hooks === 'partial') hooksStatus = 'Some hooks missing';

        renderCheckItem(providerShell, {
          label: 'Session Hooks',
          description: 'Required for session activity tracking.',
          ok: hooksOk,
          statusText: hooksStatus,
          onFix: hooksOk ? undefined : () => fixAndRerender(meta.id),
        });

        const hookList = document.createElement('div');
        hookList.className = 'setup-hook-details';
        for (const [event, installed] of Object.entries(validation.hookDetails)) {
          const item = document.createElement('div');
          item.className = 'setup-hook-item';
          const icon = document.createElement('span');
          icon.className = installed ? 'setup-check-icon ok' : 'setup-check-icon error';
          icon.textContent = installed ? '\u2713' : '\u2717';
          const name = document.createElement('span');
          name.className = 'setup-hook-name';
          name.textContent = event;
          item.appendChild(icon);
          item.appendChild(name);
          hookList.appendChild(item);
        }
        providerShell.appendChild(hookList);

        if (capabilities.costTracking && validation.statusLine !== 'calder' && !hooksOk) {
          const fixAllRow = document.createElement('div');
          fixAllRow.className = 'setup-fix-all-row';

          const fixAllBtn = document.createElement('button');
          fixAllBtn.className = 'setup-fix-btn';
          fixAllBtn.textContent = 'Fix All';
          fixAllBtn.addEventListener('click', async () => {
            fixAllBtn.disabled = true;
            fixAllBtn.textContent = 'Fixing\u2026';
            try {
              await fixAndRerender(meta.id);
            } catch {
              fixAllBtn.disabled = false;
              fixAllBtn.textContent = 'Fix All';
            }
          });

          fixAllRow.appendChild(fixAllBtn);
          providerShell.appendChild(fixAllRow);
        }
      }
    }
  }

  function applySetupBadge(hasIssue: boolean) {
    const setupItem = menuItems.get('providers');
    if (setupItem) {
      setupItem.classList.toggle('has-badge', hasIssue);
    }
  }

  async function updateSetupBadge() {
    const results = await fetchProviderStatuses();
    applySetupBadge(results.some(hasProviderIssue));
  }
  updateSetupBadge();

  // Menu click handler
  menu.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.preferences-menu-item') as HTMLElement | null;
    if (target && target.dataset.section) {
      renderSection(target.dataset.section as Section);
    }
  });

  // Show initial section
  renderSection('general');

  btnConfirm.textContent = 'Done';
  overlay.classList.remove('hidden');

  // Clean up previous listeners
  runModalCleanup();
  extendModalCleanup(() => {
    bodyEl.classList.remove('preferences-body');
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  });

  const save = () => {
    if (soundCheckbox) {
      appState.setPreference('soundOnSessionWaiting', soundCheckbox.checked);
    }
    if (notificationsCheckbox) {
      appState.setPreference('notificationsDesktop', notificationsCheckbox.checked);
    }
    if (historyCheckbox) {
      appState.setPreference('sessionHistoryEnabled', historyCheckbox.checked);
    }
    if (insightsCheckbox) {
      appState.setPreference('insightsEnabled', insightsCheckbox.checked);
    }
    if (autoTitleCheckbox) {
      appState.setPreference('autoTitleEnabled', autoTitleCheckbox.checked);
    }
    if (defaultProviderSelect) {
      appState.setPreference('defaultProvider', defaultProviderSelect.getValue() as ProviderId);
    }
    if (debugModeCheckbox && debugModeCheckbox.checked !== appState.preferences.debugMode) {
      appState.setPreference('debugMode', debugModeCheckbox.checked);
      window.calder.menu.rebuild(debugModeCheckbox.checked);
    }
    if (sidebarCheckboxes) {
      appState.setPreference('sidebarViews', {
        configSections: sidebarCheckboxes.configSections.checked,
        gitPanel: sidebarCheckboxes.gitPanel.checked,
        sessionHistory: sidebarCheckboxes.sessionHistory.checked,
        costFooter: sidebarCheckboxes.costFooter.checked,
      });
    }
    if (languageSelect) {
      appState.setPreference('language', languageSelect.getValue() as UiLanguage);
    }
  };

  const handleConfirm = () => {
    cleanupRecorder();
    save();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleCancel = () => {
    cleanupRecorder();
    closeModal();
    modal.classList.remove('modal-wide');
    btnConfirm.textContent = 'Create';
  };

  const handleKeydown = (e: KeyboardEvent) => {
    // Don't intercept if we're recording a shortcut
    if (activeRecorder) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  btnConfirm.addEventListener('click', handleConfirm);
  btnCancel.addEventListener('click', handleCancel);
  document.addEventListener('keydown', handleKeydown);

  registerModalCleanup(() => {
    cleanupRecorder();
    cleanupAboutUpdateListeners();
    if (defaultProviderSelect) defaultProviderSelect.destroy();
    if (languageSelect) languageSelect.destroy();
    btnConfirm.removeEventListener('click', handleConfirm);
    btnCancel.removeEventListener('click', handleCancel);
    document.removeEventListener('keydown', handleKeydown);
  });
}
