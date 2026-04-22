import type {
  CliSurfaceRuntimeState,
  SurfaceSelectionRange,
} from '../../../shared/types/project.js';
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
  getSemanticBucket as getSemanticBucketBehavior,
  getSemanticNodeForSelection as getSemanticNodeForSelectionBehavior,
  normalizeSemanticAdapterHint as normalizeSemanticAdapterHintBehavior,
} from './semantic-state.js';
import { detectCliAdapter } from './adapters/registry.js';
import { extractCalderOscMessages, type CalderProtocolMessage } from './protocol.js';
import type { InferredCliRegion } from './heuristics.js';
import { clearCliSurfaceLinkDispatch } from './link-dispatch.js';
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
  attachCliSurfaceRuntimeBindings,
  attachCliSurfaceStateBindings,
} from './runtime-bindings.js';
import {
  createCliSurfaceLayout,
  createCliSurfaceTerminal,
  type CliSurfaceLayoutElements,
} from './pane-elements.js';
import { createCliSurfaceInstance, type CliSurfaceInstance } from './pane-instance.js';
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

export { formatCliSurfaceTiming } from './pane-meta.js';

const instances = new Map<string, CliSurfaceInstance>();
const semanticNodes = new Map<string, Map<string, CalderProtocolMessage>>();
const semanticFocusNodes = new Map<string, Map<string, CalderProtocolMessage>>();
const semanticStateNodes = new Map<string, Map<string, CalderProtocolMessage>>();
const semanticAdapterHints = new Map<string, string>();
const protocolRemainders = new Map<string, string>();
const semanticRegionVersions = new Map<string, number>();

function getCliSurfaceApi() {
  return typeof window !== 'undefined' ? window.calder?.cliSurface : undefined;
}

function clearProjectSurfaceCaches(projectId: string): void {
  semanticNodes.delete(projectId);
  semanticFocusNodes.delete(projectId);
  semanticStateNodes.delete(projectId);
  semanticAdapterHints.delete(projectId);
  protocolRemainders.delete(projectId);
  semanticRegionVersions.delete(projectId);
  clearCliSurfaceLinkDispatch(projectId);
}

export function renderRuntimeMeta(instance: CliSurfaceInstance): void {
  renderCliSurfaceRuntimeMeta({
    instance,
    getRuntimeState: (projectId) => getCliSurfaceRuntimeState(appState, projectId),
    resolveSelectedProfile: (projectId) => resolveCliSurfaceSelectedProfile(appState, projectId),
    adapterHint: semanticAdapterHints.get(instance.projectId),
  });
}

