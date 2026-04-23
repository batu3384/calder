import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import { appState } from '../../state.js';
import { buildAppliedContextSummary } from '../../project-context-prompt.js';
import {
  getProviderAvailabilitySnapshot,
  resolvePreferredProviderForLaunch,
} from '../../provider-availability.js';
import {
  enableComposerDragging as enableComposerDraggingBehavior,
  positionComposerNearPointer as positionComposerNearPointerBehavior,
} from './composer-position.js';
import {
  openInspect,
} from './inspect-mode.js';
import { createSelectionPayload } from './selection.js';
import { inferCliRegions } from './heuristics.js';
import { renderCliHoverOverlay } from './hover-overlay.js';
import {
  getContextModeForSelection as getContextModeForSelectionBehavior,
} from './context-controls.js';
import {
  buildSemanticMeta as buildSemanticMetaBehavior,
  getFocusedSemanticNodeId as getFocusedSemanticNodeIdBehavior,
  getSemanticNodeForSelection as getSemanticNodeForSelectionBehavior,
} from './semantic-state.js';
import { detectCliAdapter } from './adapters/registry.js';
import type { InferredCliRegion } from './heuristics.js';
import {
  pointerToCell,
  selectionFromTerminal,
} from './inspect-geometry.js';
import {
  deriveSemanticRegions,
  findContainingInferredRegion,
  findContainingSemanticRegion,
  findSelectableRegionAtCell as findSelectableRegionAtCellBehavior,
  reconcileHoveredRegion,
  resolveSelectionSource,
  type SelectableCliRegion,
} from './inspect-selection.js';
import {
  type CliSurfaceLayoutElements,
} from './pane-elements.js';
import { type CliSurfaceInstance } from './pane-instance.js';
import { formatCliSurfaceTiming, renderCliSurfaceRuntimeMeta } from './pane-meta.js';
import { createCliSurfaceInspectStateHelpers } from './pane-inspect-state.js';
import { createCliSurfaceFrameHelpers } from './pane-frame-helpers.js';
import {
  bindCliSurfaceInspectActionHandlers,
  bindCliSurfaceInspectPointerHandlers,
  bindCliSurfaceRuntimeActionHandlers,
  createCliSurfaceTargetMenuControllerWithHandlers,
} from './pane-action-handlers.js';
import {
  getCliSurfaceProject,
  getCliSurfaceRuntimeState,
  resolveCliSurfaceSelectedProfile,
  updateCliSurfaceRuntimeState,
} from './pane-project-state.js';
import {
  createCliSurfaceComposerHelpers,
  setInspectPayloadFromPointer,
  showComposerError,
} from './pane-composer-helpers.js';
import { createCliSurfacePaneStore } from './pane-store.js';
import { attachCliSurfacePaneBindings } from './pane-event-orchestration.js';
import {
  attachCliSurfacePaneToContainer,
  destroyCliSurfacePaneInstance,
  ensureCliSurfacePaneInstance,
  getCliSurfacePaneInstanceFromStore,
  hideAllCliSurfacePaneElements,
  showCliSurfacePaneByProject,
} from './pane-lifecycle-orchestration.js';

export { formatCliSurfaceTiming } from './pane-meta.js';

const store = createCliSurfacePaneStore();

function getCliSurfaceApi() {
  return typeof window !== 'undefined' ? window.calder?.cliSurface : undefined;
}

export function renderRuntimeMeta(instance: CliSurfaceInstance): void {
  renderCliSurfaceRuntimeMeta({
    instance,
    getRuntimeState: (projectId) => getCliSurfaceRuntimeState(appState, projectId),
    resolveSelectedProfile: (projectId) => resolveCliSurfaceSelectedProfile(appState, projectId),
    adapterHint: store.semanticAdapterHints.get(instance.projectId),
  });
}

function getSemanticRegions(instance: CliSurfaceInstance): SelectableCliRegion[] {
  const version = store.semanticRegionVersions.get(instance.projectId) ?? 0;
  if (instance.semanticRegionsVersion === version) {
    return instance.semanticRegions;
  }

  const focusedNodeId = getFocusedSemanticNodeIdBehavior(store.semanticFocusNodes, instance.projectId);
  instance.semanticRegions = deriveSemanticRegions({
    focusedNodeId,
    messages: store.semanticNodes.get(instance.projectId)?.values() ?? [],
  });
  instance.semanticRegionsVersion = version;
  instance.hoveredRegion = reconcileHoveredRegion(
    instance.hoveredRegion,
    instance.semanticRegions,
    instance.inferredRegions,
  );
  return instance.semanticRegions;
}

