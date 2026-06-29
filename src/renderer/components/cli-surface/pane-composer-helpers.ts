import type { AppliedContextSummary } from '../../../shared/types/project-context.js';
import type { CliSurfacePromptContextMode } from '../../../shared/types/project-core.js';
import type { SurfaceSelectionRange } from '../../../shared/types/project-surface.js';
import {
  syncComposerContextControl as syncComposerContextControlBehavior,
  syncComposerContextTrace as syncComposerContextTraceBehavior,
} from './context-controls.js';
import { pointerToCell, selectionFromCells } from './inspect-geometry.js';
import { closeInspect } from './inspect-mode.js';
import type { CliSurfaceInstance } from './pane-instance.js';

type BuildInspectPayloadFn = (
  instance: CliSurfaceInstance,
  selection: SurfaceSelectionRange,
  options?: { includeAnsiSnapshot?: boolean },
) => unknown;

export function showElement(element: HTMLElement, visible: boolean): void {
  if (visible) {
    element.classList.remove('hidden');
  } else {
    element.classList.add('hidden');
  }
}

export function syncComposerContextControl(
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

export function syncComposerContextTrace(instance: CliSurfaceInstance): void {
  syncComposerContextTraceBehavior(
    instance.composerContextTraceEl,
    instance.inspectState.payload?.appliedContext as AppliedContextSummary | undefined,
  );
}

export function clearComposerError(instance: CliSurfaceInstance): void {
  instance.composerErrorEl.textContent = '';
  instance.composerErrorEl.style.display = 'none';
}

export function showComposerError(instance: CliSurfaceInstance, message: string): void {
  showElement(instance.composerEl, true);
  instance.composerErrorEl.textContent = message;
  instance.composerErrorEl.style.display = 'block';
}

function getSendPayload(instance: CliSurfaceInstance, buildInspectPayload: BuildInspectPayloadFn) {
  const selection = instance.inspectState.selection ?? instance.inspectState.payload?.selection;
  if (!selection) return null;
  return buildInspectPayload(instance, selection, { includeAnsiSnapshot: true });
}

function closeInspectComposer(instance: CliSurfaceInstance, renderInspectState: () => void): void {
  instance.inspectState = closeInspect(instance.inspectState);
  renderInspectState();
  clearComposerError(instance);
}

export function createCliSurfaceComposerHelpers(
  instance: CliSurfaceInstance,
  buildInspectPayload: BuildInspectPayloadFn,
  renderInspectState: () => void,
) {
  return {
    getSendPayload: () => getSendPayload(instance, buildInspectPayload),
    closeInspectComposer: () => closeInspectComposer(instance, renderInspectState),
    clearComposerError: () => clearComposerError(instance),
    showComposerError: (message: string) => showComposerError(instance, message),
  };
}

export function setInspectPayloadFromPointer(
  instance: CliSurfaceInstance,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  setInspectPayloadFromSelection: (selection: SurfaceSelectionRange | null) => void,
): void {
  if (!instance.selectionAnchor) return;
  const current = pointerToCell(
    instance.viewport,
    instance.terminal.cols,
    instance.terminal.rows,
    event,
  );
  if (!current) return;
  setInspectPayloadFromSelection(
    selectionFromCells({
      viewportLineCount: instance.viewportLines.length,
      terminalCols: instance.terminal.cols,
      start: instance.selectionAnchor,
      end: current,
    }),
  );
}
