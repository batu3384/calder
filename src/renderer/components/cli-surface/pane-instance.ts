import type { CliSurfacePromptContextMode } from '../../../shared/types/project-core.js';
import type { InferredCliRegion } from './heuristics.js';
import { type CliInspectState, createInitialInspectState } from './inspect-mode.js';
import type { SelectableCliRegion } from './inspect-selection.js';
import type { CliSurfaceLayoutElements, CliSurfaceTerminalElements } from './pane-elements.js';
import type { CliTargetMenuController } from './target-menu.js';

export interface CliSurfaceInstance {
  projectId: string;
  element: HTMLDivElement;
  viewport: HTMLDivElement;
  selectionOverlayEl: HTMLDivElement;
  hoverOverlayEl: HTMLDivElement;
  hoverLabelEl: HTMLDivElement;
  hoverMetaEl: HTMLDivElement;
  hoverPreviewEl: HTMLPreElement;
  terminal: CliSurfaceTerminalElements['terminal'];
  fitAddon: CliSurfaceTerminalElements['fitAddon'];
  serializeAddon: CliSurfaceTerminalElements['serializeAddon'];
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

export function createCliSurfaceInstance(
  projectId: string,
  layout: CliSurfaceLayoutElements,
  terminalElements: CliSurfaceTerminalElements,
): CliSurfaceInstance {
  return {
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
}
