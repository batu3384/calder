import { appState } from '../state.js';
import { esc } from '../dom-utils.js';
import { getGitStatus, onChange as onGitStatusChange } from '../git-status.js';
import { getProviderDisplayName } from '../provider-availability.js';
import type { ProviderId } from '../types.js';
import {
  deriveRightRailMode,
  deriveRightRailPresentation,
  type RightRailSectionId,
} from './right-rail-mode.js';

const mainAreaEl = document.getElementById('main-area')!;
const inspectorEl = document.getElementById('context-inspector')!;
const closeBtn = document.getElementById('btn-close-context-inspector')!;
const overviewEl = document.getElementById('context-inspector-overview')!;

let inspectorOpen = true;

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

function renderOverview(): void {
  const project = appState.activeProject;
  if (!project) {
    overviewEl.innerHTML = '';
    return;
  }

  const providerLabel = getProviderDisplayName(getInspectorProviderId());
  const sessionCount = project.sessions.filter(session => !session.type).length;
  const runCount = project.sessionHistory?.length ?? 0;
  const readinessLabel = project.readiness ? `${project.readiness.overallScore}%` : 'Pending';
  const gitStatus = getGitStatus(project.id);
  const changeCount = gitStatus?.isGitRepo
    ? gitStatus.staged + gitStatus.modified + gitStatus.untracked + gitStatus.conflicted
    : 0;
  const changeLabel = gitStatus?.isGitRepo ? (changeCount === 0 ? 'Clean' : String(changeCount)) : 'No Git';
  const sessionLabel = sessionCount === 0 ? 'None open' : `${sessionCount} open`;
  const runLabel = runCount === 0 ? 'Empty' : `${runCount} saved`;

  overviewEl.innerHTML = `
    <section class="inspector-overview-card">
      <div class="inspector-overview-header">
        <div class="inspector-overview-project">
          <span class="inspector-overview-kicker">Project Snapshot</span>
          <span class="inspector-overview-name">${esc(project.name)}</span>
        </div>
        <span class="inspector-overview-provider">${esc(providerLabel)}</span>
      </div>
      <div class="inspector-overview-path" title="${esc(project.path)}">${esc(project.path)}</div>
      <div class="inspector-overview-metrics">
        <div class="inspector-overview-metric">
          <span class="inspector-overview-metric-label">Open sessions</span>
          <span class="inspector-overview-metric-value">${sessionLabel}</span>
        </div>
        <div class="inspector-overview-metric">
          <span class="inspector-overview-metric-label">Changes</span>
          <span class="inspector-overview-metric-value">${changeLabel}</span>
        </div>
        <div class="inspector-overview-metric">
          <span class="inspector-overview-metric-label">Run log</span>
          <span class="inspector-overview-metric-value">${runLabel}</span>
        </div>
        <div class="inspector-overview-metric">
          <span class="inspector-overview-metric-label">Readiness</span>
          <span class="inspector-overview-metric-value">${readinessLabel}</span>
        </div>
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
  const hasHealthWarning = typeof project.readiness?.overallScore === 'number'
    ? project.readiness.overallScore < 70
    : false;
  const hasToolingContext = true;

  const mode = deriveRightRailMode({
    hasHealthWarning,
    hasDirtyGit,
    hasGitConflicts,
    hasToolingContext,
  });
  const presentation = deriveRightRailPresentation(mode, { hasDirtyGit, hasGitConflicts });

  inspectorEl.dataset.railMode = mode;
  for (const sectionEl of getSectionEls()) {
    const sectionId = sectionEl.dataset.section as RightRailSectionId | undefined;
    sectionEl.dataset.presentation = sectionId ? presentation[sectionId] : 'compact';
  }
}

function renderInspectorChrome(): void {
  renderOverview();
  applyRailMode();
}

export function setContextInspectorOpen(next: boolean): void {
  inspectorOpen = next;
  mainAreaEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-open', next);
  inspectorEl.classList.toggle('context-inspector-closed', !next);
}

export function toggleContextInspector(): void {
  setContextInspectorOpen(!inspectorOpen);
}

export function initContextInspector(): void {
  closeBtn.addEventListener('click', () => setContextInspectorOpen(false));

  appState.on('project-changed', () => {
    if (!appState.activeProject) setContextInspectorOpen(false);
    renderInspectorChrome();
  });
  appState.on('state-loaded', renderInspectorChrome);
  appState.on('session-changed', renderInspectorChrome);
  appState.on('session-added', renderInspectorChrome);
  appState.on('session-removed', renderInspectorChrome);
  appState.on('history-changed', renderInspectorChrome);
  appState.on('readiness-changed', renderInspectorChrome);
  onGitStatusChange((projectId) => {
    if (projectId === appState.activeProject?.id) renderInspectorChrome();
  });

  setContextInspectorOpen(true);
  renderInspectorChrome();
}