function findSelectableRegionAtCell(instance: CliSurfaceInstance, cell: { row: number; col: number }): SelectableCliRegion | null {
  return findSelectableRegionAtCellBehavior(
    getSemanticRegions(instance),
    getInferredRegions(instance),
    cell,
  );
}

export function buildInspectPayload(
  instance: CliSurfaceInstance,
  selection: SurfaceSelectionRange,
  options?: { includeAnsiSnapshot?: boolean },
) {
  const project = getCliSurfaceProject(appState, instance.projectId) ?? appState.activeProject;
  const runtime = getCliSurfaceRuntimeState(appState, instance.projectId);
  const profile = resolveCliSurfaceSelectedProfile(appState, instance.projectId);
  const inferredRegions = getInferredRegions(instance);
  const semanticRegions = getSemanticRegions(instance);
  const selectionHint = findContainingInferredRegion(inferredRegions, selection);
  const semanticRegion = findContainingSemanticRegion(semanticRegions, selection);
  const adapter = detectCliAdapter({
    command: runtime?.command ?? profile?.command,
    args: runtime?.args ?? profile?.args,
    title: profile?.name ?? runtime?.command,
    adapterHint: store.semanticAdapterHints.get(instance.projectId),
  });
  const semanticNode = semanticRegion?.semanticNodeId
    ? store.semanticNodes.get(instance.projectId)?.get(semanticRegion.semanticNodeId)
    : getSemanticNodeForSelectionBehavior(store.semanticNodes, instance.projectId, selection);
  const semanticMeta = buildSemanticMetaBehavior(
    store.semanticFocusNodes,
    store.semanticStateNodes,
    instance.projectId,
    semanticNode,
  );
  const adapterMeta = adapter?.enrich({
    ...(selectionHint?.label ? { inferredLabel: selectionHint.label } : {}),
    ...(semanticNode
      ? {
          semanticNodeId: semanticNode.nodeId,
          semanticLabel: semanticNode.label,
          semanticMeta,
        }
      : {}),
  });
  const selectionSource = resolveSelectionSource(selection, selectionHint, semanticRegion);
  const contextMode = getContextModeForSelectionBehavior(instance.contextModeOverride, selectionSource);
  const targetProviderId = appState.resolveSurfaceTargetSession(instance.projectId)?.providerId
    ?? resolvePreferredProviderForLaunch(
      appState.preferences.defaultProvider,
      getProviderAvailabilitySnapshot(),
    );
  return createSelectionPayload({
    projectId: instance.projectId,
    projectPath: project?.path ?? '',
    command: runtime?.command ?? profile?.command,
    args: runtime?.args ?? profile?.args,
    cwd: runtime?.cwd ?? profile?.cwd ?? project?.path,
    cols: instance.terminal.cols || runtime?.cols,
    rows: instance.terminal.rows || runtime?.rows,
    title: profile?.name ?? runtime?.command ?? 'CLI Surface',
    lines: instance.viewportLines,
    selection,
    contextMode,
    selectionSource,
    semanticNodeId: semanticRegion?.semanticNodeId ?? semanticNode?.nodeId,
    semanticLabel: semanticRegion?.semanticLabel ?? semanticNode?.label,
    sourceFile: semanticRegion?.sourceFile ?? semanticNode?.sourceFile,
    ansiSnapshot: options?.includeAnsiSnapshot ? instance.serializeAddon.serialize() : undefined,
    inferredLabel: selectionHint?.label,
    adapterMeta,
    appliedContext: buildAppliedContextSummary(instance.projectId, targetProviderId),
  });
}

