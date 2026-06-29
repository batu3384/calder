import type {
  SurfacePromptPayload,
  SurfaceSelectionRange,
} from '../../../shared/types/project-surface.js';
import type { InferredCliRegion } from './heuristics.js';
import { selectionsMatchBounds } from './inspect-geometry.js';
import { setInspectPayload } from './inspect-mode.js';
import type { SelectableCliRegion } from './inspect-selection.js';
import {
  clearComposerError,
  showElement,
  syncComposerContextControl,
  syncComposerContextTrace,
} from './pane-composer-helpers.js';
import type { CliSurfaceInstance } from './pane-instance.js';

interface CliSurfaceInspectStateDeps {
  buildInspectPayload: (
    instance: CliSurfaceInstance,
    selection: SurfaceSelectionRange,
  ) => SurfacePromptPayload;
  getInferredRegions: (instance: CliSurfaceInstance) => InferredCliRegion[];
  showHoverRegion: (instance: CliSurfaceInstance, region: SelectableCliRegion | null) => void;
}

export function createCliSurfaceInspectStateHelpers(deps: CliSurfaceInspectStateDeps) {
  const syncViewportLines = (instance: CliSurfaceInstance): void => {
    const buffer = instance.terminal.buffer.active;
    const start = buffer.viewportY;
    instance.viewportLines = Array.from(
      { length: instance.terminal.rows },
      (_, index) => buffer.getLine(start + index)?.translateToString(true) ?? '',
    );
    deps.getInferredRegions(instance);
  };

  const renderInspectState = (instance: CliSurfaceInstance): void => {
    const hasPayload = Boolean(instance.inspectState.payload);
    showElement(instance.composerEl, hasPayload);
    showElement(instance.selectionOverlayEl, instance.inspectState.active);
    deps.showHoverRegion(
      instance,
      instance.inspectState.active && !instance.selectionAnchor ? instance.hoveredRegion : null,
    );
    showElement(instance.inspectButton, true);
    instance.inspectButton.textContent = instance.inspectState.active ? 'Exit Inspect' : 'Inspect';
    instance.inspectButton.classList.toggle('active', instance.inspectState.active);
    instance.inspectButton.setAttribute(
      'aria-pressed',
      instance.inspectState.active ? 'true' : 'false',
    );

    if (!instance.inspectState.active && !hasPayload) {
      instance.composerHintEl.textContent =
        'Press Inspect, then drag over terminal output. Use Capture only when you want the whole screen.';
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
      if (payload.semanticLabel) hintParts.push(`Semantic target: ${payload.semanticLabel}`);
      if (payload.inferredLabel) hintParts.push(`Inside: ${payload.inferredLabel}`);
    }
    if (payload.command) hintParts.push(`Command: ${payload.command}`);
    instance.composerHintEl.textContent = hintParts.join(' · ');
    instance.composerPreviewEl.textContent = payload.selectedText || payload.viewportText;
    syncComposerContextControl(instance, payload.contextMode ?? 'selection-only');
    syncComposerContextTrace(instance);
    instance.targetMenuController?.syncControls();
  };

  const setInspectPayloadFromSelection = (
    instance: CliSurfaceInstance,
    selection: SurfaceSelectionRange | null,
  ): void => {
    if (!selection) {
      renderInspectState(instance);
      return;
    }

    instance.inspectState = setInspectPayload(
      instance.inspectState,
      selection,
      deps.buildInspectPayload(instance, selection),
    );
    renderInspectState(instance);
  };

  const setHoverRegion = (
    instance: CliSurfaceInstance,
    region: SelectableCliRegion | null,
  ): void => {
    if (
      instance.hoveredRegion?.label === region?.label &&
      instance.hoveredRegion &&
      region &&
      selectionsMatchBounds(instance.hoveredRegion.selection, region.selection)
    ) {
      return;
    }
    instance.hoveredRegion = region;
    renderInspectState(instance);
  };

  return {
    syncViewportLines,
    renderInspectState,
    setInspectPayloadFromSelection,
    setHoverRegion,
  };
}
