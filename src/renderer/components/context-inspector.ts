import { appState } from '../state.js';
import { esc } from '../dom-utils.js';
import { getGitStatus, onChange as onGitStatusChange } from '../git-status.js';
import { getProviderDisplayName } from '../provider-availability.js';
import type { ProviderId, ProjectContextState } from '../types.js';
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
  type RightRailSectionId,
} from './right-rail-mode.js';

const mainAreaEl = document.getElementById('main-area')!;
const inspectorEl = document.getElementById('context-inspector')!;
const closeBtn = document.getElementById('btn-close-context-inspector')!;
const openBtn = document.getElementById('btn-open-context-inspector') as HTMLButtonElement | null;
const densityBtn = document.getElementById('btn-toggle-right-rail-density') as HTMLButtonElement | null;
const overviewEl = document.getElementById('context-inspector-overview')!;

let inspectorOpen = true;

type OverviewMetricTone = 'default' | 'healthy' | 'warning' | 'muted';
type RightRailDensity = 'standard' | 'ultra-compact';

function getSectionEls(): HTMLElement[] {
  if (typeof (inspectorEl as Element).querySelectorAll !== 'function') {
    return [];
  }
  return Array.from(inspectorEl.querySelectorAll<HTMLElement>('.context-inspector-section'));
}

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

function getRightRailDensity(): RightRailDensity {
  return appState.preferences.rightRailDensity === 'ultra-compact'
    ? 'ultra-compact'
    : 'standard';
}

function updateDensityToggleButton(): void {
  if (!densityBtn) return;
  const density = getRightRailDensity();
  const isUltra = density === 'ultra-compact';
  densityBtn.textContent = isUltra ? 'Ultra' : 'Standard';
  densityBtn.dataset.state = isUltra ? 'active' : 'default';
  densityBtn.title = isUltra
    ? 'Switch to standard right rail'
    : 'Switch to ultra compact right rail';
  densityBtn.setAttribute('aria-label', densityBtn.title);
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

function applyRailMode(): void {
  const project = appState.activeProject;
  if (!project) {
    inspectorEl.dataset.railMode = 'normal';
    for (const sectionEl of getSectionEls()) {
      sectionEl.dataset.presentation = 'compact';
    }
    return;
  }

  const gitStatus = getGitStatus(project.id);
  const hasDirtyGit = Boolean(
    gitStatus?.isGitRepo && (gitStatus.staged + gitStatus.modified + gitStatus.untracked) > 0,
  );
  const hasGitConflicts = Boolean(gitStatus?.conflicted);
  const hasToolingContext = true;
  const density = getRightRailDensity();
  const preferUltraCompact = density === 'ultra-compact';

  const mode = deriveRightRailMode({
    hasDirtyGit,
    hasGitConflicts,
    hasToolingContext,
    preferUltraCompact,
  });
  const presentation = deriveRightRailPresentation(mode, { hasDirtyGit, hasGitConflicts });

  inspectorEl.dataset.railMode = mode;
  inspectorEl.dataset.railDensity = density;
  for (const sectionEl of getSectionEls()) {
    const sectionId = sectionEl.dataset.section as RightRailSectionId | undefined;
    sectionEl.dataset.presentation = sectionId ? presentation[sectionId] : 'compact';
  }
}

function syncInspectorOpenState(): void {
  const hideOpenButton = inspectorOpen || !appState.activeProject;
  openBtn?.classList.toggle('hidden', hideOpenButton);
  openBtn?.toggleAttribute('hidden', hideOpenButton);
  openBtn?.setAttribute('aria-hidden', hideOpenButton ? 'true' : 'false');
}

function renderInspectorChrome(): void {
  renderOverview();
  applyRailMode();
  updateDensityToggleButton();
  syncInspectorOpenState();
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
  densityBtn?.addEventListener('click', () => {
    const nextDensity = getRightRailDensity() === 'ultra-compact'
      ? 'standard'
      : 'ultra-compact';
    appState.setPreference('rightRailDensity', nextDensity);
    renderInspectorChrome();
  });

  appState.on('project-changed', () => {
    if (!appState.activeProject) setContextInspectorOpen(false);
    renderInspectorChrome();
  });
  appState.on('state-loaded', renderInspectorChrome);
  appState.on('preferences-changed', renderInspectorChrome);
  appState.on('session-changed', renderInspectorChrome);
  appState.on('session-added', renderInspectorChrome);
  appState.on('session-removed', renderInspectorChrome);
  appState.on('history-changed', renderInspectorChrome);
  onGitStatusChange((projectId) => {
    if (projectId === appState.activeProject?.id) renderInspectorChrome();
  });

  setContextInspectorOpen(true);
  renderInspectorChrome();
}
