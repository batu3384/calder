import { appState, ProjectRecord } from '../state.js';
import { isUnread, onChange as onUnreadChange } from '../session-unread.js';
import {
  createTerminalPane,
  attachToContainer,
  showPane,
  hideAllPanes,
  fitAllVisible,
  setFocused,
  clearFocused,
  spawnTerminal,
  setPendingPrompt,
  destroyTerminal,
  getTerminalInstance,
} from './terminal-pane.js';
import {
  createInspectorPane,
  destroyInspectorPane,
  showInspectorPane,
  hideAllInspectorPanes,
  attachInspectorToContainer,
  getInspectorInstance,
  disconnectInspector,
} from './mcp-inspector.js';
import { isInspectorOpen } from './session-inspector.js';
import {
  createFileViewerPane,
  destroyFileViewerPane,
  showFileViewerPane,
  hideAllFileViewerPanes,
  attachFileViewerToContainer,
  getFileViewerInstance,
} from './file-viewer.js';
import {
  createFileReaderPane,
  destroyFileReaderPane,
  showFileReaderPane,
  hideAllFileReaderPanes,
  attachFileReaderToContainer,
  getFileReaderInstance,
  setFileReaderLine,
} from './file-reader.js';
import {
  getRemoteTerminalInstance,
  destroyRemoteTerminal,
  attachRemoteToContainer,
  showRemotePane,
  hideAllRemotePanes,
} from './remote-terminal-pane.js';
import {
  createBrowserTabPane,
  destroyBrowserTabPane,
  showBrowserTabPane,
  hideAllBrowserTabPanes,
  attachBrowserTabToContainer,
  getBrowserTabInstance,
} from './browser-tab-pane.js';
import { quickNewSession } from './tab-bar.js';
import { promptNewProject } from './sidebar.js';

const container = document.getElementById('terminal-container')!;
const SWARM_PANE_SELECTOR = '.terminal-pane, .browser-tab-pane, .file-viewer-pane, .file-reader-pane, .mcp-inspector-pane';
const SWARM_REORDER_HEADER_SELECTOR = '.terminal-pane-chrome, .browser-pane-chrome, .file-viewer-header, .mcp-inspector-header';
let draggingSwarmSessionId: string | null = null;

function getPaneCandidates(root: ParentNode = container): HTMLElement[] {
  const selectors = ['.terminal-pane', '.browser-tab-pane', '.file-viewer-pane', '.file-reader-pane', '.mcp-inspector-pane'];
  return selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)) as HTMLElement[]);
}

function findPaneBySessionId(sessionId: string, root: ParentNode = container): HTMLElement | null {
  return getPaneCandidates(root).find((pane) => pane.dataset.sessionId === sessionId) ?? null;
}

function findSwarmReorderHandle(pane: ParentNode): HTMLElement | null {
  const selectors = ['.terminal-pane-chrome', '.browser-pane-chrome', '.file-viewer-header', '.mcp-inspector-header'];
  for (const selector of selectors) {
    const handle = pane.querySelector(selector) as HTMLElement | null;
    if (handle) return handle;
  }
  return null;
}