function getSemanticRegions(instance: CliSurfaceInstance): SelectableCliRegion[] {
  const version = semanticRegionVersions.get(instance.projectId) ?? 0;
  if (instance.semanticRegionsVersion === version) {
    return instance.semanticRegions;
  }

  const focusedNodeId = getFocusedSemanticNodeIdBehavior(semanticFocusNodes, instance.projectId);
  instance.semanticRegions = deriveSemanticRegions({
    focusedNodeId,
    messages: semanticNodes.get(instance.projectId)?.values() ?? [],
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
    adapterHint: semanticAdapterHints.get(instance.projectId),
  });
  const semanticNode = semanticRegion?.semanticNodeId
    ? semanticNodes.get(instance.projectId)?.get(semanticRegion.semanticNodeId)
    : getSemanticNodeForSelectionBehavior(semanticNodes, instance.projectId, selection);
  const semanticMeta = buildSemanticMetaBehavior(semanticFocusNodes, semanticStateNodes, instance.projectId, semanticNode);
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
    semanticNodes: semanticNodes.get(instance.projectId),
    semanticFocusNodes: semanticFocusNodes.get(instance.projectId),
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
  attachCliSurfaceRuntimeBindings({
    getApi: getCliSurfaceApi,
    onData: (projectId, data) => {
      const { plainText, messages, remainder } = extractCalderOscMessages(data, protocolRemainders.get(projectId) ?? '');
      if (remainder) {
        protocolRemainders.set(projectId, remainder);
      } else {
        protocolRemainders.delete(projectId);
      }
      if (messages.length > 0) {
        for (const message of messages) {
          if (message.type === 'focus') {
            const bucket = new Map<string, CalderProtocolMessage>();
            bucket.set(message.nodeId, message);
            semanticFocusNodes.set(projectId, bucket);
          } else {
            const store = message.type === 'state' ? semanticStateNodes : semanticNodes;
            getSemanticBucketBehavior(store, projectId).set(message.nodeId, message);
          }
          const adapterHint = normalizeSemanticAdapterHintBehavior(message.meta?.framework);
          if (adapterHint) {
            semanticAdapterHints.set(projectId, adapterHint);
          }
        }
        semanticRegionVersions.set(projectId, (semanticRegionVersions.get(projectId) ?? 0) + 1);
      }

      const instance = instances.get(projectId);
      if (!instance) return;
      if (messages.length > 0) {
        renderRuntimeMeta(instance);
        const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
        if (selection) {
          setInspectPayloadFromSelection(instance, selection);
        }
      }
      if (!plainText) return;
      instance.pendingDataChunks.push(plainText);
      scheduleTerminalDataFlush(instance);
    },
    onStatus: (projectId, state) => {
      updateCliSurfaceRuntimeState(appState, projectId, state as CliSurfaceRuntimeState);
      const instance = instances.get(projectId);
      if (!instance) return;
      renderRuntimeMeta(instance);
    },
    onExit: (projectId, exitCode) => {
      const instance = instances.get(projectId);
      if (!instance) return;
      const runtime = getCliSurfaceRuntimeState(appState, projectId);
      if (runtime) {
        updateCliSurfaceRuntimeState(appState, projectId, {
          ...runtime,
          status: 'stopped',
          lastExitCode: exitCode,
        });
      }
      renderRuntimeMeta(instance);
    },
    onError: (projectId, message) => {
      const instance = instances.get(projectId);
      if (!instance) return;
      const runtime = getCliSurfaceRuntimeState(appState, projectId);
      updateCliSurfaceRuntimeState(appState, projectId, {
        ...(runtime ?? { status: 'error' }),
        status: 'error',
        lastError: message,
      });
      renderRuntimeMeta(instance);
      showComposerError(instance, message);
    },
  });

  attachCliSurfaceStateBindings({
    subscribe: (event, cb) => {
      appState.on(event, cb);
    },
    rerender: () => {
      const activeProjectIds = new Set(appState.projects.map((project) => project.id));
      for (const projectId of [...instances.keys()]) {
        if (!activeProjectIds.has(projectId)) {
          destroyCliSurfacePane(projectId);
        }
      }
      instances.forEach((instance) => {
        renderRuntimeMeta(instance);
        renderInspectState(instance);
      });
    },
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
  instances.set(instance.projectId, instance);
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
  const existing = instances.get(projectId);
  if (existing) return existing;

  attachPaneBindings();

  const layout = createCliSurfaceLayout(projectId);
  const terminalElements = createCliSurfaceTerminal(
    projectId,
    layout.viewport,
    layout.hoverOverlay,
    layout.selectionOverlay,
    {
      resolveProjectPath: (nextProjectId) => getCliSurfaceProject(appState, nextProjectId)?.path,
      openExternal: (url, cwd) => window.calder.app.openExternal(url, cwd),
    },
  );

  const instance = createCliSurfaceInstance(projectId, layout, terminalElements);
  bindCliSurfaceInstanceHandlers(projectId, instance, layout);
  initializeCliSurfaceInstance(instance);
  return instance;
}

export const __cliSurfacePaneInternals = {
  renderRuntimeMeta,
  buildInspectPayload,
  attachPaneBindings,
  bindCliSurfaceInstanceHandlers,
  ensureCliSurfaceInstance,
};

export function attachCliSurfacePane(projectId: string, container: HTMLElement): void {
  const instance = ensureInstance(projectId);
  if (instance.element.parentElement !== container) {
    container.appendChild(instance.element);
  }
}

export function showCliSurfacePane(projectId: string): void {
  const instance = ensureInstance(projectId);
  instance.element.classList.remove('hidden');
  fitSurface(instance);
}

export function hideAllCliSurfacePanes(): void {
  instances.forEach((instance) => instance.element.classList.add('hidden'));
}

export function getCliSurfacePaneInstance(projectId: string): CliSurfaceInstance | undefined {
  return instances.get(projectId);
}

export function destroyCliSurfacePane(projectId: string): void {
  const instance = instances.get(projectId);
  if (!instance) {
    clearProjectSurfaceCaches(projectId);
    return;
  }

  instances.delete(projectId);

  if (instance.targetMenuOutsideClickHandler) {
    document.removeEventListener('mousedown', instance.targetMenuOutsideClickHandler);
  }
  instance.targetMenuController?.closeMenu();
  for (const cleanup of instance.cleanupFns) {
    try {
      cleanup();
    } catch {
      // Best-effort cleanup only.
    }
  }

  try {
    (instance.terminal as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // Terminal may already be disposed in tests or during teardown.
  }
  instance.element.remove();
  clearProjectSurfaceCaches(projectId);
}
