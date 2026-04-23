import type { ProjectRecord } from '../../../shared/types/project-state.js';

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

export interface RenderOrchestrationOverviewArgs {
  container: HTMLElement;
  project: ProjectRecord | null;
  appendSectionCard: (container: HTMLElement, title: string, description?: string) => HTMLElement;
  onBootstrapStarters: (project: ProjectRecord) => Promise<string>;
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

function buildOrchestrationPhaseStates(project: ProjectRecord): OrchestrationPhaseState[] {
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

export function renderOrchestrationOverviewSection(args: RenderOrchestrationOverviewArgs): void {
  const card = args.appendSectionCard(
    args.container,
    'Calder orchestration map',
    'A compact, phase-by-phase view of what is active in this repo and how Calder routes it during real work.',
  );

  const shell = document.createElement('div');
  shell.className = 'orchestration-overview-shell';
  card.appendChild(shell);

  if (!args.project) {
    const empty = document.createElement('div');
    empty.className = 'orchestration-overview-empty';
    empty.textContent = 'Open a project to inspect orchestration phase status.';
    shell.appendChild(empty);
    return;
  }

  const project = args.project;
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
      status.textContent = await args.onBootstrapStarters(project);
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
