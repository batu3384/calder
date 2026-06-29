import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import {
  extractUrlFromEventTarget,
  findInlineUrlAtPointer,
  openCliSurfaceWebLink,
} from './link-dispatch.js';

type CliSurfaceButtonTone = 'neutral' | 'primary' | 'danger' | 'ghost';

function buildToolbarButton(
  label: string,
  action: string,
  tone: CliSurfaceButtonTone = 'neutral',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `cli-surface-button cli-surface-button-${tone}`;
  button.type = 'button';
  button.dataset.action = action;
  button.dataset.tone = tone;
  button.textContent = label;
  return button;
}

export interface CliSurfaceLayoutElements {
  element: HTMLDivElement;
  viewport: HTMLDivElement;
  selectionOverlay: HTMLDivElement;
  hoverOverlay: HTMLDivElement;
  hoverLabel: HTMLDivElement;
  hoverMeta: HTMLDivElement;
  hoverPreview: HTMLPreElement;
  empty: HTMLDivElement;
  meta: HTMLDivElement;
  route: HTMLDivElement;
  adapterMeta: HTMLDivElement;
  inspectButton: HTMLButtonElement;
  composer: HTMLDivElement;
  composerHandle: HTMLDivElement;
  composerHint: HTMLDivElement;
  composerPreview: HTMLPreElement;
  composerScope: HTMLDivElement;
  composerContextTrace: HTMLDivElement;
  composerContextSelect: HTMLSelectElement;
  composerError: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenu: HTMLDivElement;
  targetMenuList: HTMLDivElement;
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  captureButton: HTMLButtonElement;
}

export interface CliSurfaceTerminalElements {
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
}

export interface CliSurfaceTerminalDeps {
  resolveProjectPath: (projectId: string) => string | undefined;
  openExternal: (url: string, cwd?: string) => void;
}

interface CliSurfaceToolbarElements {
  toolbar: HTMLDivElement;
  meta: HTMLDivElement;
  route: HTMLDivElement;
  adapterMeta: HTMLDivElement;
  inspectButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  restartButton: HTMLButtonElement;
  captureButton: HTMLButtonElement;
}

interface CliSurfaceViewportElements {
  viewport: HTMLDivElement;
  selectionOverlay: HTMLDivElement;
  hoverOverlay: HTMLDivElement;
  hoverLabel: HTMLDivElement;
  hoverMeta: HTMLDivElement;
  hoverPreview: HTMLPreElement;
}

interface CliSurfaceComposerElements {
  composer: HTMLDivElement;
  composerHandle: HTMLDivElement;
  composerHint: HTMLDivElement;
  composerPreview: HTMLPreElement;
  composerScope: HTMLDivElement;
  composerContextTrace: HTMLDivElement;
  composerContextSelect: HTMLSelectElement;
  composerError: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenu: HTMLDivElement;
  targetMenuList: HTMLDivElement;
}

function createCliSurfaceToolbarElements(): CliSurfaceToolbarElements {
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

  return {
    toolbar,
    meta,
    route,
    adapterMeta,
    inspectButton,
    startButton,
    stopButton,
    restartButton,
    captureButton,
  };
}

function createCliSurfaceViewportElements(): CliSurfaceViewportElements {
  const viewport = document.createElement('div');
  viewport.className = 'cli-surface-viewport';

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

  return {
    viewport,
    selectionOverlay,
    hoverOverlay,
    hoverLabel,
    hoverMeta,
    hoverPreview,
  };
}

