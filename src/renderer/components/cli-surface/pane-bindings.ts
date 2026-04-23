import type { CliSurfacePromptContextMode } from '../../../shared/types/project-core.js';
import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import type { CliSurfaceLayoutElements } from './pane-elements.js';

type CliSurfaceApi = {
  start(projectId: string, profile: unknown): Promise<void>;
  stop(projectId: string): Promise<void>;
  restart(projectId: string): Promise<void>;
  write(projectId: string, data: string): void;
};

type PointerCell = { row: number; col: number };
type PointerLike = Pick<PointerEvent, 'clientX' | 'clientY' | 'preventDefault'>;
type SelectableRegion = { selection: SurfaceSelectionRange };

interface CliSurfaceBindingsInstance {
  projectId: string;
  inspectState: {
    active: boolean;
    selection: SurfaceSelectionRange | null;
    payload: { selection: SurfaceSelectionRange } | null;
  };
  inspectButton: HTMLButtonElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenuEl: HTMLDivElement;
  selectionOverlayEl: HTMLDivElement;
  composerContextSelectEl: HTMLSelectElement;
  contextModeOverride: CliSurfacePromptContextMode | null;
  selectionAnchor: PointerCell | null;
  viewport: HTMLDivElement;
  terminal: {
    cols: number;
    rows: number;
    buffer: { active: { viewportY: number } };
    onSelectionChange(listener: () => void): void;
    onData(listener: (data: string) => void): void;
    getSelection(): string;
    getSelectionPosition(): unknown;
  };
  viewportLines: string[];
  element: HTMLDivElement;
  composerEl: HTMLDivElement;
  targetMenuController?: {
    openMenu(): void;
    closeMenu(): void;
  };
  targetMenuOutsideClickHandler?: (event: MouseEvent) => void;
}

interface BindRuntimeHandlersArgs {
  projectId: string;
  controls: Pick<CliSurfaceLayoutElements, 'startButton' | 'stopButton' | 'restartButton' | 'captureButton'>;
  resolveSelectedProfile: (projectId: string) => unknown;
  showComposerError: (message: string) => void;
  clearComposerError: () => void;
  getCliSurfaceApi: () => CliSurfaceApi | null | undefined;
  onCapture: () => void;
}

interface BindInspectHandlersArgs {
  instance: CliSurfaceBindingsInstance;
  closeInspectComposer: () => void;
  openInspectComposer: () => void;
  onSendToSelected: () => Promise<void>;
  onSendToNew: () => void;
}

interface BindPointerHandlersArgs {
  instance: CliSurfaceBindingsInstance;
  setInspectPayloadFromSelection: (selection: SurfaceSelectionRange | null) => void;
  setInspectPayloadFromPointer: (event: PointerLike) => void;
  setHoverRegion: (region: SelectableRegion | null) => void;
  pointerToCell: (event: PointerLike) => PointerCell | null;
  findSelectableRegionAtCell: (cell: PointerCell) => SelectableRegion | null;
  selectionFromTerminal: () => SurfaceSelectionRange | null;
  positionComposerNearPointer: (event: PointerLike) => void;
  onContextModeOverrideChange: (mode: CliSurfacePromptContextMode | null) => void;
  writeToRuntime: (projectId: string, data: string) => void;
}

export function bindRuntimeActionHandlers({
  projectId,
  controls,
  resolveSelectedProfile,
  showComposerError,
  clearComposerError,
  getCliSurfaceApi,
  onCapture,
}: BindRuntimeHandlersArgs): void {
  controls.startButton.addEventListener('click', async () => {
    const profile = resolveSelectedProfile(projectId);
    if (!profile) {
      showComposerError('Select a CLI surface profile first.');
      return;
    }
    clearComposerError();
    await getCliSurfaceApi()?.start(projectId, profile);
  });

  controls.stopButton.addEventListener('click', async () => {
    clearComposerError();
    await getCliSurfaceApi()?.stop(projectId);
  });

  controls.restartButton.addEventListener('click', async () => {
    clearComposerError();
    await getCliSurfaceApi()?.restart(projectId);
  });

  controls.captureButton.addEventListener('click', () => {
    onCapture();
  });
}

export function bindInspectActionHandlers({
  instance,
  closeInspectComposer,
  openInspectComposer,
  onSendToSelected,
  onSendToNew,
}: BindInspectHandlersArgs): void {
  instance.inspectButton.addEventListener('click', () => {
    if (instance.inspectState.active) {
      closeInspectComposer();
      return;
    }
    openInspectComposer();
  });

  instance.selectedButton.addEventListener('click', async () => {
    await onSendToSelected();
  });

  instance.newButton.addEventListener('click', () => {
    onSendToNew();
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

export function bindInspectPointerHandlers({
  instance,
  setInspectPayloadFromSelection,
  setInspectPayloadFromPointer,
  setHoverRegion,
  pointerToCell,
  findSelectableRegionAtCell,
  selectionFromTerminal,
  positionComposerNearPointer,
  onContextModeOverrideChange,
  writeToRuntime,
}: BindPointerHandlersArgs): void {
  instance.composerContextSelectEl.addEventListener('change', () => {
    const nextValue = instance.composerContextSelectEl.value;
    const override = nextValue === 'auto'
      ? null
      : nextValue as CliSurfacePromptContextMode;
    onContextModeOverrideChange(override);
    const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
    if (selection) {
      setInspectPayloadFromSelection(selection);
    }
  });

  instance.terminal.onSelectionChange(() => {
    if (!instance.inspectState.active) return;
    setInspectPayloadFromSelection(selectionFromTerminal());
  });

  instance.selectionOverlayEl.addEventListener('pointerdown', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    instance.selectionAnchor = pointerToCell(event);
    setHoverRegion(null);
    setInspectPayloadFromPointer(event);
  });

  instance.selectionOverlayEl.addEventListener('pointermove', (event) => {
    if (!instance.inspectState.active) return;
    event.preventDefault();
    if (instance.selectionAnchor) {
      setInspectPayloadFromPointer(event);
      return;
    }
    const current = pointerToCell(event);
    setHoverRegion(current ? findSelectableRegionAtCell(current) : null);
  });

  instance.selectionOverlayEl.addEventListener('pointerup', (event) => {
    if (!instance.inspectState.active || !instance.selectionAnchor) return;
    event.preventDefault();
    const current = pointerToCell(event);
    const singleClick = current
      && current.row === instance.selectionAnchor.row
      && current.col === instance.selectionAnchor.col;

    if (singleClick && current) {
      const region = findSelectableRegionAtCell(current);
      if (region) {
        setInspectPayloadFromSelection(region.selection);
      } else {
        setInspectPayloadFromPointer(event);
      }
    } else {
      setInspectPayloadFromPointer(event);
    }
    positionComposerNearPointer(event);
    instance.selectionAnchor = null;
    setHoverRegion(null);
  });

  instance.selectionOverlayEl.addEventListener('pointerleave', () => {
    if (instance.selectionAnchor) return;
    setHoverRegion(null);
  });

  instance.terminal.onData((data) => {
    writeToRuntime(instance.projectId, data);
  });
}