function getInferredRegions(instance: CliSurfaceInstance): InferredCliRegion[] {
  const nextKey = instance.viewportLines.join('\n');
  if (instance.inferredRegionsKey === nextKey) {
    return instance.inferredRegions;
  }

  instance.inferredRegions = inferCliRegions(instance.viewportLines);
  instance.inferredRegionsKey = nextKey;
  instance.hoveredRegion = reconcileHoveredRegion(
    instance.hoveredRegion,
    instance.semanticRegions,
    instance.inferredRegions,
  );
  return instance.inferredRegions;
}

function showHoverRegion(instance: CliSurfaceInstance, region: SelectableCliRegion | null): void {
  renderCliHoverOverlay({
    projectId: instance.projectId,
    inspectActive: instance.inspectState.active,
    hasPayload: Boolean(instance.inspectState.payload),
    region,
    viewportLines: instance.viewportLines,
    viewportEl: instance.viewport,
    terminalRows: instance.terminal.rows,
    terminalCols: instance.terminal.cols,
    overlayEl: instance.hoverOverlayEl,
    labelEl: instance.hoverLabelEl,
    metaEl: instance.hoverMetaEl,
    previewEl: instance.hoverPreviewEl,
    semanticNodes: store.semanticNodes.get(instance.projectId),
    semanticFocusNodes: store.semanticFocusNodes.get(instance.projectId),
  });
}

const inspectStateHelpers = createCliSurfaceInspectStateHelpers({
  buildInspectPayload: (instance, selection) => buildInspectPayload(instance, selection),
  getInferredRegions: (instance) => getInferredRegions(instance),
  showHoverRegion: (instance, region) => showHoverRegion(instance, region),
});
const { syncViewportLines, renderInspectState, setInspectPayloadFromSelection, setHoverRegion } = inspectStateHelpers;

const frameHelpers = createCliSurfaceFrameHelpers({
  syncViewportLines: (instance) => syncViewportLines(instance),
  renderRuntimeMeta: (instance) => renderRuntimeMeta(instance),
  setInspectPayloadFromSelection: (instance, selection) => setInspectPayloadFromSelection(instance, selection),
  getRuntimeViewportSelection: (instance) => selectionFromTerminal({
    viewportLineCount: instance.viewportLines.length,
    terminalCols: instance.terminal.cols,
    viewportY: instance.terminal.buffer.active.viewportY,
    selectionText: instance.terminal.getSelection(),
    range: instance.terminal.getSelectionPosition(),
  }),
  resizeRuntime: (projectId, cols, rows) => {
    getCliSurfaceApi()?.resize(projectId, cols, rows);
  },
});
const { scheduleViewportRefresh, scheduleTerminalDataFlush, fitSurface } = frameHelpers;

export function attachPaneBindings(): void {
  attachCliSurfacePaneBindings({
    getApi: getCliSurfaceApi,
    subscribeState: (event, cb) => {
      appState.on(event, cb);
    },
    getProjectIds: () => appState.projects.map((project) => project.id),
    destroyPane: (projectId) => destroyCliSurfacePane(projectId),
    store,
    renderRuntimeMeta: (instance) => renderRuntimeMeta(instance),
    renderInspectState: (instance) => renderInspectState(instance),
    setInspectPayloadFromSelection: (instance, selection) => setInspectPayloadFromSelection(instance, selection),
    scheduleTerminalDataFlush: (instance) => scheduleTerminalDataFlush(instance),
    updateRuntimeState: (projectId, state) => updateCliSurfaceRuntimeState(appState, projectId, state),
    getRuntimeState: (projectId) => getCliSurfaceRuntimeState(appState, projectId),
    showComposerError: (instance, message) => showComposerError(instance, message),
  });
}