function createCliSurfaceComposerElements(): CliSurfaceComposerElements {
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
  const contextOptions: Array<[string, string]> = [
    ['auto', 'Auto'],
    ['selection-only', 'Selection only'],
    ['selection-nearby', 'Selection + nearby'],
    ['selection-nearby-viewport', 'Selection + viewport'],
  ];
  contextOptions.forEach(([value, label]) => {
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

  return {
    composer,
    composerHandle,
    composerHint,
    composerPreview,
    composerScope,
    composerContextTrace,
    composerContextSelect,
    composerError,
    selectedButton,
    newButton,
    customButton,
    targetMenu,
    targetMenuList,
  };
}

export function createCliSurfaceLayout(projectId: string): CliSurfaceLayoutElements {
  const element = document.createElement('div');
  element.className = 'cli-surface-pane hidden';
  element.dataset.projectId = projectId;

  const toolbarElements = createCliSurfaceToolbarElements();
  const viewportElements = createCliSurfaceViewportElements();
  const composerElements = createCliSurfaceComposerElements();

  const empty = document.createElement('div');
  empty.className = 'cli-surface-empty';
  empty.textContent = 'Run a CLI or TUI profile to preview it here.';

  element.appendChild(toolbarElements.toolbar);
  element.appendChild(viewportElements.viewport);
  element.appendChild(empty);
  element.appendChild(composerElements.targetMenu);
  element.appendChild(composerElements.composer);

  return {
    element,
    viewport: viewportElements.viewport,
    selectionOverlay: viewportElements.selectionOverlay,
    hoverOverlay: viewportElements.hoverOverlay,
    hoverLabel: viewportElements.hoverLabel,
    hoverMeta: viewportElements.hoverMeta,
    hoverPreview: viewportElements.hoverPreview,
    empty,
    meta: toolbarElements.meta,
    route: toolbarElements.route,
    adapterMeta: toolbarElements.adapterMeta,
    inspectButton: toolbarElements.inspectButton,
    composer: composerElements.composer,
    composerHandle: composerElements.composerHandle,
    composerHint: composerElements.composerHint,
    composerPreview: composerElements.composerPreview,
    composerScope: composerElements.composerScope,
    composerContextTrace: composerElements.composerContextTrace,
    composerContextSelect: composerElements.composerContextSelect,
    composerError: composerElements.composerError,
    selectedButton: composerElements.selectedButton,
    newButton: composerElements.newButton,
    customButton: composerElements.customButton,
    targetMenu: composerElements.targetMenu,
    targetMenuList: composerElements.targetMenuList,
    startButton: toolbarElements.startButton,
    stopButton: toolbarElements.stopButton,
    restartButton: toolbarElements.restartButton,
    captureButton: toolbarElements.captureButton,
  };
}

function clearTerminalDomSelection(terminal: Terminal): void {
  try {
    terminal.clearSelection();
  } catch {
    /* xterm may not support selection */
  }
  window.getSelection?.()?.removeAllRanges?.();
}

function suppressPointerEvent(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  (event as MouseEvent & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
}

function openCliLink(
  projectId: string,
  url: string,
  source: 'osc-link' | 'web-link',
  deps: CliSurfaceTerminalDeps,
): void {
  openCliSurfaceWebLink(
    projectId,
    url,
    source,
    deps.resolveProjectPath(projectId),
    (nextUrl, cwd) => deps.openExternal(nextUrl, cwd),
  );
}

export function createCliSurfaceTerminal(
  projectId: string,
  viewport: HTMLDivElement,
  hoverOverlay: HTMLDivElement,
  selectionOverlay: HTMLDivElement,
  deps: CliSurfaceTerminalDeps,
): CliSurfaceTerminalElements {
  const terminal = new Terminal({
    allowProposedApi: true,
    fontSize: 14,
    cursorBlink: true,
    linkHandler: {
      activate: (event, uri) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        clearTerminalDomSelection(terminal);
        openCliLink(projectId, uri, 'osc-link', deps);
      },
    },
  });
  const fitAddon = new FitAddon();
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(serializeAddon);
  terminal.loadAddon(
    new WebLinksAddon((event, url) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      clearTerminalDomSelection(terminal);
      openCliLink(projectId, url, 'web-link', deps);
    }),
  );

  let suppressLinkDragSelection = false;
  viewport.addEventListener(
    'mousedown',
    (event: MouseEvent) => {
      if (event.button !== 0) return;
      suppressLinkDragSelection = false;
      const candidate =
        findInlineUrlAtPointer(terminal, viewport, event) ?? extractUrlFromEventTarget(event);
      if (!candidate) return;
      suppressLinkDragSelection = true;
      suppressPointerEvent(event);
      clearTerminalDomSelection(terminal);
    },
    { capture: true },
  );
  viewport.addEventListener(
    'mousemove',
    (event: MouseEvent) => {
      if (!suppressLinkDragSelection) return;
      if ((event.buttons & 1) !== 1) {
        suppressLinkDragSelection = false;
        return;
      }
      suppressPointerEvent(event);
      clearTerminalDomSelection(terminal);
    },
    { capture: true },
  );
  viewport.addEventListener(
    'mouseup',
    () => {
      suppressLinkDragSelection = false;
    },
    { capture: true },
  );
  viewport.addEventListener(
    'mouseleave',
    () => {
      suppressLinkDragSelection = false;
    },
    { capture: true },
  );
  viewport.addEventListener(
    'click',
    (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const candidate =
        findInlineUrlAtPointer(terminal, viewport, event) ?? extractUrlFromEventTarget(event);
      if (!candidate) return;
      suppressPointerEvent(event);
      clearTerminalDomSelection(terminal);
      openCliLink(projectId, candidate, 'web-link', deps);
    },
    { capture: true },
  );

  terminal.open(viewport);
  viewport.appendChild(hoverOverlay);
  viewport.appendChild(selectionOverlay);
  return { terminal, fitAddon, serializeAddon };
}
