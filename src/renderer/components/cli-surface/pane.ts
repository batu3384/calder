import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type {
  AppliedContextSummary,
  CliSurfacePromptContextMode,
  CliSurfaceRuntimeState,
  CliSurfaceStartupTiming,
  SurfaceSelectionRange,
} from '../../../shared/types.js';
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
import {
  clearCliSurfaceLinkDispatch,
  extractUrlFromEventTarget,
  findInlineUrlAtPointer,
  openCliSurfaceWebLink,
} from './link-dispatch.js';

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
let runtimeBindingsAttached = false;
let stateBindingsAttached = false;

type CliSurfaceButtonTone = 'neutral' | 'primary' | 'danger' | 'ghost';

function buildToolbarButton(label: string, action: string, tone: CliSurfaceButtonTone = 'neutral'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `cli-surface-button cli-surface-button-${tone}`;
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.tone = tone;
  button.textContent = label;
  return button;
}

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

function selectionFromViewport(instance: CliSurfaceInstance): SurfaceSelectionRange | null {
  if (instance.viewportLines.length === 0) return null;
  return {
    mode: 'viewport',
    startRow: 0,
    endRow: instance.viewportLines.length - 1,
    startCol: 0,
    endCol: instance.terminal.cols,
  };
}

function selectionFromTerminal(instance: CliSurfaceInstance): SurfaceSelectionRange | null {
  if (instance.viewportLines.length === 0) return null;

  const selectionText = instance.terminal.getSelection().trim();
  const range = instance.terminal.getSelectionPosition();
  if (!selectionText || !range) {
    return null;
  }

  const viewportY = instance.terminal.buffer.active.viewportY;
  const lastRow = Math.max(0, instance.viewportLines.length - 1);
  const startRow = Math.min(lastRow, Math.max(0, range.start.y - 1 - viewportY));
  const endRow = Math.min(lastRow, Math.max(startRow, range.end.y - 1 - viewportY));
  const startCol = Math.max(0, range.start.x - 1);
  const endCol = Math.max(startCol + 1, range.end.x);
  const mode = startCol === 0 && endCol >= instance.terminal.cols ? 'line' : 'region';

  return {
    mode,
    startRow,
    endRow,
    startCol,
    endCol,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointerToCell(instance: CliSurfaceInstance, event: Pick<PointerEvent, 'clientX' | 'clientY'>): { row: number; col: number } | null {
  if (instance.terminal.cols <= 0 || instance.terminal.rows <= 0) return null;
  const rect = instance.viewport.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const col = clampNumber(
    Math.floor((event.clientX - rect.left) / (rect.width / instance.terminal.cols)),
    0,
    instance.terminal.cols,
  );
  const row = clampNumber(
    Math.floor((event.clientY - rect.top) / (rect.height / instance.terminal.rows)),
    0,
    Math.max(0, instance.terminal.rows - 1),
  );
  return { row, col };
}

function selectionFromCells(
  instance: CliSurfaceInstance,
  start: { row: number; col: number },
  end: { row: number; col: number },
): SurfaceSelectionRange {
  const startRow = clampNumber(Math.min(start.row, end.row), 0, Math.max(0, instance.viewportLines.length - 1));
  const endRow = clampNumber(Math.max(start.row, end.row), startRow, Math.max(0, instance.viewportLines.length - 1));
  const startCol = clampNumber(Math.min(start.col, end.col), 0, instance.terminal.cols);
  const endCol = clampNumber(Math.max(start.col, end.col), startCol + 1, instance.terminal.cols);
  return {
    mode: startCol === 0 && endCol >= instance.terminal.cols ? 'line' : 'region',
    startRow,
    endRow,
    startCol,
    endCol,
  };
}

function setInspectPayloadFromPointer(instance: CliSurfaceInstance, event: Pick<PointerEvent, 'clientX' | 'clientY'>): void {
  if (!instance.selectionAnchor) return;
  const current = pointerToCell(instance, event);
  if (!current) return;
  setInspectPayloadFromSelection(instance, selectionFromCells(instance, instance.selectionAnchor, current));
}

function selectionsMatchBounds(left: SurfaceSelectionRange, right: SurfaceSelectionRange): boolean {
  return left.startRow === right.startRow
    && left.endRow === right.endRow
    && left.startCol === right.startCol
    && left.endCol === right.endCol;
}

function findInferredRegionAtCell(instance: CliSurfaceInstance, cell: { row: number; col: number }) {
  return getInferredRegions(instance).find((candidate) =>
    candidate.selection.startRow <= cell.row
    && candidate.selection.endRow >= cell.row
    && candidate.selection.startCol <= cell.col
    && candidate.selection.endCol >= cell.col,
  );
}

function selectionArea(selection: SurfaceSelectionRange): number {
  return (selection.endRow - selection.startRow + 1) * Math.max(1, selection.endCol - selection.startCol);
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
  return getSemanticRegions(instance).find((candidate) =>
    candidate.selection.startRow <= cell.row
    && candidate.selection.endRow >= cell.row
    && candidate.selection.startCol <= cell.col
    && candidate.selection.endCol >= cell.col,
  );
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
      setInspectPayloadFromSelection(instance, selectionFromTerminal(instance));
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

function attachRuntimeBindings(): void {
  if (runtimeBindingsAttached) return;
  const api = getCliSurfaceApi();
  if (!api) return;

  runtimeBindingsAttached = true;

  api.onData((projectId, data) => {
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
  });

  api.onStatus((projectId, state) => {
    updateProjectRuntime(projectId, state);
    const instance = instances.get(projectId);
    if (!instance) return;
    renderRuntimeMeta(instance);
  });

  api.onExit((projectId, exitCode) => {
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
  });

  api.onError((projectId, message) => {
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
  });
}

function attachStateBindings(): void {
  if (stateBindingsAttached) return;
  stateBindingsAttached = true;

  const pruneStaleInstances = () => {
    const activeProjectIds = new Set(appState.projects.map((project) => project.id));
    for (const projectId of [...instances.keys()]) {
      if (!activeProjectIds.has(projectId)) {
        destroyCliSurfacePane(projectId);
      }
    }
  };

  const rerender = () => {
    pruneStaleInstances();
    instances.forEach((instance) => {
      renderRuntimeMeta(instance);
      renderInspectState(instance);
    });
  };

  appState.on('state-loaded', rerender);
  appState.on('project-changed', rerender);
  appState.on('project-removed', rerender);
  appState.on('session-changed', rerender);
  appState.on('session-added', rerender);
  appState.on('session-removed', rerender);
}

function ensureInstance(projectId: string): CliSurfaceInstance {
  const existing = instances.get(projectId);
  if (existing) return existing;

  attachRuntimeBindings();
  attachStateBindings();

  const element = document.createElement('div');
  element.className = 'cli-surface-pane hidden';
  element.dataset.projectId = projectId;

  const toolbar = document.createElement('div');
  toolbar.className = 'cli-surface-toolbar';

  const toolbarMain = document.createElement('div');
  toolbarMain.className = 'cli-surface-toolbar-main';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'cli-surface-title-group';

  const title = document.createElement('div');
  title.className = 'cli-surface-title';
  title.textContent = 'CLI Surface';
  titleGroup.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'cli-surface-meta';
  meta.textContent = 'No profile · idle';
  titleGroup.appendChild(meta);

  toolbarMain.appendChild(titleGroup);

  const toolbarMeta = document.createElement('div');
  toolbarMeta.className = 'cli-surface-toolbar-meta';

  const adapterMeta = document.createElement('div');
  adapterMeta.className = 'cli-surface-adapter-meta hidden';
  toolbarMeta.appendChild(adapterMeta);

  const route = document.createElement('div');
  route.className = 'cli-surface-route';
  route.textContent = 'Routing is not set';
  toolbarMeta.appendChild(route);

  toolbarMain.appendChild(toolbarMeta);
  toolbar.appendChild(toolbarMain);

  const actions = document.createElement('div');
  actions.className = 'cli-surface-actions';

  const startButton = buildToolbarButton('Start', 'start', 'primary');
  const stopButton = buildToolbarButton('Stop', 'stop', 'danger');
  const restartButton = buildToolbarButton('Restart', 'restart');
  const inspectButton = buildToolbarButton('Inspect', 'inspect', 'ghost');
  const captureButton = buildToolbarButton('Capture', 'capture');

  const runtimeGroup = document.createElement('div');
  runtimeGroup.className = 'cli-surface-action-group';
  const runtimeLabel = document.createElement('div');
  runtimeLabel.className = 'cli-surface-action-label';
  runtimeLabel.textContent = 'Runtime';
  runtimeGroup.appendChild(runtimeLabel);
  const runtimeControls = document.createElement('div');
  runtimeControls.className = 'cli-surface-action-row';
  runtimeControls.appendChild(startButton);
  runtimeControls.appendChild(stopButton);
  runtimeControls.appendChild(restartButton);
  runtimeGroup.appendChild(runtimeControls);

  const captureGroup = document.createElement('div');
  captureGroup.className = 'cli-surface-action-group';
  const captureLabel = document.createElement('div');
  captureLabel.className = 'cli-surface-action-label';
  captureLabel.textContent = 'Capture';
  captureGroup.appendChild(captureLabel);
  const captureControls = document.createElement('div');
  captureControls.className = 'cli-surface-action-row';
  captureControls.appendChild(inspectButton);
  captureControls.appendChild(captureButton);
  captureGroup.appendChild(captureControls);

  actions.appendChild(runtimeGroup);
  actions.appendChild(captureGroup);
  toolbar.appendChild(actions);
  element.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.className = 'cli-surface-viewport';
  element.appendChild(viewport);

  const selectionOverlay = document.createElement('div');
  selectionOverlay.className = 'cli-surface-selection-overlay hidden';

  const hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'cli-surface-hover-overlay hidden';

  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'cli-surface-hover-label';
  hoverOverlay.appendChild(hoverLabel);

  const hoverMeta = document.createElement('div');
  hoverMeta.className = 'cli-surface-hover-meta';
  hoverOverlay.appendChild(hoverMeta);

  const hoverPreview = document.createElement('pre');
  hoverPreview.className = 'cli-surface-hover-preview';
  hoverOverlay.appendChild(hoverPreview);

  const empty = document.createElement('div');
  empty.className = 'cli-surface-empty';
  empty.textContent = 'Run a CLI or TUI profile to preview it here.';
  element.appendChild(empty);

  const composer = document.createElement('div');
  composer.className = 'cli-surface-composer hidden';
  composer.classList.add('calder-popover');

  const composerHandle = document.createElement('div');
  composerHandle.className = 'cli-surface-composer-handle';

  const composerHandleLabel = document.createElement('span');
  composerHandleLabel.className = 'cli-surface-composer-handle-label';
  composerHandleLabel.textContent = 'Terminal capture';

  const composerHandleGrip = document.createElement('span');
  composerHandleGrip.className = 'cli-surface-composer-handle-grip';
  composerHandleGrip.textContent = 'Move';

  composerHandle.appendChild(composerHandleLabel);
  composerHandle.appendChild(composerHandleGrip);
  composer.appendChild(composerHandle);

  const composerHint = document.createElement('div');
  composerHint.className = 'cli-surface-composer-hint';
  composer.appendChild(composerHint);

  const composerPreview = document.createElement('pre');
  composerPreview.className = 'cli-surface-composer-preview';
  composer.appendChild(composerPreview);

  const composerScope = document.createElement('div');
  composerScope.className = 'cli-surface-composer-scope';
  composerScope.textContent = 'Will send: Selection only';
  composer.appendChild(composerScope);

  const composerContextTrace = document.createElement('div');
  composerContextTrace.className = 'cli-surface-composer-context-trace';
  composer.appendChild(composerContextTrace);

  const composerContextRow = document.createElement('label');
  composerContextRow.className = 'cli-surface-composer-toggle';
  const composerContextLabel = document.createElement('span');
  composerContextLabel.textContent = 'Context';
  const composerContextSelect = document.createElement('select');
  composerContextSelect.className = 'cli-surface-composer-select';
  [
    ['auto', 'Auto'],
    ['selection-only', 'Selection only'],
    ['selection-nearby', 'Selection + nearby'],
    ['selection-nearby-viewport', 'Selection + viewport'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.setAttribute('value', value);
    option.textContent = label;
    composerContextSelect.appendChild(option);
  });
  composerContextRow.appendChild(composerContextLabel);
  composerContextRow.appendChild(composerContextSelect);
  composer.appendChild(composerContextRow);

  const composerActions = document.createElement('div');
  composerActions.className = 'cli-surface-composer-actions';

  const selectedButton = buildToolbarButton('Send to selected', 'send-selected', 'primary');
  const newButton = buildToolbarButton('New session', 'send-new');
  const customButton = buildToolbarButton('Choose session', 'send-custom', 'ghost');
  selectedButton.disabled = true;
  newButton.disabled = true;
  customButton.disabled = false;
  composerActions.appendChild(selectedButton);
  composerActions.appendChild(newButton);
  composerActions.appendChild(customButton);
  composer.appendChild(composerActions);

  const composerError = document.createElement('div');
  composerError.className = 'cli-surface-composer-error';
  composerError.style.display = 'none';
  composer.appendChild(composerError);

  const targetMenu = document.createElement('div');
  targetMenu.className = 'cli-surface-target-menu';
  targetMenu.classList.add('calder-popover');
  targetMenu.style.display = 'none';

  const targetMenuList = document.createElement('div');
  targetMenuList.className = 'cli-surface-target-menu-list';
  targetMenu.appendChild(targetMenuList);

  element.appendChild(targetMenu);

  element.appendChild(composer);

  const terminal = new Terminal({
    allowProposedApi: true,
    fontSize: 14,
    cursorBlink: true,
    linkHandler: {
      activate: (event, uri) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        try { terminal.clearSelection(); } catch {}
        window.getSelection?.()?.removeAllRanges?.();
        openCliSurfaceWebLink(
          projectId,
          uri,
          'osc-link',
          getProject(projectId)?.path,
          (url, cwd) => window.calder.app.openExternal(url, cwd),
        );
      },
    },
  });
  const fitAddon = new FitAddon();
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(serializeAddon);
  terminal.loadAddon(new WebLinksAddon((event, url) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    try { terminal.clearSelection(); } catch {}
    window.getSelection?.()?.removeAllRanges?.();
    openCliSurfaceWebLink(
      projectId,
      url,
      'web-link',
      getProject(projectId)?.path,
      (nextUrl, cwd) => window.calder.app.openExternal(nextUrl, cwd),
    );
  }));
  let suppressLinkDragSelection = false;
  const clearPointerSelection = (): void => {
    try { terminal.clearSelection(); } catch {}
    window.getSelection?.()?.removeAllRanges?.();
  };
  const suppressPointerEvent = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    (event as MouseEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
  };
  viewport.addEventListener('mousedown', (event: MouseEvent) => {
    if (event.button !== 0) return;
    // Clear stale suppression from a previous link click before evaluating
    // the current pointer target.
    suppressLinkDragSelection = false;
    const candidate = findInlineUrlAtPointer(terminal, viewport, event) ?? extractUrlFromEventTarget(event);
    if (!candidate) return;
    suppressLinkDragSelection = true;
    suppressPointerEvent(event);
    clearPointerSelection();
  }, { capture: true });
  viewport.addEventListener('mousemove', (event: MouseEvent) => {
    if (!suppressLinkDragSelection) return;
    if ((event.buttons & 1) !== 1) {
      suppressLinkDragSelection = false;
      return;
    }
    suppressPointerEvent(event);
    clearPointerSelection();
  }, { capture: true });
  viewport.addEventListener('mouseup', () => {
    suppressLinkDragSelection = false;
  }, { capture: true });
  viewport.addEventListener('mouseleave', () => {
    suppressLinkDragSelection = false;
  }, { capture: true });
  viewport.addEventListener('click', (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const candidate = findInlineUrlAtPointer(terminal, viewport, event) ?? extractUrlFromEventTarget(event);
    if (!candidate) return;
    suppressPointerEvent(event);
    clearPointerSelection();
    openCliSurfaceWebLink(
      projectId,
      candidate,
      'web-link',
      getProject(projectId)?.path,
      (url, cwd) => window.calder.app.openExternal(url, cwd),
    );
  }, { capture: true });
  terminal.open(viewport);
  viewport.appendChild(hoverOverlay);
  viewport.appendChild(selectionOverlay);

  const instance: CliSurfaceInstance = {
    projectId,
    element,
    viewport,
    selectionOverlayEl: selectionOverlay,
    hoverOverlayEl: hoverOverlay,
    hoverLabelEl: hoverLabel,
    hoverMetaEl: hoverMeta,
    hoverPreviewEl: hoverPreview,
    terminal,
    fitAddon,
    serializeAddon,
    emptyEl: empty,
    metaEl: meta,
    routeEl: route,
    adapterMetaEl: adapterMeta,
    inspectButton,
    composerEl: composer,
    composerHandleEl: composerHandle,
    composerHintEl: composerHint,
    composerPreviewEl: composerPreview,
    composerScopeEl: composerScope,
    composerContextTraceEl: composerContextTrace,
    composerContextSelectEl: composerContextSelect,
    composerErrorEl: composerError,
    selectedButton,
    newButton,
    customButton,
    targetMenuEl: targetMenu,
    targetMenuListEl: targetMenuList,
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

  instance.targetMenuController = createCliTargetMenuController({
    projectId,
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

  startButton.addEventListener('click', async () => {
    const profile = resolveSelectedProfile(projectId);
    if (!profile) {
      showComposerError(instance, 'Select a CLI surface profile first.');
      return;
    }
    clearComposerError(instance);
    await getCliSurfaceApi()?.start(projectId, profile);
  });

  stopButton.addEventListener('click', async () => {
    clearComposerError(instance);
    await getCliSurfaceApi()?.stop(projectId);
  });

  restartButton.addEventListener('click', async () => {
    clearComposerError(instance);
    await getCliSurfaceApi()?.restart(projectId);
  });

  inspectButton.addEventListener('click', () => {
    if (instance.inspectState.active) {
      closeInspectComposer(instance);
      return;
    }
    instance.inspectState = openInspect(instance.inspectState);
    renderInspectState(instance);
  });

  captureButton.addEventListener('click', () => {
    instance.inspectState = openInspect(instance.inspectState);
    clearComposerError(instance);
    renderInspectState(instance);
    setInspectPayloadFromSelection(instance, selectionFromViewport(instance));
    setComposerPositionBehavior({
      paneEl: instance.element,
      composerEl: instance.composerEl,
      left: 16,
      top: 72,
    });
  });

  selectedButton.addEventListener('click', async () => {
    const payload = getSendPayload(instance);
    if (!payload) return;
    const result = await sendCliSelectionToSelectedSession(payload);
    if (!result.ok) {
      showComposerError(instance, result.error ?? 'Failed to send prompt.');
      return;
    }
    closeInspectComposer(instance);
  });

  newButton.addEventListener('click', () => {
    const payload = getSendPayload(instance);
    if (!payload) return;
    clearComposerError(instance);
    sendCliSelectionToNewSession(payload, 'CLI inspect follow-up');
    closeInspectComposer(instance);
  });

  customButton.addEventListener('click', () => {
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

  composerContextSelect.addEventListener('change', () => {
    const nextValue = composerContextSelect.value;
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

  terminal.onSelectionChange(() => {
    if (!instance.inspectState.active) return;
    setInspectPayloadFromSelection(instance, selectionFromTerminal(instance));
  });

  selectionOverlay.addEventListener('pointerdown', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    instance.selectionAnchor = pointerToCell(instance, event);
    setHoverRegion(instance, null);
    setInspectPayloadFromPointer(instance, event);
  });

  selectionOverlay.addEventListener('pointermove', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    if (instance.selectionAnchor) {
      setInspectPayloadFromPointer(instance, event);
      return;
    }
    const current = pointerToCell(instance, event);
    setHoverRegion(instance, current ? findSelectableRegionAtCell(instance, current) : null);
  });

  selectionOverlay.addEventListener('pointerup', (event) => {
    if (!instance.inspectState.active || !instance.selectionAnchor) return;
    event.preventDefault();
    const current = pointerToCell(instance, event);
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

  selectionOverlay.addEventListener('pointerleave', () => {
    if (instance.selectionAnchor) return;
    setHoverRegion(instance, null);
  });

  terminal.onData((data) => {
    getCliSurfaceApi()?.write(projectId, data);
  });

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
