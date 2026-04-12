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
import { hideAllCliSurfacePanes } from './cli-surface/pane.js';
import { renderSurfaceHost } from './surface-host.js';
import { quickNewSession } from './tab-bar.js';
import { promptNewProject } from './sidebar.js';
import { clampRatio, resolveMosaicPreset } from './mosaic-layout-model.js';
import { attachRatioHandle } from './mosaic-resize.js';

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

function getLayoutRenderSignature(project: ProjectRecord | undefined): string {
  if (!project) return 'no-project';
  return JSON.stringify({
    projectId: project.id,
    activeSessionId: project.activeSessionId,
    layout: {
      mode: project.layout.mode,
      splitPanes: project.layout.splitPanes,
      splitDirection: project.layout.splitDirection,
      browserWidthRatio: project.layout.browserWidthRatio,
      mosaicPreset: project.layout.mosaicPreset,
      mosaicRatios: project.layout.mosaicRatios ?? {},
    },
    surface: project.surface
      ? {
          kind: project.surface.kind,
          active: project.surface.active,
          webSessionId: project.surface.web?.sessionId ?? null,
          cliProfileId: project.surface.cli?.selectedProfileId ?? null,
        }
      : null,
    sessions: project.sessions.map((session) => ({
      id: session.id,
      type: session.type ?? 'claude',
      cliSessionId: session.cliSessionId ?? null,
      mcpServerUrl: session.mcpServerUrl ?? null,
      diffFilePath: session.diffFilePath ?? null,
      diffArea: session.diffArea ?? null,
      worktreePath: session.worktreePath ?? null,
      fileReaderPath: session.fileReaderPath ?? null,
      fileReaderLine: session.fileReaderLine ?? null,
      remoteHostName: session.remoteHostName ?? null,
    })),
  });
}

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

