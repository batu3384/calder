import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SerializeAddon } from '@xterm/addon-serialize';
import type {
  AppliedContextSummary,
  CliSurfacePromptContextMode,
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
  closeInspect,
  createInitialInspectState,
  openInspect,
  setInspectPayload,
  type CliInspectState,
} from './inspect-mode.js';
import { createSelectionPayload } from './selection.js';
import { inferCliRegions } from './heuristics.js';
import { renderCliHoverOverlay } from './hover-overlay.js';
import {
  getContextModeForSelection as getContextModeForSelectionBehavior,
  syncComposerContextControl as syncComposerContextControlBehavior,
  syncComposerContextTrace as syncComposerContextTraceBehavior,
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
import type { CliTargetMenuController } from './target-menu.js';
import type { InferredCliRegion } from './heuristics.js';
import { clearCliSurfaceLinkDispatch } from './link-dispatch.js';
import {
  pointerToCell,
  selectionFromCells,
  selectionFromTerminal,
  selectionsMatchBounds,
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
} from './pane-elements.js';
import {
  bindInspectPointerHandlers as bindInspectPointerHandlersModule,
} from './pane-bindings.js';
import { formatCliSurfaceTiming, renderCliSurfaceRuntimeMeta } from './pane-meta.js';
import {
  bindCliSurfaceInspectActionHandlers,
  bindCliSurfaceRuntimeActionHandlers,
  createCliSurfaceTargetMenuControllerWithHandlers,
} from './pane-action-handlers.js';

export { formatCliSurfaceTiming } from './pane-meta.js';

interface CliSurfaceInstance {
  projectId: string;
  element: HTMLDivElement;
  viewport: HTMLDivElement;
  selectionOverlayEl: HTMLDivElement;
  hoverOverlayEl: HTMLDivElement;
  hoverLabelEl: HTMLDivElement;
  hoverMetaEl: HTMLDivElement;
  hoverPreviewEl: HTMLPreElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  emptyEl: HTMLDivElement;
  metaEl: HTMLDivElement;
  routeEl: HTMLDivElement;
  adapterMetaEl: HTMLDivElement;
  inspectButton: HTMLButtonElement;
  composerEl: HTMLDivElement;
  composerHandleEl: HTMLDivElement;
  composerHintEl: HTMLDivElement;
  composerPreviewEl: HTMLPreElement;
  composerScopeEl: HTMLDivElement;
  composerContextTraceEl: HTMLDivElement;
  composerContextSelectEl: HTMLSelectElement;
  composerErrorEl: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenuEl: HTMLDivElement;
  targetMenuListEl: HTMLDivElement;
  inspectState: CliInspectState;
  viewportLines: string[];
  inferredRegions: InferredCliRegion[];
  inferredRegionsKey: string;
  semanticRegions: SelectableCliRegion[];
  semanticRegionsVersion: number;
  hoveredRegion: SelectableCliRegion | null;
  refreshFramePending: boolean;
  dataFramePending: boolean;
  pendingDataChunks: string[];
  selectionAnchor: { row: number; col: number } | null;
  contextModeOverride: CliSurfacePromptContextMode | null;
  targetMenuController?: CliTargetMenuController;
  targetMenuOutsideClickHandler?: (event: MouseEvent) => void;
  cleanupFns: Array<() => void>;
}

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

function getProject(projectId: string) {
  return appState.projects.find((project) => project.id === projectId);
}

function getRuntimeState(projectId: string): CliSurfaceRuntimeState | undefined {
  return getProject(projectId)?.surface?.cli?.runtime;
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

function resolveSelectedProfile(projectId: string) {
  const cliState = getProject(projectId)?.surface?.cli;
  if (!cliState) return undefined;
  const selectedId = cliState.selectedProfileId ?? cliState.runtime?.selectedProfileId;
  return cliState.profiles.find((profile) => profile.id === selectedId) ?? cliState.profiles[0];
}

function syncViewportLines(instance: CliSurfaceInstance): void {
  const buffer = instance.terminal.buffer.active;
  const start = buffer.viewportY;
  instance.viewportLines = Array.from({ length: instance.terminal.rows }, (_, index) =>
    buffer.getLine(start + index)?.translateToString(true) ?? '',
  );
  getInferredRegions(instance);
}

function showElement(element: HTMLElement, visible: boolean): void {
  if (visible) {
    element.classList.remove('hidden');
  } else {
    element.classList.add('hidden');
  }
}

function syncComposerContextControl(
  instance: CliSurfaceInstance,
  mode: CliSurfacePromptContextMode,
): void {
  syncComposerContextControlBehavior(
    instance.contextModeOverride,
    instance.composerContextSelectEl,
    instance.composerScopeEl,
    mode,
  );
}

function syncComposerContextTrace(instance: CliSurfaceInstance): void {
  syncComposerContextTraceBehavior(
    instance.composerContextTraceEl,
    instance.inspectState.payload?.appliedContext as AppliedContextSummary | undefined,
  );
}

function clearComposerError(instance: CliSurfaceInstance): void {
  instance.composerErrorEl.textContent = '';
  instance.composerErrorEl.style.display = 'none';
}

function showComposerError(instance: CliSurfaceInstance, message: string): void {
  showElement(instance.composerEl, true);
  instance.composerErrorEl.textContent = message;
  instance.composerErrorEl.style.display = 'block';
}

function updateProjectRuntime(projectId: string, runtime: CliSurfaceRuntimeState): void {
  const project = getProject(projectId);
  if (!project?.surface) return;

  appState.setProjectSurface(projectId, {
    ...project.surface,
    cli: {
      selectedProfileId: runtime.selectedProfileId ?? project.surface.cli?.selectedProfileId,
      profiles: project.surface.cli?.profiles ?? [],
      runtime,
    },
  });
}

function renderRuntimeMeta(instance: CliSurfaceInstance): void {
  renderCliSurfaceRuntimeMeta({
    instance,
    getRuntimeState,
    resolveSelectedProfile,
    adapterHint: semanticAdapterHints.get(instance.projectId),
  });
}

function renderInspectState(instance: CliSurfaceInstance): void {
  const hasPayload = Boolean(instance.inspectState.payload);
  showElement(instance.composerEl, hasPayload);
  showElement(instance.selectionOverlayEl, instance.inspectState.active);
  showHoverRegion(instance, instance.inspectState.active && !instance.selectionAnchor ? instance.hoveredRegion : null);
  showElement(instance.inspectButton, true);
  instance.inspectButton.textContent = instance.inspectState.active ? 'Exit Inspect' : 'Inspect';
  instance.inspectButton.classList.toggle('active', instance.inspectState.active);
  instance.inspectButton.setAttribute('aria-pressed', instance.inspectState.active ? 'true' : 'false');

  if (!instance.inspectState.active && !hasPayload) {
    instance.composerHintEl.textContent = 'Press Inspect, then drag over terminal output. Use Capture only when you want the whole screen.';
    instance.composerPreviewEl.textContent = '';
    syncComposerContextControl(instance, 'selection-only');
    syncComposerContextTrace(instance);
    instance.targetMenuController?.syncControls();
    clearComposerError(instance);
    return;
  }

  if (!instance.inspectState.payload) {
    instance.composerHintEl.textContent = instance.hoveredRegion
      ? `Click to select ${instance.hoveredRegion.label}, or drag for a precise region.`
      : 'Inspect mode is on. Hover to preview a panel, click to select it, or drag for a precise region.';
    instance.composerPreviewEl.textContent = '';
    syncComposerContextControl(instance, 'selection-only');
    syncComposerContextTrace(instance);
    instance.targetMenuController?.syncControls();
    return;
  }

  const { payload } = instance.inspectState;
  const hintParts: string[] = [];
  if (payload.selectionSource === 'semantic' && payload.semanticLabel) {
    hintParts.push(`Semantic target: ${payload.semanticLabel}`);
  } else if (payload.selectionSource === 'inferred' && payload.inferredLabel) {
    hintParts.push(`Inferred panel: ${payload.inferredLabel}`);
  } else {
    hintParts.push(`Selected region: ${payload.selection.mode}`);
    if (payload.semanticLabel) {
      hintParts.push(`Semantic target: ${payload.semanticLabel}`);
    }
    if (payload.inferredLabel) {
      hintParts.push(`Inside: ${payload.inferredLabel}`);
    }
  }
  if (payload.command) {
    hintParts.push(`Command: ${payload.command}`);
  }
  instance.composerHintEl.textContent = hintParts.join(' · ');
  instance.composerPreviewEl.textContent = payload.selectedText || payload.viewportText;
  syncComposerContextControl(instance, payload.contextMode ?? 'selection-only');
  syncComposerContextTrace(instance);
  instance.targetMenuController?.syncControls();
}

function setInspectPayloadFromPointer(instance: CliSurfaceInstance, event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
  if (!instance.selectionAnchor) return;
  const current = pointerToCell(instance.viewport, instance.terminal.cols, instance.terminal.rows, event);
  if (!current) return;
  setInspectPayloadFromSelection(instance, selectionFromCells({
    viewportLineCount: instance.viewportLines.length,
    terminalCols: instance.terminal.cols,
    start: instance.selectionAnchor,
    end: current,
  }));
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

function buildInspectPayload(
  instance: CliSurfaceInstance,
  selection: SurfaceSelectionRange,
  options?: { includeAnsiSnapshot?: boolean },
) {
  const project = getProject(instance.projectId) ?? appState.activeProject;
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
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

function setInspectPayloadFromSelection(instance: CliSurfaceInstance, selection: SurfaceSelectionRange | null): void {
  if (!selection) {
    renderInspectState(instance);
    return;
  }

  instance.inspectState = setInspectPayload(
    instance.inspectState,
    selection,
    buildInspectPayload(instance, selection),
  );
  renderInspectState(instance);
}

function setHoverRegion(instance: CliSurfaceInstance, region: SelectableCliRegion | null): void {
  if (
    instance.hoveredRegion?.label === region?.label
    && instance.hoveredRegion
    && region
    && selectionsMatchBounds(instance.hoveredRegion.selection, region.selection)
  ) {
    return;
  }
  instance.hoveredRegion = region;
  renderInspectState(instance);
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

function getSendPayload(instance: CliSurfaceInstance) {
  const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
  if (!selection) return null;
  return buildInspectPayload(instance, selection, { includeAnsiSnapshot: true });
}

function scheduleViewportRefresh(instance: CliSurfaceInstance): void {
  if (instance.refreshFramePending) return;
  instance.refreshFramePending = true;

  requestAnimationFrame(() => {
    instance.refreshFramePending = false;
    syncViewportLines(instance);
    renderRuntimeMeta(instance);
    if (instance.inspectState.active) {
      setInspectPayloadFromSelection(instance, selectionFromTerminal({
        viewportLineCount: instance.viewportLines.length,
        terminalCols: instance.terminal.cols,
        viewportY: instance.terminal.buffer.active.viewportY,
        selectionText: instance.terminal.getSelection(),
        range: instance.terminal.getSelectionPosition(),
      }));
    }
  });
}

function scheduleTerminalDataFlush(instance: CliSurfaceInstance): void {
  if (instance.dataFramePending) return;
  instance.dataFramePending = true;

  requestAnimationFrame(() => {
    instance.dataFramePending = false;
    const data = instance.pendingDataChunks.join('');
    instance.pendingDataChunks = [];
    if (!data) return;
    instance.terminal.write(data);
    scheduleViewportRefresh(instance);
  });
}

function closeInspectComposer(instance: CliSurfaceInstance): void {
  instance.inspectState = closeInspect(instance.inspectState);
  renderInspectState(instance);
  clearComposerError(instance);
}

function fitSurface(instance: CliSurfaceInstance): void {
  requestAnimationFrame(() => {
    instance.fitAddon.fit();
    getCliSurfaceApi()?.resize(instance.projectId, instance.terminal.cols, instance.terminal.rows);
    scheduleViewportRefresh(instance);
  });
}

function attachPaneBindings(): void {
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
      updateProjectRuntime(projectId, state as CliSurfaceRuntimeState);
      const instance = instances.get(projectId);
      if (!instance) return;
      renderRuntimeMeta(instance);
    },
    onExit: (projectId, exitCode) => {
      const instance = instances.get(projectId);
      if (!instance) return;
      const runtime = getRuntimeState(projectId);
      if (runtime) {
        updateProjectRuntime(projectId, {
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
      const runtime = getRuntimeState(projectId);
      updateProjectRuntime(projectId, {
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

function ensureInstance(projectId: string): CliSurfaceInstance {
  return ensureCliSurfaceInstance(projectId);
}

function bindInspectPointerHandlers(instance: CliSurfaceInstance): void {
  bindInspectPointerHandlersModule({
    instance,
    setInspectPayloadFromSelection: (selection) => {
      if (!selection) {
        renderInspectState(instance);
        return;
      }
      setInspectPayloadFromSelection(instance, selection);
    },
    setInspectPayloadFromPointer: (event) => setInspectPayloadFromPointer(instance, event),
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
    writeToRuntime: (projectId, data) => {
      getCliSurfaceApi()?.write(projectId, data);
    },
  });
}

function ensureCliSurfaceInstance(projectId: string): CliSurfaceInstance {
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
      resolveProjectPath: (nextProjectId) => getProject(nextProjectId)?.path,
      openExternal: (url, cwd) => window.calder.app.openExternal(url, cwd),
    },
  );

  const instance: CliSurfaceInstance = {
    projectId,
    element: layout.element,
    viewport: layout.viewport,
    selectionOverlayEl: layout.selectionOverlay,
    hoverOverlayEl: layout.hoverOverlay,
    hoverLabelEl: layout.hoverLabel,
    hoverMetaEl: layout.hoverMeta,
    hoverPreviewEl: layout.hoverPreview,
    terminal: terminalElements.terminal,
    fitAddon: terminalElements.fitAddon,
    serializeAddon: terminalElements.serializeAddon,
    emptyEl: layout.empty,
    metaEl: layout.meta,
    routeEl: layout.route,
    adapterMetaEl: layout.adapterMeta,
    inspectButton: layout.inspectButton,
    composerEl: layout.composer,
    composerHandleEl: layout.composerHandle,
    composerHintEl: layout.composerHint,
    composerPreviewEl: layout.composerPreview,
    composerScopeEl: layout.composerScope,
    composerContextTraceEl: layout.composerContextTrace,
    composerContextSelectEl: layout.composerContextSelect,
    composerErrorEl: layout.composerError,
    selectedButton: layout.selectedButton,
    newButton: layout.newButton,
    customButton: layout.customButton,
    targetMenuEl: layout.targetMenu,
    targetMenuListEl: layout.targetMenuList,
    inspectState: createInitialInspectState(),
    viewportLines: [],
    inferredRegions: [],
    inferredRegionsKey: '',
    semanticRegions: [],
    semanticRegionsVersion: -1,
    hoveredRegion: null,
    refreshFramePending: false,
    dataFramePending: false,
    pendingDataChunks: [],
    selectionAnchor: null,
    contextModeOverride: null,
    targetMenuController: undefined,
    targetMenuOutsideClickHandler: undefined,
    cleanupFns: [],
  };

  instance.targetMenuController = createCliSurfaceTargetMenuControllerWithHandlers(
    instance,
    {
      getSendPayload: () => getSendPayload(instance),
      closeInspectComposer: () => closeInspectComposer(instance),
      clearComposerError: () => clearComposerError(instance),
      showComposerError: (message: string) => showComposerError(instance, message),
    },
  );
  bindCliSurfaceRuntimeActionHandlers({
    projectId,
    context: instance,
    controls: layout,
    resolveSelectedProfile,
    getCliSurfaceApi,
    renderInspectState: () => renderInspectState(instance),
    setInspectPayloadFromSelection: (selection) => setInspectPayloadFromSelection(instance, selection),
    helpers: {
      getSendPayload: () => getSendPayload(instance),
      closeInspectComposer: () => closeInspectComposer(instance),
      clearComposerError: () => clearComposerError(instance),
      showComposerError: (message: string) => showComposerError(instance, message),
    },
  });
  bindCliSurfaceInspectActionHandlers({
    context: instance,
    openInspectComposer: () => {
      instance.inspectState = openInspect(instance.inspectState);
      renderInspectState(instance);
    },
    helpers: {
      getSendPayload: () => getSendPayload(instance),
      closeInspectComposer: () => closeInspectComposer(instance),
      clearComposerError: () => clearComposerError(instance),
      showComposerError: (message: string) => showComposerError(instance, message),
    },
  });
  bindInspectPointerHandlers(instance);

  instances.set(projectId, instance);
  instance.cleanupFns.push(enableComposerDraggingBehavior({
    paneEl: instance.element,
    composerEl: instance.composerEl,
    handleEl: instance.composerHandleEl,
  }));
  syncViewportLines(instance);
  renderRuntimeMeta(instance);
  renderInspectState(instance);
  return instance;
}

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
