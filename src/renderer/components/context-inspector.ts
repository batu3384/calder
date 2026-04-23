import { appState } from '../state.js';
import { getGitStatus, onChange as onGitStatusChange } from './surface-services/git-status.js';

const mainAreaEl = document.getElementById('main-area')!;
const inspectorEl = document.getElementById('context-inspector')!;
const closeBtn = document.getElementById('btn-close-context-inspector')!;
const openBtn = document.getElementById('btn-open-context-inspector') as HTMLButtonElement | null;

function queryInspectorChildren<T extends HTMLElement>(selector: string): T[] {
  if (typeof inspectorEl.querySelectorAll !== 'function') {
    return [];
  }
  return Array.from(inspectorEl.querySelectorAll<T>(selector));
}

const inspectorTabButtons = queryInspectorChildren<HTMLButtonElement>('.context-inspector-tab[data-inspector-tab]');
const inspectorSections = queryInspectorChildren<HTMLElement>('.context-inspector-section[data-section]');

type RailSignal = 'default' | 'active' | 'warning';
type InspectorTab = 'capabilities' | 'git' | 'activity';

let inspectorOpen = true;
let renderQueued = false;
let activeInspectorTab: InspectorTab = 'capabilities';

const queueFrame = typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame
  : (callback: FrameRequestCallback): number => globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number;

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
  const hasRiskyApproval = autoApprovalMode === 'full_auto' || autoApprovalMode === 'full_auto_unsafe';
  const nextSignal: RailSignal = hasGitConflicts || hasRiskyApproval
    ? 'warning'
    : hasDirtyGit
      ? 'active'
      : 'default';
  if (inspectorEl.dataset.railSignal !== nextSignal) {
    inspectorEl.dataset.railSignal = nextSignal;
  }
}

function syncInspectorOpenState(): void {
  const hideOpenButton = inspectorOpen || !appState.activeProject;
  openBtn?.classList.toggle('hidden', hideOpenButton);
  openBtn?.toggleAttribute('hidden', hideOpenButton);
  openBtn?.setAttribute('aria-hidden', hideOpenButton ? 'true' : 'false');
}

function renderInspectorChrome(): void {
  syncRailSignal();
  syncInspectorOpenState();
  syncInspectorTabState();
}

function isInspectorTab(value: string | undefined): value is InspectorTab {
  return value === 'capabilities' || value === 'git' || value === 'activity';
}

function syncInspectorTabState(): void {
  for (const button of inspectorTabButtons) {
    const tab = button.dataset.inspectorTab;
    const isActive = tab === activeInspectorTab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  }

  for (const section of inspectorSections) {
    const sectionId = section.dataset.section;
    const isActive = sectionId === activeInspectorTab;
    section.classList.toggle('active', isActive);
    section.toggleAttribute('hidden', !isActive);
    section.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }
}

function setInspectorTab(tab: InspectorTab): void {
  activeInspectorTab = tab;
  syncInspectorTabState();
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
  for (const button of inspectorTabButtons) {
    button.addEventListener('click', () => {
      if (isInspectorTab(button.dataset.inspectorTab)) {
        setInspectorTab(button.dataset.inspectorTab);
      }
    });
  }

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
