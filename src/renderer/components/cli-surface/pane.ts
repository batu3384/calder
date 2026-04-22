import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SerializeAddon } from '@xterm/addon-serialize';
import type {
  AppliedContextSummary,
  CliSurfacePromptContextMode,
  CliSurfaceRuntimeState,
  CliSurfaceStartupTiming,
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
  setComposerPosition as setComposerPositionBehavior,
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
import {
  sendCliSelectionToCustomSession,
  sendCliSelectionToNewSession,
  sendCliSelectionToSelectedSession,
} from './session-integration.js';
import { detectCliAdapter } from './adapters/registry.js';
import { extractCalderOscMessages, type CalderProtocolMessage } from './protocol.js';
import { getCliSurfaceProfileLabel } from './profile.js';
import { createCliTargetMenuController, type CliTargetMenuController } from './target-menu.js';
import type { InferredCliRegion } from './heuristics.js';
import { clearCliSurfaceLinkDispatch } from './link-dispatch.js';
import {
  findRegionAtCell,
  pointerToCell,
  selectionArea,
  selectionFromCells,
  selectionFromTerminal,
  selectionFromViewport,
  selectionsMatchBounds,
} from './inspect-geometry.js';
import {
  attachCliSurfaceRuntimeBindings,
  attachCliSurfaceStateBindings,
} from './runtime-bindings.js';
import {
  createCliSurfaceLayout,
  createCliSurfaceTerminal,
  type CliSurfaceLayoutElements,
} from './pane-elements.js';

interface SelectableCliRegion {
  kind: 'semantic' | 'inferred';
  label: string;
  selection: SurfaceSelectionRange;
  semanticNodeId?: string;
  semanticLabel?: string;
  sourceFile?: string;
}

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

function formatDurationMs(value: number): string {
  if (value < 1_000) return `${Math.round(value)}ms`;
  const seconds = value / 1_000;
  return seconds < 10 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds)}s`;
}

export function formatCliSurfaceTiming(timing?: Partial<CliSurfaceStartupTiming>): string {
  if (!timing) return '';

  const parts: string[] = [];
  if (typeof timing.spawnLatencyMs === 'number') {
    parts.push(`spawn ${formatDurationMs(timing.spawnLatencyMs)}`);
  }
  if (typeof timing.firstOutputLatencyMs === 'number') {
    parts.push(`first output ${formatDurationMs(timing.firstOutputLatencyMs)}`);
  }
  return parts.join(' · ');
}

function formatRuntimeStatus(status: CliSurfaceRuntimeState['status'] | undefined): string {
  switch (status) {
    case 'running':
      return 'live';
    case 'starting':
      return 'starting';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function buildSurfaceRouteCopy(projectId: string): string {
  const targetSession = appState.resolveSurfaceTargetSession(projectId);
  return targetSession ? `Routing to ${targetSession.name}` : 'Routing is not set';
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

function renderRouteMeta(instance: CliSurfaceInstance): void {
  instance.routeEl.textContent = buildSurfaceRouteCopy(instance.projectId);
}

function renderAdapterMeta(instance: CliSurfaceInstance): void {
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const adapter = detectCliAdapter({
    command: runtime?.command ?? profile?.command,
    args: runtime?.args ?? profile?.args,
    title: profile?.name ?? runtime?.command,
    adapterHint: semanticAdapterHints.get(instance.projectId),
  });

  instance.adapterMetaEl.innerHTML = '';
  showElement(instance.adapterMetaEl, Boolean(adapter));
  if (!adapter) return;

  const badges = [adapter.displayName, ...adapter.capabilityBadges];
  for (const badgeLabel of badges) {
    const badge = document.createElement('span');
    badge.className = 'cli-surface-adapter-badge';
    badge.textContent = badgeLabel;
    instance.adapterMetaEl.appendChild(badge);
  }
}

function renderRuntimeMeta(instance: CliSurfaceInstance): void {
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const label = profile ? getCliSurfaceProfileLabel(profile) : (runtime?.command ?? 'No profile');
  const status = formatRuntimeStatus(runtime?.status);
  const timingLabel = formatCliSurfaceTiming(runtime?.startupTiming);
  instance.metaEl.textContent = `${label} · ${status}${timingLabel ? ` · ${timingLabel}` : ''}`;
  renderRouteMeta(instance);
  renderAdapterMeta(instance);
  instance.targetMenuController?.syncControls();

  if (runtime?.status === 'running') {
    instance.emptyEl.textContent = 'Runtime is live. Select text or capture the viewport to send context.';
    showElement(instance.emptyEl, instance.viewportLines.length === 0);
    return;
  }

  if (runtime?.status === 'starting') {
    instance.emptyEl.textContent = timingLabel
      ? `Starting CLI surface runtime. ${timingLabel}. Waiting for first output.`
      : 'Starting CLI surface runtime…';
    showElement(instance.emptyEl, true);
    return;
  }

  if (runtime?.status === 'error') {
    instance.emptyEl.textContent = runtime?.lastError || 'CLI surface failed to start. Edit the command or try another suggestion.';
    showElement(instance.emptyEl, true);
    return;
  }

  instance.emptyEl.textContent = 'Calder can run a detected CLI or TUI command here. If startup fails, edit the command or try another suggestion.';
  showElement(instance.emptyEl, true);
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

function findInferredRegionAtCell(instance: CliSurfaceInstance, cell: { row: number; col: number }) {
  return findRegionAtCell(getInferredRegions(instance), cell);
}

function getSemanticRegions(instance: CliSurfaceInstance): SelectableCliRegion[] {
  const version = semanticRegionVersions.get(instance.projectId) ?? 0;
  if (instance.semanticRegionsVersion === version) {
    return instance.semanticRegions;
  }

  const focusedNodeId = getFocusedSemanticNodeIdBehavior(semanticFocusNodes, instance.projectId);

  instance.semanticRegions = [...(semanticNodes.get(instance.projectId)?.values() ?? [])]
    .filter((message): message is CalderProtocolMessage & { bounds: SurfaceSelectionRange } => Boolean(message.bounds))
    .map((message) => ({
      kind: 'semantic' as const,
      label: message.label ?? message.nodeId,
      selection: message.bounds,
      semanticNodeId: message.nodeId,
      semanticLabel: message.label,
      sourceFile: message.sourceFile,
    }))
    .sort((left, right) => {
      const leftFocused = left.semanticNodeId === focusedNodeId ? 1 : 0;
      const rightFocused = right.semanticNodeId === focusedNodeId ? 1 : 0;
      if (leftFocused !== rightFocused) return rightFocused - leftFocused;
      return selectionArea(left.selection) - selectionArea(right.selection);
    });
  instance.semanticRegionsVersion = version;
  if (
    instance.hoveredRegion
    && instance.hoveredRegion.kind === 'semantic'
    && !instance.semanticRegions.some((candidate) =>
      candidate.label === instance.hoveredRegion?.label
      && selectionsMatchBounds(candidate.selection, instance.hoveredRegion.selection),
    )
  ) {
    instance.hoveredRegion = null;
  }
  return instance.semanticRegions;
}

function findSemanticRegionAtCell(instance: CliSurfaceInstance, cell: { row: number; col: number }) {
  return findRegionAtCell(getSemanticRegions(instance), cell);
}

function findSelectableRegionAtCell(instance: CliSurfaceInstance, cell: { row: number; col: number }): SelectableCliRegion | null {
  const semanticRegion = findSemanticRegionAtCell(instance, cell);
  if (semanticRegion) return semanticRegion;
  const inferredRegion = findInferredRegionAtCell(instance, cell);
  if (!inferredRegion) return null;
  return {
    kind: 'inferred',
    label: inferredRegion.label,
    selection: inferredRegion.selection,
  };
}

function buildInspectPayload(
  instance: CliSurfaceInstance,
  selection: SurfaceSelectionRange,
  options?: { includeAnsiSnapshot?: boolean },
) {
  const project = getProject(instance.projectId) ?? appState.activeProject;
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const selectionHint = getInferredRegions(instance).find((candidate) =>
    candidate.selection.startRow <= selection.startRow
    && candidate.selection.endRow >= selection.endRow,
  );
  const semanticRegion = getSemanticRegions(instance).find((candidate) =>
    candidate.selection.startRow <= selection.startRow
    && candidate.selection.endRow >= selection.endRow
    && candidate.selection.startCol <= selection.startCol
    && candidate.selection.endCol >= selection.endCol,
  );
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
  const selectionSource = semanticRegion && selectionsMatchBounds(semanticRegion.selection, selection)
    ? 'semantic'
    : selectionHint && selectionsMatchBounds(selectionHint.selection, selection)
      ? 'inferred'
      : 'exact';
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
  if (
    instance.hoveredRegion
    && instance.hoveredRegion.kind === 'inferred'
    && !instance.inferredRegions.some((candidate) =>
      candidate.label === instance.hoveredRegion?.label
      && selectionsMatchBounds(candidate.selection, instance.hoveredRegion.selection),
    )
  ) {
    instance.hoveredRegion = null;
  }
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

function createCliSurfaceTargetMenuController(instance: CliSurfaceInstance): CliTargetMenuController {
  return createCliTargetMenuController({
    projectId: instance.projectId,
    elements: {
      composerEl: instance.composerEl,
      selectedButton: instance.selectedButton,
      newButton: instance.newButton,
      customButton: instance.customButton,
      targetMenuEl: instance.targetMenuEl,
      targetMenuListEl: instance.targetMenuListEl,
    },
    hasPayload: () => Boolean(instance.inspectState.payload),
    onSendToNew: () => {
      const payload = getSendPayload(instance);
      if (!payload) return;
      clearComposerError(instance);
      sendCliSelectionToNewSession(payload, 'CLI inspect follow-up');
      closeInspectComposer(instance);
    },
    onSendToCustom: () => {
      const payload = getSendPayload(instance);
      if (!payload) return;
      sendCliSelectionToCustomSession(payload, () => {
        clearComposerError(instance);
        closeInspectComposer(instance);
      });
    },
  });
}

function bindRuntimeActionHandlers(
  projectId: string,
  instance: CliSurfaceInstance,
  controls: Pick<CliSurfaceLayoutElements, 'startButton' | 'stopButton' | 'restartButton' | 'captureButton'>,
): void {
  controls.startButton.addEventListener('click', async () => {
    const profile = resolveSelectedProfile(projectId);
    if (!profile) {
      showComposerError(instance, 'Select a CLI surface profile first.');
      return;
    }
    clearComposerError(instance);
    await getCliSurfaceApi()?.start(projectId, profile);
  });

  controls.stopButton.addEventListener('click', async () => {
    clearComposerError(instance);
    await getCliSurfaceApi()?.stop(projectId);
  });

  controls.restartButton.addEventListener('click', async () => {
    clearComposerError(instance);
    await getCliSurfaceApi()?.restart(projectId);
  });

  controls.captureButton.addEventListener('click', () => {
    instance.inspectState = openInspect(instance.inspectState);
    clearComposerError(instance);
    renderInspectState(instance);
    setInspectPayloadFromSelection(
      instance,
      selectionFromViewport(instance.viewportLines.length, instance.terminal.cols),
    );
    setComposerPositionBehavior({
      paneEl: instance.element,
      composerEl: instance.composerEl,
      left: 16,
      top: 72,
    });
  });
}

function bindInspectActionHandlers(instance: CliSurfaceInstance): void {
  instance.inspectButton.addEventListener('click', () => {
    if (instance.inspectState.active) {
      closeInspectComposer(instance);
      return;
    }
    instance.inspectState = openInspect(instance.inspectState);
    renderInspectState(instance);
  });

  instance.selectedButton.addEventListener('click', async () => {
    const payload = getSendPayload(instance);
    if (!payload) return;
    const result = await sendCliSelectionToSelectedSession(payload);
    if (!result.ok) {
      showComposerError(instance, result.error ?? 'Failed to send prompt.');
      return;
    }
    closeInspectComposer(instance);
  });

  instance.newButton.addEventListener('click', () => {
    const payload = getSendPayload(instance);
    if (!payload) return;
    clearComposerError(instance);
    sendCliSelectionToNewSession(payload, 'CLI inspect follow-up');
    closeInspectComposer(instance);
  });

  instance.customButton.addEventListener('click', () => {
    instance.targetMenuController?.openMenu();
  });

  instance.targetMenuOutsideClickHandler = (event: MouseEvent) => {
    const target = event.target as Node | null;
    if (!target) return;
    if (!instance.targetMenuEl.contains(target) && !instance.customButton.contains(target)) {
      instance.targetMenuController?.closeMenu();
    }
  };
  document.addEventListener('mousedown', instance.targetMenuOutsideClickHandler);
}

function bindInspectPointerHandlers(instance: CliSurfaceInstance): void {
  instance.composerContextSelectEl.addEventListener('change', () => {
    const nextValue = instance.composerContextSelectEl.value;
    instance.contextModeOverride = nextValue === 'auto'
      ? null
      : nextValue as CliSurfacePromptContextMode;
    const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
    if (selection) {
      setInspectPayloadFromSelection(instance, selection);
      return;
    }
    renderInspectState(instance);
  });

  instance.terminal.onSelectionChange(() => {
    if (!instance.inspectState.active) return;
    setInspectPayloadFromSelection(instance, selectionFromTerminal({
      viewportLineCount: instance.viewportLines.length,
      terminalCols: instance.terminal.cols,
      viewportY: instance.terminal.buffer.active.viewportY,
      selectionText: instance.terminal.getSelection(),
      range: instance.terminal.getSelectionPosition(),
    }));
  });

  instance.selectionOverlayEl.addEventListener('pointerdown', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    instance.selectionAnchor = pointerToCell(instance.viewport, instance.terminal.cols, instance.terminal.rows, event);
    setHoverRegion(instance, null);
    setInspectPayloadFromPointer(instance, event);
  });

  instance.selectionOverlayEl.addEventListener('pointermove', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    if (instance.selectionAnchor) {
      setInspectPayloadFromPointer(instance, event);
      return;
    }
    const current = pointerToCell(instance.viewport, instance.terminal.cols, instance.terminal.rows, event);
    setHoverRegion(instance, current ? findSelectableRegionAtCell(instance, current) : null);
  });

  instance.selectionOverlayEl.addEventListener('pointerup', (event) => {
    if (!instance.inspectState.active || !instance.selectionAnchor) return;
    event.preventDefault();
    const current = pointerToCell(instance.viewport, instance.terminal.cols, instance.terminal.rows, event);
    const singleClick = current
      && current.row === instance.selectionAnchor.row
      && current.col === instance.selectionAnchor.col;

    if (singleClick && current) {
      const region = findSelectableRegionAtCell(instance, current);
      if (region) {
        setInspectPayloadFromSelection(instance, region.selection);
      } else {
        setInspectPayloadFromPointer(instance, event);
      }
    } else {
      setInspectPayloadFromPointer(instance, event);
    }
    positionComposerNearPointerBehavior({
      paneEl: instance.element,
      composerEl: instance.composerEl,
      event,
    });
    instance.selectionAnchor = null;
    setHoverRegion(instance, null);
  });

  instance.selectionOverlayEl.addEventListener('pointerleave', () => {
    if (instance.selectionAnchor) return;
    setHoverRegion(instance, null);
  });

  instance.terminal.onData((data) => {
    getCliSurfaceApi()?.write(instance.projectId, data);
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

  instance.targetMenuController = createCliSurfaceTargetMenuController(instance);
  bindRuntimeActionHandlers(projectId, instance, layout);
  bindInspectActionHandlers(instance);
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