export function bindCliSurfaceInstanceHandlers(
  projectId: string,
  instance: CliSurfaceInstance,
  layout: CliSurfaceLayoutElements,
): void {
  const helpers = createCliSurfaceComposerHelpers(
    instance,
    buildInspectPayload,
    () => renderInspectState(instance),
  );

  instance.targetMenuController = createCliSurfaceTargetMenuControllerWithHandlers(instance, helpers);
  bindCliSurfaceRuntimeActionHandlers({
    projectId,
    context: instance,
    controls: layout,
    resolveSelectedProfile: (nextProjectId) => resolveCliSurfaceSelectedProfile(appState, nextProjectId),
    getCliSurfaceApi,
    renderInspectState: () => renderInspectState(instance),
    setInspectPayloadFromSelection: (selection) => setInspectPayloadFromSelection(instance, selection),
    helpers,
  });
  bindCliSurfaceInspectActionHandlers({
    context: instance,
    openInspectComposer: () => {
      instance.inspectState = openInspect(instance.inspectState);
      renderInspectState(instance);
    },
    helpers,
  });
  bindCliSurfaceInspectPointerHandlers({
    context: instance,
    renderInspectState: () => renderInspectState(instance),
    setInspectPayloadFromSelection: (selection) => {
      if (!selection) {
        renderInspectState(instance);
        return;
      }
      setInspectPayloadFromSelection(instance, selection);
    },
    setInspectPayloadFromPointer: (event) => setInspectPayloadFromPointer(
      instance,
      event,
      (selection) => setInspectPayloadFromSelection(instance, selection),
    ),
    setHoverRegion: (region) => setHoverRegion(instance, region),
    pointerToCell: (event) => pointerToCell(instance.viewport, instance.terminal.cols, instance.terminal.rows, event),
    findSelectableRegionAtCell: (cell) => findSelectableRegionAtCell(instance, cell),
    selectionFromTerminal: () => selectionFromTerminal({
      viewportLineCount: instance.viewportLines.length,
      terminalCols: instance.terminal.cols,
      viewportY: instance.terminal.buffer.active.viewportY,
      selectionText: instance.terminal.getSelection(),
      range: instance.terminal.getSelectionPosition(),
    }),
    positionComposerNearPointer: (event) => {
      positionComposerNearPointerBehavior({
        paneEl: instance.element,
        composerEl: instance.composerEl,
        event: event as PointerEvent,
      });
    },
    onContextModeOverrideChange: (mode) => {
      instance.contextModeOverride = mode;
      const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
      if (selection) {
        setInspectPayloadFromSelection(instance, selection);
        return;
      }
      renderInspectState(instance);
    },
    writeToRuntime: (nextProjectId, data) => {
      getCliSurfaceApi()?.write(nextProjectId, data);
    },
  });
}

function initializeCliSurfaceInstance(instance: CliSurfaceInstance): void {
  store.instances.set(instance.projectId, instance);
  instance.cleanupFns.push(enableComposerDraggingBehavior({
    paneEl: instance.element,
    composerEl: instance.composerEl,
    handleEl: instance.composerHandleEl,
  }));
  syncViewportLines(instance);
  renderRuntimeMeta(instance);
  renderInspectState(instance);
}

function ensureInstance(projectId: string): CliSurfaceInstance {
  return ensureCliSurfaceInstance(projectId);
}

export function ensureCliSurfaceInstance(projectId: string): CliSurfaceInstance {
  return ensureCliSurfacePaneInstance({
    projectId,
    store,
    attachPaneBindings: () => attachPaneBindings(),
    bindCliSurfaceInstanceHandlers: (nextProjectId, instance, layout) => {
      bindCliSurfaceInstanceHandlers(nextProjectId, instance, layout);
    },
    initializeCliSurfaceInstance: (instance) => initializeCliSurfaceInstance(instance),
    resolveProjectPath: (nextProjectId) => getCliSurfaceProject(appState, nextProjectId)?.path,
    openExternal: (url, cwd) => window.calder.app.openExternal(url, cwd),
  });
}

export const __cliSurfacePaneInternals = {
  renderRuntimeMeta,
  buildInspectPayload,
  attachPaneBindings,
  bindCliSurfaceInstanceHandlers,
  ensureCliSurfaceInstance,
};

export function attachCliSurfacePane(projectId: string, container: HTMLElement): void {
  attachCliSurfacePaneToContainer(projectId, container, ensureInstance);
}

export function showCliSurfacePane(projectId: string): void {
  showCliSurfacePaneByProject(projectId, ensureInstance, fitSurface);
}

export function hideAllCliSurfacePanes(): void {
  hideAllCliSurfacePaneElements(store);
}

export function getCliSurfacePaneInstance(projectId: string): CliSurfaceInstance | undefined {
  return getCliSurfacePaneInstanceFromStore(store, projectId);
}

export function destroyCliSurfacePane(projectId: string): void {
  destroyCliSurfacePaneInstance(store, projectId);
}
