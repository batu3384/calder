import { appState } from '../state.js';
import { esc } from '../dom-utils.js';
import { getGitStatus, onChange as onGitStatusChange } from '../git-status.js';
import { getProviderDisplayName } from '../provider-availability.js';
import type { ProviderId, ProjectContextState } from '../types.js';

const mainAreaEl = document.getElementById('main-area')!;
const inspectorEl = document.getElementById('context-inspector')!;
const closeBtn = document.getElementById('btn-close-context-inspector')!;
const openBtn = document.getElementById('btn-open-context-inspector') as HTMLButtonElement | null;
const overviewEl = document.getElementById('context-inspector-overview')!;

let inspectorOpen = true;
let renderQueued = false;
let lastOverviewSignature: string | null = null;

type OverviewMetricTone = 'default' | 'healthy' | 'warning' | 'muted';

const queueFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (callback: FrameRequestCallback): number => globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number;

function getInspectorProviderId(): ProviderId {
  const project = appState.activeProject;
  if (!project) return 'claude';

  const activeSession = appState.activeSession;
  if (activeSession && !activeSession.type) {
    return (activeSession.providerId || 'claude') as ProviderId;
  }

  const recentCliSession = [...project.sessions].reverse().find(session => !session.type);
  return (recentCliSession?.providerId || 'claude') as ProviderId;
}

function renderOverviewMetric(
  label: string,
  primary: string,
  secondary: string,
  tone: OverviewMetricTone = 'default',
): string {
  return `
    <div class="inspector-overview-metric" data-tone="${tone}">
      <span class="inspector-overview-metric-label">${esc(label)}</span>
      <span class="inspector-overview-metric-value inspector-overview-metric-primary">${esc(primary)}</span>
      <span class="inspector-overview-metric-secondary">${esc(secondary)}</span>
    </div>
  `;
}

function describeProjectContext(projectContext?: ProjectContextState): {
  tone: OverviewMetricTone;
  copy: string;
} {
  if (!projectContext || projectContext.sources.length === 0) {
    return {
      tone: 'muted',
      copy: 'No provider memory or shared rules discovered yet.',
    };
  }

  const providerMemoryCount = projectContext.sources.filter((source) => source.provider !== 'shared').length;
  const hasProviderMemory = providerMemoryCount > 0;
  const hasSharedRules = projectContext.sharedRuleCount > 0;
  let copy = 'Context connected.';
  if (hasProviderMemory && hasSharedRules) {
    copy = 'Provider memory + shared rules connected.';
  } else if (hasProviderMemory) {
    copy = 'Provider memory connected.';
  } else if (hasSharedRules) {
    copy = 'Shared rules connected.';
  }

  return {
    tone: 'default',
    copy,
  };
}

function renderOverview(): void {
  const project = appState.activeProject;
  if (!project) {
    lastOverviewSignature = null;
    overviewEl.innerHTML = '';
    return;
  }

  const providerLabel = getProviderDisplayName(getInspectorProviderId());
  const sessionCount = project.sessions.filter(session => !session.type).length;
  const runCount = project.sessionHistory?.length ?? 0;
  const gitStatus = getGitStatus(project.id);
  const changeCount = gitStatus?.isGitRepo
    ? gitStatus.staged + gitStatus.modified + gitStatus.untracked + gitStatus.conflicted
    : 0;
  const surfaceLabel = project.surface?.active
    ? project.surface.kind === 'cli'
      ? 'CLI Surface'
      : 'Browser View'
    : 'No Surface';
  const changeMetric = gitStatus?.isGitRepo
    ? gitStatus.conflicted > 0
      ? renderOverviewMetric('Changes', String(gitStatus.conflicted), gitStatus.conflicted === 1 ? 'conflict' : 'conflicts', 'warning')
      : changeCount === 0
        ? renderOverviewMetric('Changes', '0', 'clean', 'healthy')
        : renderOverviewMetric('Changes', String(changeCount), 'tracked', 'warning')
    : renderOverviewMetric('Changes', 'No', 'Git', 'muted');
  const projectContextSummary = describeProjectContext(project.projectContext);
  const overviewSignature = JSON.stringify({
    projectId: project.id,
    projectName: project.name,
    providerLabel,
    surfaceLabel,
    sessionCount,
    runCount,
    conflictCount: gitStatus?.conflicted ?? 0,
    changeCount,
    contextTone: projectContextSummary.tone,
    contextCopy: projectContextSummary.copy,
  });
  if (overviewSignature === lastOverviewSignature) {
    return;
  }
  lastOverviewSignature = overviewSignature;

  overviewEl.innerHTML = `
    <section class="inspector-overview-card">
      <div class="inspector-overview-header">
        <div class="inspector-overview-project">
          <span class="inspector-overview-kicker">Project Snapshot</span>
          <span class="inspector-overview-name">${esc(project.name)}</span>
        </div>
        <div class="inspector-overview-meta">
          <span class="inspector-overview-pill">${esc(providerLabel)}</span>
          <span class="inspector-overview-pill inspector-overview-pill-muted">${esc(surfaceLabel)}</span>
        </div>
      </div>
      <div class="inspector-overview-metrics">
        ${renderOverviewMetric('Open sessions', String(sessionCount), sessionCount === 1 ? 'open' : 'open now')}
        ${changeMetric}
        ${renderOverviewMetric('Run log', String(runCount), runCount === 1 ? 'saved run' : 'saved runs')}
      </div>
      <div class="inspector-overview-context-note ops-rail-note" data-tone="${projectContextSummary.tone}">
        <span class="inspector-overview-context-title">Project context</span>
        <span class="inspector-overview-context-copy">${esc(projectContextSummary.copy)}</span>
      </div>
    </section>
  `;
}

