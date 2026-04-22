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
import { isInspectorOpen } from './session-inspector/session-inspector.js';
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
import { hideAllCliSurfacePanes } from './cli-surface/pane.js';
import { hideAllMobileSurfacePanes } from './mobile-surface/pane.js';
import { hasPinnedSurfaceFocus, renderSurfaceHost } from './surface-host.js';
import { quickNewSession } from './tab-bar/tab-bar.js';
import { promptNewProject } from './sidebar.js';
import { clampRatio, resolveMosaicPreset } from './mosaic-layout-model.js';
import {
  bindMosaicDivider,
  createMosaicDivider,
  formatInverseRatio,
  formatRatio,
  renderSwarmMosaicPreset,
} from './split-layout-mosaic.js';
import { getLayoutRenderSignature } from './split-layout-signature.js';
import { removeEmptyState, showEmptyState } from './split-layout-empty-state.js';

const container = document.getElementById('terminal-container')!;
const SWARM_PANE_SELECTOR = '.terminal-pane, .browser-tab-pane, .file-viewer-pane, .file-reader-pane, .mcp-inspector-pane';
const SWARM_REORDER_HEADER_SELECTOR = '.terminal-pane-chrome, .file-viewer-header, .mcp-inspector-header';
const MOSAIC_DIVIDER_TRACK = '10px';
const INSPECTOR_WIDTH_FALLBACK = 350;
const SURFACE_COLUMN_MIN = '288px';
const SURFACE_RATIO_MIN = 0.25;
const SURFACE_RATIO_MAX = 0.7;
const SURFACE_RATIO_FALLBACK = 0.38;
let draggingSwarmSessionId: string | null = null;
const lastSwarmBrowserSessionIds = new Map<string, string>();
let mosaicResizeCleanups: Array<() => void> = [];
let lastLayoutRenderSignature: string | null = null;

function isMosaicMode(project: ProjectRecord | undefined): boolean {
  return !!project && project.layout.mode === 'mosaic';
}

function getPaneCandidates(root: ParentNode = container): HTMLElement[] {
  const selectors = ['.terminal-pane', '.browser-tab-pane', '.file-viewer-pane', '.file-reader-pane', '.mcp-inspector-pane'];
  return selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)) as HTMLElement[]);
}

function findPaneBySessionId(sessionId: string, root: ParentNode = container): HTMLElement | null {
  return getPaneCandidates(root).find((pane) => pane.dataset.sessionId === sessionId) ?? null;
}

function findSwarmReorderHandle(pane: ParentNode): HTMLElement | null {
  const selectors = ['.terminal-pane-chrome', '.file-viewer-header', '.mcp-inspector-header'];
  for (const selector of selectors) {
    const handle = pane.querySelector(selector) as HTMLElement | null;
    if (handle) return handle;
  }
  return null;
}

function getSwarmBrowserSession(project: ProjectRecord) {
  const activeSession = project.activeSessionId
    ? project.sessions.find((session) => session.id === project.activeSessionId)
    : undefined;
  if (activeSession?.type === 'browser-tab') {
    lastSwarmBrowserSessionIds.set(project.id, activeSession.id);
    return activeSession;
  }

  const rememberedId = lastSwarmBrowserSessionIds.get(project.id);
  if (rememberedId) {
    const remembered = project.sessions.find((session) => session.id === rememberedId && session.type === 'browser-tab');
    if (remembered) return remembered;
  }

  const latest = [...project.sessions].reverse().find((session) => session.type === 'browser-tab');
  if (latest) {
    lastSwarmBrowserSessionIds.set(project.id, latest.id);
  } else {
    lastSwarmBrowserSessionIds.delete(project.id);
  }
  return latest;
}

