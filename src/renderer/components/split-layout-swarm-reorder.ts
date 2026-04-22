import type { ProjectRecord } from '../state.js';

const SWARM_PANE_SELECTORS = [
  '.terminal-pane',
  '.browser-tab-pane',
  '.file-viewer-pane',
  '.file-reader-pane',
  '.mcp-inspector-pane',
];
const SWARM_REORDER_HEADER_SELECTORS = ['.terminal-pane-chrome', '.file-viewer-header', '.mcp-inspector-header'];
export const SWARM_PANE_SELECTOR = SWARM_PANE_SELECTORS.join(', ');
export const SWARM_REORDER_HEADER_SELECTOR = SWARM_REORDER_HEADER_SELECTORS.join(', ');

let draggingSwarmSessionId: string | null = null;

export function getVisibleSwarmSessions(project: ProjectRecord): ProjectRecord['sessions'] {
  const visibleIds = new Set(project.layout.splitPanes);
  return project.sessions.filter((session) => visibleIds.has(session.id) && (!session.type || session.type === 'claude'));
}

function getPaneCandidates(root: ParentNode): HTMLElement[] {
  return SWARM_PANE_SELECTORS.flatMap((selector) => Array.from(root.querySelectorAll(selector)) as HTMLElement[]);
}

function findPaneBySessionId(sessionId: string, root: ParentNode): HTMLElement | null {
  return getPaneCandidates(root).find((pane) => pane.dataset.sessionId === sessionId) ?? null;
}

function findSwarmReorderHandle(pane: ParentNode): HTMLElement | null {
  for (const selector of SWARM_REORDER_HEADER_SELECTORS) {
    const handle = pane.querySelector(selector) as HTMLElement | null;
    if (handle) return handle;
  }
  return null;
}

function clearSwarmReorderIndicators(container: ParentNode): void {
  draggingSwarmSessionId = null;
  getPaneCandidates(container).forEach((pane) => {
    pane.classList.remove('swarm-reorder-target', 'swarm-reorder-dragging');
  });
}

export function clearSwarmReorderDecorations(container: HTMLElement): void {
  container.querySelectorAll('.swarm-reorder-header').forEach((header) => {
    const element = header as HTMLElement;
    element.classList.remove('swarm-reorder-header');
    element.draggable = false;
    if (element.dataset.swarmReorderTitle === 'true') {
      element.removeAttribute?.('title');
      delete element.dataset.swarmReorderTitle;
    }
  });
  clearSwarmReorderIndicators(container);
}

export function decorateSwarmReorderHandles(
  project: ProjectRecord,
  container: HTMLElement,
  root: ParentNode = container,
): void {
  clearSwarmReorderDecorations(container);
  for (const session of getVisibleSwarmSessions(project)) {
    const pane = findPaneBySessionId(session.id, root);
    if (!pane) continue;
    const handle = findSwarmReorderHandle(pane);
    if (!handle) continue;
    handle.classList.add('swarm-reorder-header');
    handle.draggable = true;
    const existingTitle = handle.getAttribute?.('title') ?? handle.title;
    if (!existingTitle) {
      handle.title = 'Drag to reorder pane';
      handle.dataset.swarmReorderTitle = 'true';
    }
  }
}

type BindSwarmReorderInteractionsOptions = {
  container: HTMLElement;
  getProject: () => ProjectRecord | undefined;
  isMosaicMode: (project: ProjectRecord | undefined) => boolean;
  setActiveSession: (projectId: string, sessionId: string) => void;
  reorderSession: (projectId: string, draggedSessionId: string, targetIndex: number) => void;
};

export function bindSwarmReorderInteractions(options: BindSwarmReorderInteractionsOptions): void {
  const { container, getProject, isMosaicMode, setActiveSession, reorderSession } = options;

  container.addEventListener('mousedown', (e) => {
    const project = getProject();
    if (!project || !isMosaicMode(project)) return;
    if ((e.target as HTMLElement).closest(SWARM_REORDER_HEADER_SELECTOR)) return;

    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const sessionId = paneEl?.dataset.sessionId;
    if (sessionId && sessionId !== project.activeSessionId) {
      setActiveSession(project.id, sessionId);
    }
  });

  container.addEventListener('dragstart', (e) => {
    const project = getProject();
    if (!project || !isMosaicMode(project)) return;
    const handle = (e.target as HTMLElement).closest(SWARM_REORDER_HEADER_SELECTOR) as HTMLElement | null;
    if (!handle) return;

    const paneEl = handle.closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const sessionId = paneEl?.dataset.sessionId;
    if (!sessionId || !getVisibleSwarmSessions(project).some((session) => session.id === sessionId) || !e.dataTransfer) return;

    draggingSwarmSessionId = sessionId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sessionId);
    paneEl.classList.add('swarm-reorder-dragging');
  });

  container.addEventListener('dragover', (e) => {
    const project = getProject();
    if (!project || !isMosaicMode(project) || !draggingSwarmSessionId) return;

    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const targetSessionId = paneEl?.dataset.sessionId;
    const visibleSessions = getVisibleSwarmSessions(project);
    if (!paneEl || !targetSessionId || targetSessionId === draggingSwarmSessionId || !visibleSessions.some((session) => session.id === targetSessionId)) {
      return;
    }

    e.preventDefault();
    getPaneCandidates(container).forEach((pane) => pane.classList.toggle('swarm-reorder-target', pane === paneEl));
  });

  container.addEventListener('dragleave', (e) => {
    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    paneEl?.classList.remove('swarm-reorder-target');
  });

  container.addEventListener('drop', (e) => {
    const project = getProject();
    if (!project || !isMosaicMode(project) || !e.dataTransfer) return;

    e.preventDefault();
    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const targetSessionId = paneEl?.dataset.sessionId;
    const draggedSessionId = e.dataTransfer.getData('text/plain');

    if (!paneEl || !targetSessionId || !draggedSessionId || targetSessionId === draggedSessionId) {
      clearSwarmReorderIndicators(container);
      return;
    }
    const visibleSessions = getVisibleSwarmSessions(project);
    if (!visibleSessions.some((session) => session.id === targetSessionId) || !visibleSessions.some((session) => session.id === draggedSessionId)) {
      clearSwarmReorderIndicators(container);
      return;
    }

    const targetIndex = project.sessions.findIndex((session) => session.id === targetSessionId);
    if (targetIndex !== -1) {
      reorderSession(project.id, draggedSessionId, targetIndex);
    }
    clearSwarmReorderIndicators(container);
  });

  container.addEventListener('dragend', () => {
    clearSwarmReorderIndicators(container);
  });
}
