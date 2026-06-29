import type { CliSurfacePromptContextMode } from '../../../shared/types/project-core.js';
import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import {
  setComposerPosition as setComposerPositionBehavior,
} from './composer-position.js';
import { selectionFromViewport } from './inspect-geometry.js';
import { openInspect } from './inspect-mode.js';
import {
  bindInspectActionHandlers as bindInspectActionHandlersModule,
  bindInspectPointerHandlers as bindInspectPointerHandlersModule,
  bindRuntimeActionHandlers as bindRuntimeActionHandlersModule,
} from './pane-bindings.js';
import type { CliSurfaceLayoutElements } from './pane-elements.js';
import {
  sendCliSelectionToCustomSession,
  sendCliSelectionToNewSession,
  sendCliSelectionToSelectedSession,
} from './session-integration.js';
import { type CliTargetMenuController,createCliTargetMenuController } from './target-menu.js';

type CliSurfaceApi = {
  start(projectId: string, profile: unknown): Promise<void>;
  stop(projectId: string): Promise<void>;
  restart(projectId: string): Promise<void>;
  write(projectId: string, data: string): void;
};

type PointerCell = { row: number; col: number };
type PointerLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'preventDefault'>;
type SelectableRegion = { selection: SurfaceSelectionRange };

export interface CliSurfaceActionContext {
  projectId: string;
  inspectState: {
    active: boolean;
    selection: SurfaceSelectionRange | null;
    payload: { selection: SurfaceSelectionRange } | null;
  };
  element: HTMLDivElement;
  terminal: {
    cols: number;
  };
  viewportLines: string[];
  targetMenuEl: HTMLDivElement;
  targetMenuListEl: HTMLDivElement;
  composerEl: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
}

interface CliSurfaceActionHelpers {
  getSendPayload(): unknown | null;
  closeInspectComposer(): void;
  clearComposerError(): void;
  showComposerError(message: string): void;
}

interface CliSurfaceRuntimeHandlerOptions {
  projectId: string;
  context: CliSurfaceActionContext;
  controls: Pick<CliSurfaceLayoutElements, 'startButton' | 'stopButton' | 'restartButton' | 'captureButton'>;
  resolveSelectedProfile(projectId: string): unknown;
  getCliSurfaceApi(): CliSurfaceApi | null | undefined;
  renderInspectState(): void;
  setInspectPayloadFromSelection(selection: ReturnType<typeof selectionFromViewport>): void;
  helpers: CliSurfaceActionHelpers;
}

interface CliSurfaceInspectHandlerOptions {
  context: CliSurfaceActionContext;
  openInspectComposer(): void;
  helpers: CliSurfaceActionHelpers;
}

interface CliSurfacePointerHandlerOptions {
  context: CliSurfaceActionContext;
  renderInspectState(): void;
  setInspectPayloadFromSelection(selection: SurfaceSelectionRange | null): void;
  setInspectPayloadFromPointer(event: PointerLike): void;
  setHoverRegion(region: SelectableRegion | null): void;
  pointerToCell(event: PointerLike): PointerCell | null;
  findSelectableRegionAtCell(cell: PointerCell): SelectableRegion | null;
  selectionFromTerminal(): SurfaceSelectionRange | null;
  positionComposerNearPointer(event: PointerLike): void;
  onContextModeOverrideChange(mode: CliSurfacePromptContextMode | null): void;
  writeToRuntime(projectId: string, data: string): void;
}

export function createCliSurfaceTargetMenuControllerWithHandlers(
  context: CliSurfaceActionContext,
  helpers: CliSurfaceActionHelpers,
): CliTargetMenuController {
  return createCliTargetMenuController({
    projectId: context.projectId,
    elements: {
      composerEl: context.composerEl,
      selectedButton: context.selectedButton,
      newButton: context.newButton,
      customButton: context.customButton,
      targetMenuEl: context.targetMenuEl,
      targetMenuListEl: context.targetMenuListEl,
    },
    hasPayload: () => Boolean(context.inspectState.payload),
    onSendToNew: () => {
      const payload = helpers.getSendPayload();
      if (!payload) return;
      helpers.clearComposerError();
      sendCliSelectionToNewSession(payload, 'CLI inspect follow-up');
      helpers.closeInspectComposer();
    },
    onSendToCustom: () => {
      const payload = helpers.getSendPayload();
      if (!payload) return;
      sendCliSelectionToCustomSession(payload, () => {
        helpers.clearComposerError();
        helpers.closeInspectComposer();
      });
    },
  });
}

export function bindCliSurfaceRuntimeActionHandlers(options: CliSurfaceRuntimeHandlerOptions): void {
  const {
    projectId,
    context,
    controls,
    resolveSelectedProfile,
    getCliSurfaceApi,
    renderInspectState,
    setInspectPayloadFromSelection,
    helpers,
  } = options;
  bindRuntimeActionHandlersModule({
    projectId,
    controls,
    resolveSelectedProfile,
    showComposerError: (message) => helpers.showComposerError(message),
    clearComposerError: () => helpers.clearComposerError(),
    getCliSurfaceApi,
    onCapture: () => {
      context.inspectState = openInspect(context.inspectState as any) as any;
      helpers.clearComposerError();
      renderInspectState();
      setInspectPayloadFromSelection(
        selectionFromViewport(context.viewportLines.length, context.terminal.cols),
      );
      setComposerPositionBehavior({
        paneEl: context.element,
        composerEl: context.composerEl,
        left: 16,
        top: 72,
      });
    },
  });
}

export function bindCliSurfaceInspectActionHandlers(options: CliSurfaceInspectHandlerOptions): void {
  const {
    context,
    openInspectComposer,
    helpers,
  } = options;
  bindInspectActionHandlersModule({
    instance: context as any,
    closeInspectComposer: () => helpers.closeInspectComposer(),
    openInspectComposer,
    onSendToSelected: async () => {
      const payload = helpers.getSendPayload();
      if (!payload) return;
      const result = await sendCliSelectionToSelectedSession(payload);
      if (!result.ok) {
        helpers.showComposerError(result.error ?? 'Failed to send prompt.');
        return;
      }
      helpers.closeInspectComposer();
    },
    onSendToNew: () => {
      const payload = helpers.getSendPayload();
      if (!payload) return;
      helpers.clearComposerError();
      sendCliSelectionToNewSession(payload, 'CLI inspect follow-up');
      helpers.closeInspectComposer();
    },
  });
}

export function bindCliSurfaceInspectPointerHandlers(options: CliSurfacePointerHandlerOptions): void {
  const {
    context,
    renderInspectState,
    setInspectPayloadFromSelection,
    setInspectPayloadFromPointer,
    setHoverRegion,
    pointerToCell,
    findSelectableRegionAtCell,
    selectionFromTerminal,
    positionComposerNearPointer,
    onContextModeOverrideChange,
    writeToRuntime,
  } = options;

  bindInspectPointerHandlersModule({
    instance: context as any,
    setInspectPayloadFromSelection: (selection) => {
      if (!selection) {
        renderInspectState();
        return;
      }
      setInspectPayloadFromSelection(selection);
    },
    setInspectPayloadFromPointer,
    setHoverRegion,
    pointerToCell,
    findSelectableRegionAtCell,
    selectionFromTerminal,
    positionComposerNearPointer,
    onContextModeOverrideChange,
    writeToRuntime,
  });
}