function syncRailSignal(): void {
  const project = appState.activeProject;
  if (!project) {
    inspectorEl.dataset.railSignal = 'default';
    return;
  }

  const gitStatus = getGitStatus(project.id);
  const autoApprovalMode = project.projectGovernance?.autoApproval?.effectiveMode;
  const hasDirtyGit = Boolean(
    gitStatus?.isGitRepo && (gitStatus.staged + gitStatus.modified + gitStatus.untracked) > 0,
  );
  const hasGitConflicts = Boolean(gitStatus?.conflicted);
  const hasRiskyApproval = autoApprovalMode === 'full_auto';
  const nextSignal = hasGitConflicts || hasRiskyApproval
    ? 'warning'
    : hasDirtyGit
      ? 'active'
      : 'default';
  if (inspectorEl.dataset.railSignal === nextSignal) {
    return;
  }
  inspectorEl.dataset.railSignal = nextSignal;
}

function syncInspectorOpenState(): void {
  const hideOpenButton = inspectorOpen || !appState.activeProject;
  openBtn?.classList.toggle('hidden', hideOpenButton);
  openBtn?.toggleAttribute('hidden', hideOpenButton);
  openBtn?.setAttribute('aria-hidden', hideOpenButton ? 'true' : 'false');
}

function renderInspectorChrome(): void {
  renderOverview();
  syncRailSignal();
  syncInspectorOpenState();
}

function scheduleInspectorRender(): void {
  if (renderQueued) {
    return;
  }
  renderQueued = true;
  queueFrame(() => {
    renderQueued = false;
    renderInspectorChrome();
  });
}

export function setContextInspectorOpen(next: boolean): void {
  inspectorOpen = next;
  mainAreaEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-closed', !next);
  syncInspectorOpenState();
}

export function toggleContextInspector(): void {
  setContextInspectorOpen(!inspectorOpen);
}

export function initContextInspector(): void {
  closeBtn.addEventListener('click', () => setContextInspectorOpen(false));
  openBtn?.addEventListener('click', () => setContextInspectorOpen(true));

  appState.on('project-changed', () => {
    if (!appState.activeProject) setContextInspectorOpen(false);
    scheduleInspectorRender();
  });
  appState.on('state-loaded', scheduleInspectorRender);
  appState.on('preferences-changed', scheduleInspectorRender);
  appState.on('session-changed', scheduleInspectorRender);
  appState.on('session-added', scheduleInspectorRender);
  appState.on('session-removed', scheduleInspectorRender);
  appState.on('history-changed', scheduleInspectorRender);
  onGitStatusChange((projectId) => {
    if (projectId === appState.activeProject?.id) scheduleInspectorRender();
  });

  setContextInspectorOpen(true);
  renderInspectorChrome();
}
