import type { SurfaceSelectionRange } from '../../../shared/types.js';
import { buildSelectionText } from './selection.js';
import type { CalderProtocolMessage } from './protocol.js';

export interface CliHoverRegion {
  kind: 'semantic' | 'inferred';
  label: string;
  selection: SurfaceSelectionRange;
  semanticNodeId?: string;
}

interface RenderCliHoverOverlayOptions {
  projectId: string;
  inspectActive: boolean;
  hasPayload: boolean;
  region: CliHoverRegion | null;
  viewportLines: string[];
  viewportEl: HTMLDivElement;
  terminalRows: number;
  terminalCols: number;
  overlayEl: HTMLDivElement;
  labelEl: HTMLDivElement;
  metaEl: HTMLDivElement;
  previewEl: HTMLPreElement;
  semanticNodes?: Map<string, CalderProtocolMessage>;
  semanticFocusNodes?: Map<string, CalderProtocolMessage>;
}

function resetHoverOverlay(options: RenderCliHoverOverlayOptions): void {
  const { overlayEl, labelEl, metaEl, previewEl } = options;
  overlayEl.classList.add('hidden');
  labelEl.textContent = '';
  metaEl.textContent = '';
  previewEl.textContent = '';
  overlayEl.classList.remove('semantic', 'inferred', 'focused', 'floating-above', 'floating-below');
  overlayEl.dataset.kind = '';
  overlayEl.dataset.placement = '';
  overlayEl.dataset.focused = 'false';
}

function getHoverRegionMeta(options: RenderCliHoverOverlayOptions, region: CliHoverRegion): {
  detail: string;
  focused: boolean;
} {
  if (region.kind === 'inferred') {
    return {
      detail: 'Inferred panel',
      focused: false,
    };
  }

  const focused = region.semanticNodeId === options.semanticFocusNodes?.values().next().value?.nodeId;
  const nodeMessage = region.semanticNodeId
    ? options.semanticNodes?.get(region.semanticNodeId)
    : undefined;
  const focusMessage = region.semanticNodeId
    ? options.semanticFocusNodes?.get(region.semanticNodeId)
    : undefined;
  const meta = {
    ...(nodeMessage?.meta ?? {}),
    ...(focusMessage?.meta ?? {}),
  } as Record<string, unknown>;

  const framework = typeof meta.framework === 'string' ? meta.framework : null;
  const widget = typeof meta.widgetName === 'string'
    ? meta.widgetName
    : typeof meta.widgetType === 'string'
      ? meta.widgetType
      : typeof meta.componentName === 'string'
        ? meta.componentName
        : typeof meta.componentType === 'string'
          ? meta.componentType
          : null;

  return {
    detail: [
      'Semantic target',
      focused ? 'Focused' : null,
      framework,
      widget,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · '),
    focused,
  };
}

function getHoverPlacementClass(
  options: RenderCliHoverOverlayOptions,
  region: CliHoverRegion,
): 'floating-above' | 'floating-below' | 'inline' {
  const viewportRect = options.viewportEl.getBoundingClientRect();
  const rowHeight = viewportRect.height > 0 && options.terminalRows > 0
    ? viewportRect.height / options.terminalRows
    : 0;
  const regionTop = Math.max(0, region.selection.startRow * rowHeight);
  const regionHeight = Math.max(rowHeight, (region.selection.endRow - region.selection.startRow + 1) * rowHeight);
  const regionBottom = regionTop + regionHeight;
  const availableAbove = regionTop;
  const availableBelow = Math.max(0, viewportRect.height - regionBottom);
  const preferredCardHeight = 116;

  if (regionHeight < preferredCardHeight) {
    if (availableBelow >= Math.min(72, preferredCardHeight)) {
      return 'floating-below';
    }
    if (availableAbove >= Math.min(72, preferredCardHeight)) {
      return 'floating-above';
    }
  }

  return 'inline';
}

export function renderCliHoverOverlay(options: RenderCliHoverOverlayOptions): void {
  const { inspectActive, hasPayload, region } = options;
  const shouldShow = Boolean(inspectActive && !hasPayload && region);
  if (!shouldShow || !region) {
    resetHoverOverlay(options);
    return;
  }

  const { overlayEl, labelEl, metaEl, previewEl } = options;
  overlayEl.classList.remove('hidden');
  const hoverMeta = getHoverRegionMeta(options, region);
  const placement = getHoverPlacementClass(options, region);
  overlayEl.classList.toggle('semantic', region.kind === 'semantic');
  overlayEl.classList.toggle('inferred', region.kind === 'inferred');
  overlayEl.classList.toggle('focused', hoverMeta.focused);
  overlayEl.classList.toggle('floating-above', placement === 'floating-above');
  overlayEl.classList.toggle('floating-below', placement === 'floating-below');
  overlayEl.dataset.kind = region.kind;
  overlayEl.dataset.placement = placement === 'inline' ? 'inline' : placement === 'floating-below' ? 'below' : 'above';
  overlayEl.dataset.focused = hoverMeta.focused ? 'true' : 'false';

  const viewportRect = options.viewportEl.getBoundingClientRect();
  const rowHeight = viewportRect.height > 0 && options.terminalRows > 0
    ? viewportRect.height / options.terminalRows
    : 0;
  const colWidth = viewportRect.width > 0 && options.terminalCols > 0
    ? viewportRect.width / options.terminalCols
    : 0;

  overlayEl.style.left = `${Math.max(0, region.selection.startCol * colWidth)}px`;
  overlayEl.style.top = `${Math.max(0, region.selection.startRow * rowHeight)}px`;
  overlayEl.style.width = `${Math.max(colWidth, (region.selection.endCol - region.selection.startCol) * colWidth)}px`;
  overlayEl.style.height = `${Math.max(rowHeight, (region.selection.endRow - region.selection.startRow + 1) * rowHeight)}px`;
  labelEl.textContent = region.label;
  metaEl.textContent = hoverMeta.detail;
  previewEl.textContent = buildSelectionText(options.viewportLines, region.selection);
}
