import { appState, type ProjectRecord } from '../state.js';
import { clampRatio } from './mosaic-layout-model.js';
import { attachRatioHandle } from './mosaic-resize.js';

type RegisterMosaicResizeCleanup = (cleanup: () => void) => void;
type ShowPanes = (project: ProjectRecord, target: HTMLElement, paneIds: string[]) => void;

export function formatRatio(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function formatInverseRatio(value: number): string {
  return formatRatio(1 - value);
}

function readMosaicRatio(project: ProjectRecord, key: string, fallback = 0.5): number {
  return clampRatio(project.layout.mosaicRatios?.[key], 0.2, 0.8, fallback);
}

function createMosaicSlot(className = 'mosaic-slot'): HTMLElement {
  const slot = document.createElement('div');
  slot.className = className;
  return slot;
}

function appendMosaicSlot(
  project: ProjectRecord,
  target: HTMLElement,
  paneIds: string[],
  showPanes: ShowPanes,
  className = 'mosaic-slot',
): HTMLElement {
  const slot = createMosaicSlot(className);
  target.appendChild(slot);
  showPanes(project, slot, paneIds);
  return slot;
}

export function createMosaicDivider(axis: 'x' | 'y', className: string): HTMLElement {
  const divider = document.createElement('div');
  divider.className = `mosaic-divider ${className}`;
  divider.dataset.axis = axis;
  return divider;
}

export function bindMosaicDivider(
  handle: HTMLElement,
  boundsTarget: HTMLElement | (() => DOMRect),
  callbacks: { onPreview?: (ratio: number) => void; onCommit?: (ratio: number) => void },
  options: { axis: 'x' | 'y'; min: number; max: number; fallback: number },
  registerResizeCleanup: RegisterMosaicResizeCleanup,
): void {
  const getBounds = typeof boundsTarget === 'function'
    ? boundsTarget
    : () => boundsTarget.getBoundingClientRect();
  registerResizeCleanup(
    attachRatioHandle(handle, getBounds, callbacks, options),
  );
}

interface RenderSwarmMosaicPresetParams {
  project: ProjectRecord;
  canvas: HTMLElement;
  preset: string;
  paneIds: string[];
  dividerTrack: string;
  showPanes: ShowPanes;
  registerResizeCleanup: RegisterMosaicResizeCleanup;
}

function renderSingleMosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, showPanes } = params;
  canvas.style.gap = '10px';
  canvas.style.gridTemplateColumns = '1fr';
  canvas.style.gridTemplateRows = '1fr';
  showPanes(project, canvas, paneIds);
}

function renderColumns2MosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, dividerTrack, showPanes, registerResizeCleanup } = params;
  const primaryRatio = readMosaicRatio(project, 'columns-2-primary', 0.5);
  const applyColumns2 = (ratio: number) => {
    canvas.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    canvas.style.gridTemplateRows = '1fr';
  };
  canvas.style.gap = '0';
  applyColumns2(primaryRatio);

  appendMosaicSlot(project, canvas, [paneIds[0]], showPanes);
  const primaryDivider = createMosaicDivider('x', 'mosaic-divider-primary');
  canvas.appendChild(primaryDivider);
  appendMosaicSlot(project, canvas, [paneIds[1]], showPanes);

  bindMosaicDivider(primaryDivider, canvas, {
    onPreview: (ratio) => applyColumns2(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'columns-2-primary', ratio),
  }, {
    axis: 'x',
    min: 0.2,
    max: 0.8,
    fallback: 0.5,
  }, registerResizeCleanup);
}

function renderRows2MosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, dividerTrack, showPanes, registerResizeCleanup } = params;
  const primaryRatio = readMosaicRatio(project, 'rows-2-primary', 0.5);
  const applyRows2 = (ratio: number) => {
    canvas.style.gridTemplateColumns = '1fr';
    canvas.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
  };
  canvas.style.gap = '0';
  applyRows2(primaryRatio);

  appendMosaicSlot(project, canvas, [paneIds[0]], showPanes);
  const primaryDivider = createMosaicDivider('y', 'mosaic-divider-primary');
  canvas.appendChild(primaryDivider);
  appendMosaicSlot(project, canvas, [paneIds[1]], showPanes);

  bindMosaicDivider(primaryDivider, canvas, {
    onPreview: (ratio) => applyRows2(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'rows-2-primary', ratio),
  }, {
    axis: 'y',
    min: 0.2,
    max: 0.8,
    fallback: 0.5,
  }, registerResizeCleanup);
}

function renderFocusLeftMosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, dividerTrack, showPanes, registerResizeCleanup } = params;
  const mainRatio = readMosaicRatio(project, 'focus-left-main', 0.58);
  const stackRatio = readMosaicRatio(project, 'focus-left-stack', 0.5);
  const applyFocusLeftMain = (ratio: number) => {
    canvas.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    canvas.style.gridTemplateRows = '1fr';
  };
  canvas.classList.add('mosaic-focus-left');
  canvas.style.gap = '0';
  applyFocusLeftMain(mainRatio);

  appendMosaicSlot(project, canvas, [paneIds[0]], showPanes, 'mosaic-focus-left-main');
  const primaryDivider = createMosaicDivider('x', 'mosaic-divider-primary');
  canvas.appendChild(primaryDivider);

  const stack = document.createElement('div');
  stack.className = 'mosaic-focus-left-stack';
  stack.style.gap = '0';
  const applyFocusLeftStack = (ratio: number) => {
    stack.style.gridTemplateColumns = '1fr';
    stack.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
  };
  applyFocusLeftStack(stackRatio);
  canvas.appendChild(stack);

  appendMosaicSlot(project, stack, [paneIds[1]], showPanes);
  const secondaryDivider = createMosaicDivider('y', 'mosaic-divider-secondary');
  stack.appendChild(secondaryDivider);
  appendMosaicSlot(project, stack, [paneIds[2]], showPanes);

  bindMosaicDivider(primaryDivider, canvas, {
    onPreview: (ratio) => applyFocusLeftMain(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-left-main', ratio),
  }, {
    axis: 'x',
    min: 0.2,
    max: 0.8,
    fallback: 0.58,
  }, registerResizeCleanup);

  bindMosaicDivider(secondaryDivider, stack, {
    onPreview: (ratio) => applyFocusLeftStack(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-left-stack', ratio),
  }, {
    axis: 'y',
    min: 0.2,
    max: 0.8,
    fallback: 0.5,
  }, registerResizeCleanup);
}

function renderFocusTopMosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, dividerTrack, showPanes, registerResizeCleanup } = params;
  const mainRatio = readMosaicRatio(project, 'focus-top-main', 0.58);
  const rowRatio = readMosaicRatio(project, 'focus-top-row', 0.5);
  const applyFocusTopMain = (ratio: number) => {
    canvas.style.gridTemplateColumns = '1fr';
    canvas.style.gridTemplateRows = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
  };
  canvas.classList.add('mosaic-focus-top');
  canvas.style.gap = '0';
  applyFocusTopMain(mainRatio);

  appendMosaicSlot(project, canvas, [paneIds[0]], showPanes, 'mosaic-focus-top-main');
  const primaryDivider = createMosaicDivider('y', 'mosaic-divider-primary');
  canvas.appendChild(primaryDivider);

  const row = document.createElement('div');
  row.className = 'mosaic-focus-top-row';
  row.style.gap = '0';
  const applyFocusTopRow = (ratio: number) => {
    row.style.gridTemplateColumns = `minmax(0, ${formatRatio(ratio)}fr) ${dividerTrack} minmax(0, ${formatInverseRatio(ratio)}fr)`;
    row.style.gridTemplateRows = '1fr';
  };
  applyFocusTopRow(rowRatio);
  canvas.appendChild(row);

  appendMosaicSlot(project, row, [paneIds[1]], showPanes);
  const secondaryDivider = createMosaicDivider('x', 'mosaic-divider-secondary');
  row.appendChild(secondaryDivider);
  appendMosaicSlot(project, row, [paneIds[2]], showPanes);

  bindMosaicDivider(primaryDivider, canvas, {
    onPreview: (ratio) => applyFocusTopMain(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-top-main', ratio),
  }, {
    axis: 'y',
    min: 0.2,
    max: 0.8,
    fallback: 0.58,
  }, registerResizeCleanup);

  bindMosaicDivider(secondaryDivider, row, {
    onPreview: (ratio) => applyFocusTopRow(ratio),
    onCommit: (ratio) => appState.setMosaicRatio(project.id, 'focus-top-row', ratio),
  }, {
    axis: 'x',
    min: 0.2,
    max: 0.8,
    fallback: 0.5,
  }, registerResizeCleanup);
}

function renderGridMosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { project, canvas, paneIds, showPanes } = params;
  canvas.classList.add('mosaic-grid-2x2');
  canvas.style.gap = '10px';
  canvas.style.gridTemplateColumns = 'repeat(2, 1fr)';
  canvas.style.gridTemplateRows = `repeat(${Math.max(2, Math.ceil(paneIds.length / 2))}, 1fr)`;
  showPanes(project, canvas, paneIds);
}

export function renderSwarmMosaicPreset(params: RenderSwarmMosaicPresetParams): void {
  const { preset, paneIds } = params;
  if (preset === 'single') {
    renderSingleMosaicPreset(params);
    return;
  }
  if (preset === 'columns-2') {
    renderColumns2MosaicPreset(params);
    return;
  }
  if (preset === 'rows-2') {
    renderRows2MosaicPreset(params);
    return;
  }
  if (preset === 'focus-left' && paneIds.length >= 3) {
    renderFocusLeftMosaicPreset(params);
    return;
  }
  if (preset === 'focus-top' && paneIds.length >= 3) {
    renderFocusTopMosaicPreset(params);
    return;
  }
  renderGridMosaicPreset(params);
}