function getSwarmCompanionSession(project: ProjectRecord) {
  const activeSession = project.sessions.find(s => s.id === project.activeSessionId);
  if (activeSession?.type && activeSession.type !== 'claude' && activeSession.type !== 'browser-tab') {
    return activeSession;
  }
  return [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
}

function getVisibleSwarmSessions(project: ProjectRecord) {
  const visibleIds = new Set(project.layout.splitPanes);
  const companion = getSwarmCompanionSession(project);
  if (companion) visibleIds.add(companion.id);
  return project.sessions.filter((session) => visibleIds.has(session.id));
}

function clearSwarmReorderIndicators(): void {
  draggingSwarmSessionId = null;
  getPaneCandidates().forEach((pane) => {
    pane.classList.remove('swarm-reorder-target', 'swarm-reorder-dragging');
  });
}

function clearSwarmReorderDecorations(): void {
  container.querySelectorAll('.swarm-reorder-header').forEach((header) => {
    const element = header as HTMLElement;
    element.classList.remove('swarm-reorder-header');
    element.draggable = false;
    if (element.dataset.swarmReorderTitle === 'true') {
      element.removeAttribute?.('title');
      delete element.dataset.swarmReorderTitle;
    }
  });
  clearSwarmReorderIndicators();
}

function decorateSwarmReorderHandles(project: ProjectRecord, root: ParentNode = container): void {
  clearSwarmReorderDecorations();
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

/** Set the container's layout class while preserving the inspector-open class if active. */
function setContainerClass(cls: string): void {
  const hasInspector = isInspectorOpen();
  container.className = cls;
  if (hasInspector) container.classList.add('inspector-open');
}

export function initSplitLayout(): void {
  appState.on('state-loaded', renderLayout);
  appState.on('project-changed', renderLayout);
  appState.on('session-added', onSessionAdded);
  appState.on('session-removed', onSessionRemoved);
  appState.on('session-changed', renderLayout);
  appState.on('layout-changed', renderLayout);

  onUnreadChange(() => {
    const project = appState.activeProject;
    if (project?.layout.mode === 'swarm') updateSwarmPaneStyles(project);
  });

  // Refit on window resize
  window.addEventListener('resize', () => {
    requestAnimationFrame(fitAllVisible);
  });

  // Click delegation for swarm mode: clicking a dimmed pane makes it active
  container.addEventListener('mousedown', (e) => {
    const project = appState.activeProject;
    if (!project || project.layout.mode !== 'swarm') return;

    const paneEl = (e.target as HTMLElement).closest(
      '.terminal-pane, .browser-tab-pane, .file-viewer-pane, .file-reader-pane, .mcp-inspector-pane',
    ) as HTMLElement | null;
    if (!paneEl) return;

    const sessionId = paneEl.dataset.sessionId;
    if (sessionId && sessionId !== project.activeSessionId) {
      appState.setActiveSession(project.id, sessionId);
    }
  });

  container.addEventListener('dragstart', (e) => {
    const project = appState.activeProject;
    if (!project || project.layout.mode !== 'swarm') return;
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
    const project = appState.activeProject;
    if (!project || project.layout.mode !== 'swarm' || !draggingSwarmSessionId) return;

    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const targetSessionId = paneEl?.dataset.sessionId;
    const visibleSessions = getVisibleSwarmSessions(project);
    if (!paneEl || !targetSessionId || targetSessionId === draggingSwarmSessionId || !visibleSessions.some((session) => session.id === targetSessionId)) {
      return;
    }

    e.preventDefault();
    getPaneCandidates().forEach((pane) => pane.classList.toggle('swarm-reorder-target', pane === paneEl));
  });

  container.addEventListener('dragleave', (e) => {
    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    paneEl?.classList.remove('swarm-reorder-target');
  });

  container.addEventListener('drop', (e) => {
    const project = appState.activeProject;
    if (!project || project.layout.mode !== 'swarm' || !e.dataTransfer) return;

    e.preventDefault();
    const paneEl = (e.target as HTMLElement).closest(SWARM_PANE_SELECTOR) as HTMLElement | null;
    const targetSessionId = paneEl?.dataset.sessionId;
    const draggedSessionId = e.dataTransfer.getData('text/plain');

    if (!paneEl || !targetSessionId || !draggedSessionId || targetSessionId === draggedSessionId) {
      clearSwarmReorderIndicators();
      return;
    }
    const visibleSessions = getVisibleSwarmSessions(project);
    if (!visibleSessions.some((session) => session.id === targetSessionId) || !visibleSessions.some((session) => session.id === draggedSessionId)) {
      clearSwarmReorderIndicators();
      return;
    }

    const targetIndex = project.sessions.findIndex((session) => session.id === targetSessionId);
    if (targetIndex !== -1) {
      appState.reorderSession(project.id, draggedSessionId, targetIndex);
    }
    clearSwarmReorderIndicators();
  });

  container.addEventListener('dragend', () => {
    clearSwarmReorderIndicators();
  });
}

function onSessionAdded(data: unknown): void {
  const { session } = data as { projectId: string; session: { id: string; type?: string; cliSessionId: string | null; providerId?: string; args?: string; diffFilePath?: string; diffArea?: string; worktreePath?: string; fileReaderPath?: string; fileReaderLine?: number; browserTabUrl?: string } };
  const project = appState.activeProject;
  if (!project) return;

  if (session.type === 'file-reader') {
    createFileReaderPane(session.id, session.fileReaderPath || '', session.fileReaderLine);
    renderLayout();
  } else if (session.type === 'diff-viewer') {
    createFileViewerPane(session.id, session.diffFilePath || '', session.diffArea || '', session.worktreePath);
    renderLayout();
  } else if (session.type === 'mcp-inspector') {
    createInspectorPane(session.id);
    renderLayout();
  } else if (session.type === 'remote-terminal') {
    // Remote terminal pane is created by share-manager before session-added fires
    renderLayout();
  } else if (session.type === 'browser-tab') {
    createBrowserTabPane(session.id, session.browserTabUrl);
    renderLayout();
  } else {
    // Create and spawn immediately
    createTerminalPane(session.id, project.path, session.cliSessionId, !!session.cliSessionId, session.args || '', (session.providerId as import('../../shared/types').ProviderId) || 'claude', project.id);
    const pending = appState.consumePendingInitialPrompt(project.id, session.id);
    if (pending) {
      setPendingPrompt(session.id, pending);
    }
    renderLayout();

    // Spawn after layout is rendered so terminal has dimensions
    requestAnimationFrame(() => {
      spawnTerminal(session.id);
      fitAllVisible();
    });
  }
}

function onSessionRemoved(data: unknown): void {
  const { sessionId } = data as { projectId: string; sessionId: string };
  if (getFileReaderInstance(sessionId)) {
    destroyFileReaderPane(sessionId);
  } else if (getFileViewerInstance(sessionId)) {
    destroyFileViewerPane(sessionId);
  } else if (getInspectorInstance(sessionId)) {
    disconnectInspector(sessionId);
    destroyInspectorPane(sessionId);
  } else if (getRemoteTerminalInstance(sessionId)) {
    destroyRemoteTerminal(sessionId);
  } else if (getBrowserTabInstance(sessionId)) {
    destroyBrowserTabPane(sessionId);
  } else {
    destroyTerminal(sessionId);
  }
  renderLayout();
}

export function renderLayout(): void {
  const project = appState.activeProject;

  if (!project || project.sessions.length === 0) {
    hideAllPanes();
    hideAllInspectorPanes();
    hideAllFileViewerPanes();
    hideAllFileReaderPanes();
    hideAllRemotePanes();
    hideAllBrowserTabPanes();
    setContainerClass('');
    showEmptyState(project);
    return;
  }

  removeEmptyState();
  container.querySelectorAll('.swarm-grid-wrapper').forEach(el => el.remove());
  container.querySelectorAll('.swarm-empty-cell').forEach(el => el.remove());

  // Ensure all sessions have their respective instances
  for (const session of project.sessions) {
    if (session.type === 'file-reader') {
      if (!getFileReaderInstance(session.id)) {
        createFileReaderPane(session.id, session.fileReaderPath || '', session.fileReaderLine);
      }
    } else if (session.type === 'diff-viewer') {
      if (!getFileViewerInstance(session.id)) {
        createFileViewerPane(session.id, session.diffFilePath || '', session.diffArea || '', session.worktreePath);
      }
    } else if (session.type === 'mcp-inspector') {
      if (!getInspectorInstance(session.id)) {
        createInspectorPane(session.id);
      }
    } else if (session.type === 'remote-terminal') {
      // Remote terminal instances are created by share-manager, skip here
    } else if (session.type === 'browser-tab') {
      if (!getBrowserTabInstance(session.id)) {
        createBrowserTabPane(session.id, session.browserTabUrl);
      }
    } else {
      if (!getTerminalInstance(session.id)) {
        createTerminalPane(session.id, project.path, session.cliSessionId, !!session.cliSessionId, session.args || '', session.providerId || 'claude', project.id);
      }
    }
  }

  hideAllPanes();
  hideAllInspectorPanes();
  hideAllFileViewerPanes();
  hideAllFileReaderPanes();
  hideAllRemotePanes();
  hideAllBrowserTabPanes();

  if (project.layout.mode === 'swarm' && project.layout.splitPanes.length >= 1) {
    renderSwarmMode(project);
  } else if (project.layout.mode === 'split' && project.layout.splitPanes.length > 1) {
    renderSplitMode(project);
  } else {
    renderTabMode(project);
  }

  requestAnimationFrame(fitAllVisible);
}

/** Attach and show a non-CLI session pane. */
function attachNonCliPane(session: { id: string; type?: string; fileReaderLine?: number }, target: HTMLElement, inSplit: boolean): void {
  if (session.type === 'file-reader') {
    attachFileReaderToContainer(session.id, target);
    showFileReaderPane(session.id, inSplit);
    if (session.fileReaderLine) {
      setFileReaderLine(session.id, session.fileReaderLine);
    }
  } else if (session.type === 'diff-viewer') {
    attachFileViewerToContainer(session.id, target);
    showFileViewerPane(session.id, inSplit);
  } else if (session.type === 'mcp-inspector') {
    attachInspectorToContainer(session.id, target);
    showInspectorPane(session.id, inSplit);
  } else if (session.type === 'remote-terminal') {
    attachRemoteToContainer(session.id, target);
    showRemotePane(session.id, inSplit);
  } else if (session.type === 'browser-tab') {
    attachBrowserTabToContainer(session.id, target);
    showBrowserTabPane(session.id, inSplit);
  }
}

function renderTabMode(project: ProjectRecord): void {
  clearSwarmReorderDecorations();
  setContainerClass('');
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';

  const activeId = project.activeSessionId;
  if (!activeId) return;

  const activeSession = project.sessions.find(s => s.id === activeId);
  if (activeSession?.type && activeSession.type !== 'claude') {
    attachNonCliPane(activeSession, container, false);
    return;
  }

  attachToContainer(activeId, container);
  showPane(activeId, false);

  // Don't steal focus from an active tab rename input
  if (!document.querySelector('#tab-list .tab-name input')) {
    setFocused(activeId);
  }

  const instance = getTerminalInstance(activeId);
  if (instance && !instance.spawned && !instance.exited) {
    requestAnimationFrame(() => {
      spawnTerminal(activeId);
      fitAllVisible();
    });
  }
}

/** Attach, show, and ensure-spawn for each pane in the list. */
function showPanes(project: ProjectRecord, target: HTMLElement = container, paneIds: string[] = project.layout.splitPanes): void {
  for (const paneId of paneIds) {
    const session = project.sessions.find(s => s.id === paneId);
    if (session?.type && session.type !== 'claude') {
      attachNonCliPane(session, target, true);
      continue;
    }

    attachToContainer(paneId, target);
    showPane(paneId, true);

    const instance = getTerminalInstance(paneId);
    if (instance && !instance.spawned && !instance.exited) {
      requestAnimationFrame(() => spawnTerminal(paneId));
    }
  }
}

function focusActivePane(project: ProjectRecord): void {
  // Don't steal focus from an active tab rename input
  if (document.querySelector('#tab-list .tab-name input')) return;

  const activeSession = project.activeSessionId
    ? project.sessions.find((session) => session.id === project.activeSessionId)
    : undefined;
  if (activeSession?.type && activeSession.type !== 'claude') {
    clearFocused();
    return;
  }

  if (project.activeSessionId && project.layout.splitPanes.includes(project.activeSessionId)) {
    setFocused(project.activeSessionId);
  } else if (project.layout.splitPanes.length > 0) {
    setFocused(project.layout.splitPanes[0]);
  } else {
    clearFocused();
  }
}

function renderSplitMode(project: ProjectRecord): void {
  clearSwarmReorderDecorations();
  setContainerClass(`split-${project.layout.splitDirection}`);
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';
  showPanes(project);
  focusActivePane(project);
}

function renderSwarmMode(project: ProjectRecord): void {
  const visibleSessions = getVisibleSwarmSessions(project);
  const visiblePaneIds = visibleSessions.map((session) => session.id);
  const count = visiblePaneIds.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const hasInspector = isInspectorOpen();

  setContainerClass('swarm-mode');

  const needsWrapper = hasInspector;

  if (needsWrapper) {
    const colParts: string[] = ['1fr'];
    if (hasInspector) colParts.push('var(--inspector-width, 350px)');

    container.style.gridTemplateColumns = colParts.join(' ');
    container.style.gridTemplateRows = '1fr';

    const gridWrapper = document.createElement('div');
    gridWrapper.className = 'swarm-grid-wrapper';
    gridWrapper.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridWrapper.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    container.appendChild(gridWrapper);

    showPanes(project, gridWrapper, visiblePaneIds);
    appendEmptyCells(cols * rows - count, gridWrapper);
    decorateSwarmReorderHandles(project, gridWrapper);

    if (hasInspector) {
      const inspectorEl = container.querySelector('#session-inspector');
      if (inspectorEl) {
        container.appendChild(inspectorEl);
      }
    }
  } else {
    container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    showPanes(project, container, visiblePaneIds);
    appendEmptyCells(cols * rows - count, container);
    decorateSwarmReorderHandles(project);
  }

  updateSwarmPaneStyles(project);
  focusActivePane(project);
}

function appendEmptyCells(count: number, target: HTMLElement): void {
  for (let i = 0; i < count; i++) {
    const cell = document.createElement('div');
    cell.className = 'swarm-empty-cell';

    const btn = document.createElement('button');
    btn.className = 'swarm-empty-add-btn';
    btn.textContent = '+';
    btn.title = 'New session';
    btn.addEventListener('click', () => quickNewSession());

    cell.appendChild(btn);
    target.appendChild(cell);
  }
}

function updateSwarmPaneStyles(project: ProjectRecord): void {
  for (const paneId of project.layout.splitPanes) {
    const instance = getTerminalInstance(paneId);
    if (instance) {
      const isActive = paneId === project.activeSessionId;
      instance.element.classList.toggle('swarm-dimmed', !isActive);
      instance.element.classList.toggle('swarm-unread', !isActive && isUnread(paneId));
    }
  }

  for (const session of project.sessions) {
    if (session.type !== 'browser-tab') continue;
    const instance = getBrowserTabInstance(session.id);
    if (!instance) continue;
    const pane = ('element' in instance ? instance.element : instance) as HTMLElement;
    pane.classList.toggle('swarm-dimmed', session.id !== project.activeSessionId);
  }
}

function showEmptyState(project: ProjectRecord | undefined): void {
  removeEmptyState();
  const el = document.createElement('div');
  el.className = 'empty-state';

  const card = document.createElement('div');
  card.className = 'empty-state-card';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'empty-state-eyebrow';

  const title = document.createElement('div');
  title.className = 'empty-state-title';

  const copy = document.createElement('div');
  copy.className = 'empty-state-copy';

  const detail = document.createElement('div');
  detail.className = 'empty-state-detail';

  const actions = document.createElement('div');
  actions.className = 'empty-state-actions';

  const primary = document.createElement('button');
  primary.id = 'empty-state-primary-action';
  primary.className = 'empty-state-primary-action';

  if (!project) {
    eyebrow.textContent = 'Workspace';
    title.textContent = 'Choose A Project';
    copy.textContent = 'Start by adding a local codebase to the project rail. Calder will keep sessions, project signals, and tool context grouped around that workspace.';
    detail.textContent = 'Project rail: switch workspaces on the left. Command deck: launch work in the center. Context inspector: monitor health and git on the right.';
    primary.textContent = 'Create Project';
    primary.addEventListener('click', () => promptNewProject());
  } else {
    eyebrow.textContent = 'Workspace Ready';
    title.textContent = `Ready For ${project.name}`;
    copy.textContent = 'This workspace is connected and waiting for a live session. Launch one from here to start coding, resume context, and keep follow-up tools attached to the same project.';
    detail.textContent = `${project.path} · Sessions stay grouped under this workspace shell.`;
    primary.textContent = 'Start First Session';
    primary.addEventListener('click', () => quickNewSession());
  }

  actions.appendChild(primary);
  card.appendChild(eyebrow);
  card.appendChild(title);
  card.appendChild(copy);
  card.appendChild(detail);
  card.appendChild(actions);
  el.appendChild(card);
  container.appendChild(el);
}

function removeEmptyState(): void {
  container.querySelector('.empty-state')?.remove();
}
