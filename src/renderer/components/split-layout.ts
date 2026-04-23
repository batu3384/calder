import { appState, ProjectRecord } from '../state.js';
import { isUnread, onChange as onUnreadChange } from '../session-unread.js';
import {
  attachToContainer,
  showPane,
  fitAllVisible,
  setFocused,
  clearFocused,
  spawnTerminal,
  getTerminalInstance,
} from './terminal-pane.js';
import { isInspectorOpen } from './session-inspector/session-inspector.js';
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
import {
  bindSwarmReorderInteractions,
  clearSwarmReorderDecorations,
  decorateSwarmReorderHandles,
  getVisibleSwarmSessions,
} from './split-layout-swarm-reorder.js';
import { getLayoutRenderSignature } from './split-layout-signature.js';
import { removeEmptyState, showEmptyState } from './split-layout-empty-state.js';
import {
  attachSplitLayoutNonCliPane,
  ensureSplitLayoutSessionInstances,
  handleSplitLayoutSessionAdded,
  handleSplitLayoutSessionRemoved,
  hideAllSplitLayoutPanes,
  removeSplitLayoutMosaicArtifacts,
  showSplitLayoutPanes,
} from './split-layout-pane-orchestration.js';
import {
  clearMosaicResizeBindings,
  getSurfaceResizeBounds,
  getSwarmBrowserSession,
  registerMosaicResizeCleanup,
} from './split-layout-mosaic-state.js';

const container = document.getElementById('terminal-container')!;
const MOSAIC_DIVIDER_TRACK = '10px';
const SURFACE_COLUMN_MIN = '288px';
const SURFACE_RATIO_MIN = 0.25;
const SURFACE_RATIO_MAX = 0.7;
const SURFACE_RATIO_FALLBACK = 0.38;
let lastLayoutRenderSignature: string | null = null;

function isMosaicMode(project: ProjectRecord | undefined): boolean {
  return !!project && project.layout.mode === 'mosaic';
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

  bindSwarmReorderInteractions({
    container,
    getProject: () => appState.activeProject,
    isMosaicMode,
    setActiveSession: (projectId, sessionId) => appState.setActiveSession(projectId, sessionId),
    reorderSession: (projectId, draggedSessionId, targetIndex) =>
      appState.reorderSession(projectId, draggedSessionId, targetIndex),
  });
}

function onSessionAdded(data: unknown): void {
  handleSplitLayoutSessionAdded(data, renderLayout);
}

function onSessionRemoved(data: unknown): void {
  handleSplitLayoutSessionRemoved(data, renderLayout);
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
    hideAllSplitLayoutPanes();
    setContainerClass('');
    showEmptyState(container, project, promptNewProject, quickNewSession);
    return;
  }

  removeEmptyState(container);
  removeSplitLayoutMosaicArtifacts(container);
  ensureSplitLayoutSessionInstances(project);
  hideAllSplitLayoutPanes();

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

function renderTabMode(project: ProjectRecord): void {
  clearSwarmReorderDecorations(container);
  setContainerClass('');
  delete container.dataset.mosaicPreset;
  container.style.gridTemplateColumns = '';
  container.style.gridTemplateRows = '';

  const activeId = project.activeSessionId;
  if (!activeId) return;

  const activeSession = project.sessions.find(s => s.id === activeId);
  if (activeSession?.type && activeSession.type !== 'claude') {
    clearFocused();
    attachSplitLayoutNonCliPane(activeSession, container, false);
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
  showSplitLayoutPanes(project, paneIds, target);
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

  decorateSwarmReorderHandles(project, container, canvas);

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