function getVisibleSwarmSessions(project: ProjectRecord) {
  const visibleIds = new Set(project.layout.splitPanes);
  return project.sessions.filter((session) => visibleIds.has(session.id) && (!session.type || session.type === 'claude'));
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

function clearMosaicResizeBindings(): void {
  for (const cleanup of mosaicResizeCleanups) {
    cleanup();
  }
  mosaicResizeCleanups = [];
}

function registerMosaicResizeCleanup(cleanup: () => void): void {
  mosaicResizeCleanups.push(cleanup);
}

function readInspectorWidth(target: HTMLElement): number {
  const inlineStyle = target.style as CSSStyleDeclaration & Record<string, string | undefined>;
  const inlineWidthValue = typeof inlineStyle.getPropertyValue === 'function'
    ? target.style.getPropertyValue('--inspector-width')
    : inlineStyle.getPropertyValue?.('--inspector-width') ?? inlineStyle['--inspector-width'];
  const inlineWidth = Number.parseFloat(inlineWidthValue ?? '');
  if (Number.isFinite(inlineWidth) && inlineWidth > 0) return inlineWidth;

  const inspector = target.querySelector('#session-inspector') as HTMLElement | null;
  const inspectorWidth = inspector?.getBoundingClientRect().width ?? 0;
  if (inspectorWidth > 0) return inspectorWidth;

  return INSPECTOR_WIDTH_FALLBACK;
}

function getSurfaceResizeBounds(target: HTMLElement, hasInspector: boolean): DOMRect {
  const bounds = target.getBoundingClientRect();
  if (!hasInspector) return bounds;

  const inspectorWidth = Math.min(readInspectorWidth(target), bounds.width);
  const width = Math.max(0, bounds.width - inspectorWidth);
  return {
    ...bounds,
    width,
    right: bounds.left + width,
    x: bounds.left,
    y: bounds.top,
  } as DOMRect;
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

function registerInspectorRelayoutBridge(): void {
  import('./session-inspector/session-inspector.js')
    .then((inspectorModule) => {
      inspectorModule.setSessionInspectorRelayoutCallback?.(() => {
        renderLayout();
      });
    })
    .catch(() => {
      // Keep layout functional even if the inspector module is mocked in isolated tests.
    });
}

export function initSplitLayout(): void {
  registerInspectorRelayoutBridge();

  appState.on('state-loaded', renderLayout);
  appState.on('project-changed', renderLayout);
  appState.on('session-added', onSessionAdded);
  appState.on('session-removed', onSessionRemoved);
  appState.on('session-changed', renderLayout);
  appState.on('layout-changed', renderLayout);

  onUnreadChange(() => {
    const project = appState.activeProject;
    if (project && isMosaicMode(project)) updateSwarmPaneStyles(project);
  });

  // Refit on window resize
  window.addEventListener('resize', () => {
    requestAnimationFrame(fitAllVisible);
  });

  // Click delegation for the mosaic canvas: clicking a dimmed pane makes it active
  container.addEventListener('mousedown', (e) => {
    const project = appState.activeProject;
    if (!project || !isMosaicMode(project)) return;
    if ((e.target as HTMLElement).closest(SWARM_REORDER_HEADER_SELECTOR)) return;

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
    const project = appState.activeProject;
    if (!project || !isMosaicMode(project) || !draggingSwarmSessionId) return;

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
    if (!project || !isMosaicMode(project) || !e.dataTransfer) return;

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
  const signature = getLayoutRenderSignature(project);
  if (signature === lastLayoutRenderSignature) {
    if (project && isMosaicMode(project)) {
      updateSwarmPaneStyles(project);
      focusActivePane(project);
    }
    return;
  }
  lastLayoutRenderSignature = signature;
  clearMosaicResizeBindings();

  if (!project || project.sessions.length === 0) {
    hideAllPanes();
    hideAllInspectorPanes();
    hideAllFileViewerPanes();
    hideAllFileReaderPanes();
    hideAllRemotePanes();
    hideAllBrowserTabPanes();
    hideAllCliSurfacePanes();
    hideAllMobileSurfacePanes();
    setContainerClass('');
    showEmptyState(container, project, promptNewProject, quickNewSession);
    return;
  }

  removeEmptyState(container);
  container.querySelectorAll('.swarm-grid-wrapper').forEach(el => el.remove());
  container.querySelectorAll('.swarm-browser-column').forEach(el => el.remove());
  container.querySelectorAll('.swarm-empty-cell').forEach(el => el.remove());
  container.querySelectorAll('.mosaic-session-canvas').forEach(el => el.remove());
  container.querySelectorAll('.mosaic-browser-column').forEach(el => el.remove());
  container.querySelectorAll('.mosaic-divider-browser').forEach(el => el.remove());

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
  hideAllCliSurfacePanes();
  hideAllMobileSurfacePanes();

  const activeSession = project.activeSessionId
    ? project.sessions.find((session) => session.id === project.activeSessionId)
    : undefined;

  if (isMosaicMode(project) && project.layout.splitPanes.length >= 1) {
    if (activeSession?.type && activeSession.type !== 'claude' && activeSession.type !== 'browser-tab') {
      renderTabMode(project);
    } else {
      renderSwarmMode(project);
    }
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
  delete container.dataset.mosaicPreset;
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';

  const activeId = project.activeSessionId;
  if (!activeId) return;

  const activeSession = project.sessions.find(s => s.id === activeId);
  if (activeSession?.type && activeSession.type !== 'claude') {
    clearFocused();
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

function renderSwarmMode(project: ProjectRecord): void {
  const visibleSessions = getVisibleSwarmSessions(project);
  const visiblePaneIds = visibleSessions.map((session) => session.id);
  const browserSession = getSwarmBrowserSession(project);
  const hasBrowserColumn = Boolean(hasPinnedSurfaceFocus(project) || browserSession);
  const count = visiblePaneIds.length;
  const resolvedPreset = resolveMosaicPreset(count, project.layout.mosaicPreset);
  const hasInspector = isInspectorOpen();

  setContainerClass('swarm-mode mosaic-mode');
  container.dataset.mosaicPreset = resolvedPreset;

  const surfaceRatio = clampRatio(
    project.layout.browserWidthRatio,
    SURFACE_RATIO_MIN,
    SURFACE_RATIO_MAX,
    SURFACE_RATIO_FALLBACK,
  );
  const applySurfaceColumns = (ratio: number) => {
    const clamped = clampRatio(ratio, SURFACE_RATIO_MIN, SURFACE_RATIO_MAX, SURFACE_RATIO_FALLBACK);
    const colParts: string[] = hasBrowserColumn
      ? [
          `minmax(${SURFACE_COLUMN_MIN}, ${formatRatio(clamped)}fr)`,
          MOSAIC_DIVIDER_TRACK,
          `minmax(0, ${formatInverseRatio(clamped)}fr)`,
        ]
      : ['1fr'];
    if (hasInspector) colParts.push('var(--inspector-width, 350px)');
    container.style.gridTemplateColumns = colParts.join(' ');
  };
  applySurfaceColumns(surfaceRatio);
  container.style.gridTemplateRows = '1fr';

  if (hasBrowserColumn) {
    const browserWrapper = document.createElement('div');
    browserWrapper.className = 'swarm-browser-column mosaic-browser-column';
    container.appendChild(browserWrapper);
    renderSurfaceHost(project, browserWrapper);

    const browserDivider = createMosaicDivider('x', 'mosaic-divider-browser');
    browserDivider.title = 'Drag to resize Live View and sessions';
    container.appendChild(browserDivider);
    bindMosaicDivider(browserDivider, () => getSurfaceResizeBounds(container, hasInspector), {
      onPreview: (ratio) => {
        applySurfaceColumns(ratio);
        requestAnimationFrame(() => fitAllVisible());
      },
      onCommit: (ratio) => appState.setBrowserWidthRatio(project.id, ratio),
    }, {
      axis: 'x',
      min: SURFACE_RATIO_MIN,
      max: SURFACE_RATIO_MAX,
      fallback: surfaceRatio,
    }, registerMosaicResizeCleanup);
  }

  const canvas = document.createElement('div');
  canvas.className = `swarm-grid-wrapper mosaic-session-canvas mosaic-${resolvedPreset}`;
  container.appendChild(canvas);
  renderSwarmMosaicPreset({
    project,
    canvas,
    preset: resolvedPreset,
    paneIds: visiblePaneIds,
    dividerTrack: MOSAIC_DIVIDER_TRACK,
    showPanes,
    registerResizeCleanup: registerMosaicResizeCleanup,
  });

  decorateSwarmReorderHandles(project, canvas);

  if (hasInspector) {
    const inspectorEl = container.querySelector('#session-inspector');
    if (inspectorEl) {
      container.appendChild(inspectorEl);
    }
  }

  updateSwarmPaneStyles(project);
  focusActivePane(project);
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
}
