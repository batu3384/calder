import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';

const {
  mockBindRuntimeActionHandlers,
  mockBindInspectPointerHandlers,
  mockSetComposerPosition,
  mockCreateCliTargetMenuController,
} = vi.hoisted(() => ({
  mockBindRuntimeActionHandlers: vi.fn(),
  mockBindInspectPointerHandlers: vi.fn(),
  mockSetComposerPosition: vi.fn(),
  mockCreateCliTargetMenuController: vi.fn(() => ({
    openMenu: vi.fn(),
    closeMenu: vi.fn(),
    syncControls: vi.fn(),
  })),
}));

vi.mock('./pane-bindings.js', () => ({
  bindRuntimeActionHandlers: mockBindRuntimeActionHandlers,
  bindInspectActionHandlers: vi.fn(),
  bindInspectPointerHandlers: mockBindInspectPointerHandlers,
}));

vi.mock('./composer-position.js', () => ({
  setComposerPosition: mockSetComposerPosition,
}));

vi.mock('./target-menu.js', () => ({
  createCliTargetMenuController: mockCreateCliTargetMenuController,
}));

vi.mock('./session-integration.js', () => ({
  sendCliSelectionToCustomSession: vi.fn(),
  sendCliSelectionToNewSession: vi.fn(),
  sendCliSelectionToSelectedSession: vi.fn(async () => ({ ok: true })),
}));

function createContext() {
  return {
    projectId: 'project-1',
    inspectState: {
      active: false,
      selection: null,
      payload: null,
    },
    element: {} as HTMLDivElement,
    terminal: { cols: 80 },
    viewportLines: ['line 1', 'line 2'],
    targetMenuEl: {} as HTMLDivElement,
    targetMenuListEl: {} as HTMLDivElement,
    composerEl: {} as HTMLDivElement,
    selectedButton: {} as HTMLButtonElement,
    newButton: {} as HTMLButtonElement,
    customButton: {} as HTMLButtonElement,
  };
}

describe('cli surface pane action handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wires runtime capture through pane bindings', async () => {
    const { bindCliSurfaceRuntimeActionHandlers } = await import('./pane-action-handlers.js');
    const context = createContext();
    const renderInspectState = vi.fn();
    const setInspectPayloadFromSelection = vi.fn();
    const clearComposerError = vi.fn();

    bindCliSurfaceRuntimeActionHandlers({
      projectId: context.projectId,
      context,
      controls: {
        startButton: {} as HTMLButtonElement,
        stopButton: {} as HTMLButtonElement,
        restartButton: {} as HTMLButtonElement,
        captureButton: {} as HTMLButtonElement,
      },
      resolveSelectedProfile: vi.fn(() => null),
      getCliSurfaceApi: vi.fn(() => null),
      renderInspectState,
      setInspectPayloadFromSelection,
      helpers: {
        getSendPayload: () => null,
        closeInspectComposer: vi.fn(),
        clearComposerError,
        showComposerError: vi.fn(),
      },
    });

    expect(mockBindRuntimeActionHandlers).toHaveBeenCalledTimes(1);
    const args = mockBindRuntimeActionHandlers.mock.calls[0]?.[0];
    expect(args).toBeTruthy();

    args.onCapture();

    expect(context.inspectState.active).toBe(true);
    expect(clearComposerError).toHaveBeenCalledTimes(1);
    expect(renderInspectState).toHaveBeenCalledTimes(1);
    expect(setInspectPayloadFromSelection).toHaveBeenCalledWith({
      mode: 'viewport',
      startRow: 0,
      endRow: 1,
      startCol: 0,
      endCol: 80,
    });
    expect(mockSetComposerPosition).toHaveBeenCalledWith(expect.objectContaining({
      paneEl: context.element,
      composerEl: context.composerEl,
      left: 16,
      top: 72,
    }));
  });

  it('rerenders on cleared pointer selection and forwards valid selections', async () => {
    const { bindCliSurfaceInspectPointerHandlers } = await import('./pane-action-handlers.js');
    const context = createContext();
    const renderInspectState = vi.fn();
    const setInspectPayloadFromSelection = vi.fn();
    const setInspectPayloadFromPointer = vi.fn();
    const setHoverRegion = vi.fn();
    const pointerToCell = vi.fn(() => ({ row: 1, col: 2 }));
    const findSelectableRegionAtCell = vi.fn(() => null);
    const selectionFromTerminal = vi.fn(() => null);
    const positionComposerNearPointer = vi.fn();
    const onContextModeOverrideChange = vi.fn();
    const writeToRuntime = vi.fn();

    bindCliSurfaceInspectPointerHandlers({
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
    });

    expect(mockBindInspectPointerHandlers).toHaveBeenCalledTimes(1);
    const args = mockBindInspectPointerHandlers.mock.calls[0]?.[0];
    expect(args).toBeTruthy();

    args.setInspectPayloadFromSelection(null);
    expect(renderInspectState).toHaveBeenCalledTimes(1);
    expect(setInspectPayloadFromSelection).not.toHaveBeenCalled();

    const selection: SurfaceSelectionRange = {
      mode: 'line',
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 1,
    };
    args.setInspectPayloadFromSelection(selection);
    expect(setInspectPayloadFromSelection).toHaveBeenCalledWith(selection);

    const event = { clientX: 10, clientY: 20, preventDefault: vi.fn() };
    args.setInspectPayloadFromPointer(event);
    expect(setInspectPayloadFromPointer).toHaveBeenCalledWith(event);
    args.writeToRuntime(context.projectId, 'echo test');
    expect(writeToRuntime).toHaveBeenCalledWith(context.projectId, 'echo test');
  });
});