function formatRatio(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatInverseRatio(value: number): string {
  return formatRatio(1 - value);
}

function readMosaicRatio(project: ProjectRecord, key: string, fallback = 0.5): number {
  return clampRatio(project.layout.mosaicRatios?.[key], 0.2, 0.8, fallback);
}

function createMosaicSlot(className = 'mosaic-slot'): HTMLElement {
  const slot = document.createElement('div');
  slot.className = className;
  return slot;
}

function appendMosaicSlot(
  project: ProjectRecord,
  target: HTMLElement,
  paneIds: string[],
  className = 'mosaic-slot',
): HTMLElement {
  const slot = createMosaicSlot(className);
  target.appendChild(slot);
  showPanes(project, slot, paneIds);
  return slot;
}

function createMosaicDivider(axis: 'x' | 'y', className: string): HTMLElement {
  const divider = document.createElement('div');
  divider.className = `mosaic-divider ${className}`;
  divider.dataset.axis = axis;
  return divider;
}

function bindMosaicDivider(
  handle: HTMLElement,
  boundsTarget: HTMLElement | (() => DOMRect),
  callbacks: { onPreview?: (ratio: number) => void; onCommit?: (ratio: number) => void },
  options: { axis: 'x' | 'y'; min: number; max: number; fallback: number },
): void {
  const getBounds = typeof boundsTarget === 'function'
    ? boundsTarget
    : () => boundsTarget.getBoundingClientRect();
  mosaicResizeCleanups.push(
    attachRatioHandle(handle, getBounds, callbacks, options),
  );
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

export function initSplitLayout(): void {
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
    setContainerClass('');
    showEmptyState(project);
    return;
  }

  removeEmptyState();
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
  const hasBrowserColumn = Boolean(project.surface?.active || browserSession);
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
    });
  }

  const canvas = document.createElement('div');
  canvas.className = `swarm-grid-wrapper mosaic-session-canvas mosaic-${resolvedPreset}`;
  container.appendChild(canvas);

  if (resolvedPreset === 'single') {
    canvas.style.gap = '10px';
    canvas.style.gridTemplateColumns = '1fr';
    canvas.style.gridTemplateRows = '1fr';
    showPanes(project, canvas, visiblePaneIds);
  } else if (resolvedPreset === 'columns-2') {
    const primaryRatio = readMosaicRatio(project, 'columns-2-primary', 0.5);
    const applyColumns2 = (ratio: number) => {
      canvas.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
      canvas.style.gridTemplateRows = '1fr';
    };
    canvas.style.gap = '0';
    applyColumns2(primaryRatio);

    appendMosaicSlot(project, canvas, [visiblePaneIds[0]]);
    const primaryDivider = createMosaicDivider('x', 'mosaic-divider-primary');
    canvas.appendChild(primaryDivider);
    appendMosaicSlot(project, canvas, [visiblePaneIds[1]]);

    bindMosaicDivider(primaryDivider, canvas, {
      onPreview: (ratio) => applyColumns2(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'columns-2-primary', ratio),
    }, {
      axis: 'x',
      min: 0.2,
      max: 0.8,
      fallback: 0.5,
    });
  } else if (resolvedPreset === 'rows-2') {
    const primaryRatio = readMosaicRatio(project, 'rows-2-primary', 0.5);
    const applyRows2 = (ratio: number) => {
      canvas.style.gridTemplateColumns = '1fr';
      canvas.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    };
    canvas.style.gap = '0';
    applyRows2(primaryRatio);

    appendMosaicSlot(project, canvas, [visiblePaneIds[0]]);
    const primaryDivider = createMosaicDivider('y', 'mosaic-divider-primary');
    canvas.appendChild(primaryDivider);
    appendMosaicSlot(project, canvas, [visiblePaneIds[1]]);

    bindMosaicDivider(primaryDivider, canvas, {
      onPreview: (ratio) => applyRows2(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'rows-2-primary', ratio),
    }, {
      axis: 'y',
      min: 0.2,
      max: 0.8,
      fallback: 0.5,
    });
  } else if (resolvedPreset === 'focus-left' && count >= 3) {
    const mainRatio = readMosaicRatio(project, 'focus-left-main', 0.58);
    const stackRatio = readMosaicRatio(project, 'focus-left-stack', 0.5);
    const applyFocusLeftMain = (ratio: number) => {
      canvas.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
      canvas.style.gridTemplateRows = '1fr';
    };
    const applyFocusLeftStack = (ratio: number) => {
      stack.style.gridTemplateColumns = '1fr';
      stack.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    };
    canvas.classList.add('mosaic-focus-left');
    canvas.style.gap = '0';
    applyFocusLeftMain(mainRatio);

    appendMosaicSlot(project, canvas, [visiblePaneIds[0]], 'mosaic-focus-left-main');
    const primaryDivider = createMosaicDivider('x', 'mosaic-divider-primary');
    canvas.appendChild(primaryDivider);

    const stack = document.createElement('div');
    stack.className = 'mosaic-focus-left-stack';
    stack.style.gap = '0';
    applyFocusLeftStack(stackRatio);
    canvas.appendChild(stack);

    appendMosaicSlot(project, stack, [visiblePaneIds[1]]);
    const secondaryDivider = createMosaicDivider('y', 'mosaic-divider-secondary');
    stack.appendChild(secondaryDivider);
    appendMosaicSlot(project, stack, [visiblePaneIds[2]]);

    bindMosaicDivider(primaryDivider, canvas, {
      onPreview: (ratio) => applyFocusLeftMain(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-left-main', ratio),
    }, {
      axis: 'x',
      min: 0.2,
      max: 0.8,
      fallback: 0.58,
    });
    bindMosaicDivider(secondaryDivider, stack, {
      onPreview: (ratio) => applyFocusLeftStack(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-left-stack', ratio),
    }, {
      axis: 'y',
      min: 0.2,
      max: 0.8,
      fallback: 0.5,
    });
  } else if (resolvedPreset === 'focus-top' && count >= 3) {
    const mainRatio = readMosaicRatio(project, 'focus-top-main', 0.58);
    const rowRatio = readMosaicRatio(project, 'focus-top-row', 0.5);
    const applyFocusTopMain = (ratio: number) => {
      canvas.style.gridTemplateColumns = '1fr';
      canvas.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    };
    canvas.classList.add('mosaic-focus-top');
    canvas.style.gap = '0';
    applyFocusTopMain(mainRatio);

    appendMosaicSlot(project, canvas, [visiblePaneIds[0]], 'mosaic-focus-top-main');
    const primaryDivider = createMosaicDivider('y', 'mosaic-divider-primary');
    canvas.appendChild(primaryDivider);

    const row = document.createElement('div');
    row.className = 'mosaic-focus-top-row';
    const applyFocusTopRow = (ratio: number) => {
      row.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${MOSAIC_DIVIDER_TRACK} minmax(0, ${formatInverseRatio(ratio)}fr)`;
      row.style.gridTemplateRows = '1fr';
    };
    row.style.gap = '0';
    applyFocusTopRow(rowRatio);
    canvas.appendChild(row);

    appendMosaicSlot(project, row, [visiblePaneIds[1]]);
    const secondaryDivider = createMosaicDivider('x', 'mosaic-divider-secondary');
    row.appendChild(secondaryDivider);
    appendMosaicSlot(project, row, [visiblePaneIds[2]]);

    bindMosaicDivider(primaryDivider, canvas, {
      onPreview: (ratio) => applyFocusTopMain(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-top-main', ratio),
    }, {
      axis: 'y',
      min: 0.2,
      max: 0.8,
      fallback: 0.58,
    });
    bindMosaicDivider(secondaryDivider, row, {
      onPreview: (ratio) => applyFocusTopRow(ratio),
      onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-top-row', ratio),
    }, {
      axis: 'x',
      min: 0.2,
      max: 0.8,
      fallback: 0.5,
    });
  } else {
    canvas.classList.add('mosaic-grid-2x2');
    canvas.style.gap = '10px';
    canvas.style.gridTemplateColumns = 'repeat(2, 1fr)';
    canvas.style.gridTemplateRows = `repeat(${Math.max(2, Math.ceil(count / 2))}, 1fr)`;
    showPanes(project, canvas, visiblePaneIds);
  }

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
    eyebrow.textContent = 'Launchpad';
    title.textContent = 'Open a project or start a live run';
    copy.textContent = 'Pick a coding tool, open Live View, or resume recent sessions from one desk.';
    detail.textContent = 'Browser context stays on the left. Sessions and project signals stack on the right.';
    primary.textContent = 'Create Project';
    primary.addEventListener('click', () => promptNewProject());
  } else {
    eyebrow.textContent = 'Project ready';
    title.textContent = 'Start a run or open Live View';
    copy.textContent = 'Bring up a coding tool, inspect a page, or continue recent work from this project.';
    detail.textContent = `${project.path} · Live View stays pinned while sessions share the same project context.`;
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
