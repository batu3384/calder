import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { CliSurfaceRuntimeState, SurfaceSelectionRange } from '../../../shared/types.js';
import { appState } from '../../state.js';
import {
  closeInspect,
  createInitialInspectState,
  openInspect,
  setInspectPayload,
  type CliInspectState,
} from './inspect-mode.js';
import { createSelectionPayload } from './selection.js';
import { inferCliRegions } from './heuristics.js';
import {
  sendCliSelectionToCustomSession,
  sendCliSelectionToNewSession,
  sendCliSelectionToSelectedSession,
} from './session-integration.js';
import { detectCliAdapter } from './adapters/registry.js';
import { parseCalderOsc, type CalderProtocolMessage } from './protocol.js';
import { getCliSurfaceProfileLabel } from './profile.js';

interface CliSurfaceInstance {
  projectId: string;
  element: HTMLDivElement;
  viewport: HTMLDivElement;
  terminal: Terminal;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  emptyEl: HTMLDivElement;
  metaEl: HTMLDivElement;
  inspectButton: HTMLButtonElement;
  composerEl: HTMLDivElement;
  composerHintEl: HTMLDivElement;
  composerPreviewEl: HTMLPreElement;
  composerErrorEl: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  inspectState: CliInspectState;
  viewportLines: string[];
}

const instances = new Map<string, CliSurfaceInstance>();
const semanticNodes = new Map<string, Map<string, CalderProtocolMessage>>();
let runtimeBindingsAttached = false;

function buildToolbarButton(label: string, action: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'cli-surface-button';
  button.type = 'button';
  button.dataset.action = action;
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
}

function showElement(element: HTMLElement, visible: boolean): void {
  if (visible) {
    element.classList.remove('hidden');
  } else {
    element.classList.add('hidden');
  }
}

function clearComposerError(instance: CliSurfaceInstance): void {
  instance.composerErrorEl.textContent = '';
  instance.composerErrorEl.style.display = 'none';
}

function showComposerError(instance: CliSurfaceInstance, message: string): void {
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

function renderRuntimeMeta(instance: CliSurfaceInstance): void {
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const label = profile ? getCliSurfaceProfileLabel(profile) : (runtime?.command ?? 'No profile');
  const status = runtime?.status ?? 'idle';
  instance.metaEl.textContent = `${label} · ${status}`;

  if (status === 'running') {
    instance.emptyEl.textContent = 'Runtime is live. Select text or capture the viewport to send context.';
    showElement(instance.emptyEl, instance.viewportLines.length === 0);
    return;
  }

  if (status === 'starting') {
    instance.emptyEl.textContent = 'Starting CLI surface runtime…';
    showElement(instance.emptyEl, true);
    return;
  }

  if (status === 'error') {
    instance.emptyEl.textContent = runtime?.lastError || 'CLI surface failed to start. Edit the command or try another suggestion.';
    showElement(instance.emptyEl, true);
    return;
  }

  instance.emptyEl.textContent = 'Calder can run a detected CLI or TUI command here. If startup fails, edit the command or try another suggestion.';
  showElement(instance.emptyEl, true);
}

function renderInspectState(instance: CliSurfaceInstance): void {
  const hasPayload = Boolean(instance.inspectState.payload);
  showElement(instance.composerEl, instance.inspectState.active || hasPayload);
  showElement(instance.inspectButton, true);
  instance.inspectButton.setAttribute('aria-pressed', instance.inspectState.active ? 'true' : 'false');

  if (!instance.inspectState.active && !hasPayload) {
    instance.composerHintEl.textContent = 'Select text in the terminal or capture the visible viewport to build a prompt.';
    instance.composerPreviewEl.textContent = '';
    instance.selectedButton.disabled = true;
    instance.newButton.disabled = true;
    instance.customButton.disabled = true;
    clearComposerError(instance);
    return;
  }

  if (!instance.inspectState.payload) {
    instance.composerHintEl.textContent = 'Inspect mode is on. Drag over the terminal output or use Capture.';
    instance.composerPreviewEl.textContent = '';
    instance.selectedButton.disabled = true;
    instance.newButton.disabled = true;
    instance.customButton.disabled = true;
    return;
  }

  const { payload } = instance.inspectState;
  instance.composerHintEl.textContent = [
    `Mode: ${payload.selection.mode}`,
    payload.inferredLabel ? `Region: ${payload.inferredLabel}` : null,
    payload.command ? `Command: ${payload.command}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
  instance.composerPreviewEl.textContent = payload.selectedText || payload.viewportText;
  instance.selectedButton.disabled = false;
  instance.newButton.disabled = false;
  instance.customButton.disabled = false;
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
    return selectionFromViewport(instance);
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

function buildInspectPayload(instance: CliSurfaceInstance, selection: SurfaceSelectionRange) {
  const project = getProject(instance.projectId) ?? appState.activeProject;
  const runtime = getRuntimeState(instance.projectId);
  const profile = resolveSelectedProfile(instance.projectId);
  const inferred = inferCliRegions(instance.viewportLines);
  const selectionHint = inferred.find((candidate) =>
    candidate.selection.startRow <= selection.startRow
    && candidate.selection.endRow >= selection.endRow,
  );
  const adapter = detectCliAdapter({
    command: runtime?.command ?? profile?.command,
    args: runtime?.args ?? profile?.args,
    title: profile?.name ?? runtime?.command,
  });
  const semanticNode = [...(semanticNodes.get(instance.projectId)?.values() ?? [])].find((node) =>
    node.bounds
    && node.bounds.startRow <= selection.startRow
    && node.bounds.endRow >= selection.endRow,
  );
  const adapterMeta = adapter?.enrich({
    ...(selectionHint?.label ? { inferredLabel: selectionHint.label } : {}),
    ...(semanticNode
      ? {
          semanticNodeId: semanticNode.nodeId,
          semanticLabel: semanticNode.label,
          semanticMeta: semanticNode.meta,
        }
      : {}),
  });
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
    ansiSnapshot: instance.serializeAddon.serialize(),
    inferredLabel: selectionHint?.label,
    adapterMeta,
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

function closeInspectComposer(instance: CliSurfaceInstance): void {
  instance.inspectState = closeInspect(instance.inspectState);
  renderInspectState(instance);
  clearComposerError(instance);
}

function fitSurface(instance: CliSurfaceInstance): void {
  requestAnimationFrame(() => {
    instance.fitAddon.fit();
    getCliSurfaceApi()?.resize(instance.projectId, instance.terminal.cols, instance.terminal.rows);
    syncViewportLines(instance);
    renderRuntimeMeta(instance);
  });
}

function attachRuntimeBindings(): void {
  if (runtimeBindingsAttached) return;
  const api = getCliSurfaceApi();
  if (!api) return;

  runtimeBindingsAttached = true;

  api.onData((projectId, data) => {
    const semanticMessage = parseCalderOsc(data);
    if (semanticMessage) {
      const bucket = semanticNodes.get(projectId) ?? new Map<string, CalderProtocolMessage>();
      bucket.set(semanticMessage.nodeId, semanticMessage);
      semanticNodes.set(projectId, bucket);
      return;
    }

    const instance = instances.get(projectId);
    if (!instance) return;
    instance.terminal.write(data);
    requestAnimationFrame(() => {
      syncViewportLines(instance);
      renderRuntimeMeta(instance);
      if (instance.inspectState.active) {
        setInspectPayloadFromSelection(instance, selectionFromTerminal(instance));
      }
    });
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

function ensureInstance(projectId: string): CliSurfaceInstance {
  const existing = instances.get(projectId);
  if (existing) return existing;

  attachRuntimeBindings();

  const element = document.createElement('div');
  element.className = 'cli-surface-pane hidden';
  element.dataset.projectId = projectId;

  const toolbar = document.createElement('div');
  toolbar.className = 'cli-surface-toolbar';

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
  toolbar.appendChild(titleGroup);

  const actions = document.createElement('div');
  actions.className = 'cli-surface-actions';

  const startButton = buildToolbarButton('Start', 'start');
  const stopButton = buildToolbarButton('Stop', 'stop');
  const restartButton = buildToolbarButton('Restart', 'restart');
  const inspectButton = buildToolbarButton('Inspect', 'inspect');
  const captureButton = buildToolbarButton('Capture', 'capture');

  actions.appendChild(startButton);
  actions.appendChild(stopButton);
  actions.appendChild(restartButton);
  actions.appendChild(inspectButton);
  actions.appendChild(captureButton);
  toolbar.appendChild(actions);
  element.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.className = 'cli-surface-viewport';
  element.appendChild(viewport);

  const empty = document.createElement('div');
  empty.className = 'cli-surface-empty';
  empty.textContent = 'Run a CLI or TUI profile to preview it here.';
  element.appendChild(empty);

  const composer = document.createElement('div');
  composer.className = 'cli-surface-composer hidden';

  const composerHint = document.createElement('div');
  composerHint.className = 'cli-surface-composer-hint';
  composer.appendChild(composerHint);

  const composerPreview = document.createElement('pre');
  composerPreview.className = 'cli-surface-composer-preview';
  composer.appendChild(composerPreview);

  const composerActions = document.createElement('div');
  composerActions.className = 'cli-surface-composer-actions';

  const selectedButton = buildToolbarButton('Send to selected', 'send-selected');
  const newButton = buildToolbarButton('New session', 'send-new');
  const customButton = buildToolbarButton('Choose session', 'send-custom');
  selectedButton.disabled = true;
  newButton.disabled = true;
  customButton.disabled = true;
  composerActions.appendChild(selectedButton);
  composerActions.appendChild(newButton);
  composerActions.appendChild(customButton);
  composer.appendChild(composerActions);

  const composerError = document.createElement('div');
  composerError.className = 'cli-surface-composer-error';
  composerError.style.display = 'none';
  composer.appendChild(composerError);

  element.appendChild(composer);

  const terminal = new Terminal({
    allowProposedApi: true,
    fontSize: 14,
    cursorBlink: true,
  });
  const fitAddon = new FitAddon();
  const serializeAddon = new SerializeAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(serializeAddon);
  terminal.open(viewport);

  const instance: CliSurfaceInstance = {
    projectId,
    element,
    viewport,
    terminal,
    fitAddon,
    serializeAddon,
    emptyEl: empty,
    metaEl: meta,
    inspectButton,
    composerEl: composer,
    composerHintEl: composerHint,
    composerPreviewEl: composerPreview,
    composerErrorEl: composerError,
    selectedButton,
    newButton,
    customButton,
    inspectState: createInitialInspectState(),
    viewportLines: [],
  };

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
    setInspectPayloadFromSelection(instance, selectionFromTerminal(instance));
  });

  captureButton.addEventListener('click', () => {
    instance.inspectState = openInspect(instance.inspectState);
    clearComposerError(instance);
    renderInspectState(instance);
    setInspectPayloadFromSelection(instance, selectionFromViewport(instance));
  });

  selectedButton.addEventListener('click', async () => {
    if (!instance.inspectState.payload) return;
    const result = await sendCliSelectionToSelectedSession(instance.inspectState.payload);
    if (!result.ok) {
      showComposerError(instance, result.error ?? 'Failed to send prompt.');
      return;
    }
    closeInspectComposer(instance);
  });

  newButton.addEventListener('click', () => {
    if (!instance.inspectState.payload) return;
    clearComposerError(instance);
    sendCliSelectionToNewSession(instance.inspectState.payload, 'CLI inspect follow-up');
    closeInspectComposer(instance);
  });

  customButton.addEventListener('click', () => {
    if (!instance.inspectState.payload) return;
    sendCliSelectionToCustomSession(instance.inspectState.payload, () => {
      clearComposerError(instance);
      closeInspectComposer(instance);
    });
  });

  terminal.onSelectionChange(() => {
    if (!instance.inspectState.active) return;
    setInspectPayloadFromSelection(instance, selectionFromTerminal(instance));
  });

  terminal.onData((data) => {
    getCliSurfaceApi()?.write(projectId, data);
  });

  instances.set(projectId, instance);
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
