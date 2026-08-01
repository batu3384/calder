import { t } from '../../i18n.js';
import { appState } from '../../state.js';
import { startGameLoop } from './game-loop.js';
import { createOfficeEditorChrome, type OfficeEditorChrome } from './office-editor-chrome.js';
import { OfficeRuntime } from './office-state.js';
import { renderOffice } from './renderer.js';
import { ensureCharacterSheetsLoaded } from './sprites.js';
import { TILE_SIZE } from './types.js';

const OPEN_STORAGE_KEY = 'calder.pixelOffice.open';
const HEIGHT_STORAGE_KEY = 'calder.pixelOffice.railHeight';
const HEIGHT_DEFAULT = 200;
const HEIGHT_MIN = 140;
const HEIGHT_MAX = 480;
const EVIDENCE_WINDOW = 120;

function inspectorEl(): HTMLElement | null {
  return document.getElementById('context-inspector');
}
function officeEl(): HTMLElement | null {
  return document.getElementById('pixel-office');
}
function hostEl(): HTMLElement | null {
  return document.getElementById('pixel-office-canvas-host');
}
function soundBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-sound');
}
function editBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-edit');
}
function collapseBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-collapse');
}
function toolbarEl(): HTMLElement | null {
  return document.getElementById('pixel-office-editor-toolbar');
}
function resizeHandleEl(): HTMLElement | null {
  return document.getElementById('pixel-office-rail-resize');
}

let officeOpen = false;
let officeCollapsed = false;
let pixelModeEnabled = true;
let canvas: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let stopLoop: (() => void) | null = null;
let runtime: OfficeRuntime | null = null;
let editorChrome: OfficeEditorChrome | null = null;
let zoom = 2;
let hoveredId: string | null = null;
let painting = false;
let unsubs: Array<() => void> = [];

function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function writeStoredOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // ignore
  }
}

function readStoredHeight(): number {
  try {
    const raw = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    if (Number.isFinite(raw)) return Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, raw));
  } catch {
    // ignore
  }
  return HEIGHT_DEFAULT;
}

function writeStoredHeight(height: number): void {
  try {
    localStorage.setItem(HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // ignore
  }
}

function applyRailHeight(height: number): void {
  const next = Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, height));
  inspectorEl()?.style.setProperty('--pixel-office-rail-height', `${next}px`);
  writeStoredHeight(next);
}

function syncSoundButton(): void {
  const on = appState.preferences.soundOnSessionWaiting;
  const btn = soundBtn();
  btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn?.setAttribute('title', on ? t('Mute office sound') : t('Unmute office sound'));
  btn?.setAttribute('aria-label', on ? t('Mute office sound') : t('Unmute office sound'));
}

function syncCollapseButton(): void {
  const btn = collapseBtn();
  const rail = officeEl();
  btn?.setAttribute('aria-expanded', officeCollapsed ? 'false' : 'true');
  btn?.setAttribute('title', officeCollapsed ? t('Expand office view') : t('Collapse office view'));
  btn?.setAttribute(
    'aria-label',
    officeCollapsed ? t('Expand office view') : t('Collapse office view'),
  );
  rail?.classList.toggle('is-collapsed', officeCollapsed);
}

function canvasToWorld(event: MouseEvent): { x: number; y: number } | null {
  if (!runtime || !canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const cssX = event.clientX - rect.left;
  const cssY = event.clientY - rect.top;
  const worldW = runtime.layout.cols * TILE_SIZE;
  const worldH = runtime.layout.rows * TILE_SIZE;
  const offsetX = Math.floor((rect.width - worldW * zoom) / 2);
  const offsetY = Math.floor((rect.height - worldH * zoom) / 2);
  return {
    x: (cssX - offsetX) / zoom,
    y: (cssY - offsetY) / zoom,
  };
}

function paintWorld(event: MouseEvent, recordUndo: boolean): void {
  if (!runtime || !editorChrome?.editor.enabled) return;
  const world = canvasToWorld(event);
  if (!world) return;
  const col = Math.floor(world.x / TILE_SIZE);
  const row = Math.floor(world.y / TILE_SIZE);
  const next = editorChrome.paintAt(runtime.layout, col, row, { recordUndo });
  if (next) runtime.replaceLayout(next);
}

function ensureCanvas(): HTMLCanvasElement | null {
  const host = hostEl();
  if (!host) return null;
  if (canvas && canvas.isConnected) return canvas;
  canvas = document.createElement('canvas');
  canvas.className = 'pixel-office-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', t('Pixel Office map'));
  host.replaceChildren(canvas);
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasMove);
  canvas.addEventListener('mousedown', onCanvasDown);
  canvas.addEventListener('mouseup', () => {
    painting = false;
  });
  canvas.addEventListener('mouseleave', () => {
    hoveredId = null;
    painting = false;
  });
  return canvas;
}

function syncCanvasSize(): void {
  const target = ensureCanvas();
  const host = hostEl();
  if (!target || !host) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = host.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  target.width = Math.floor(cssW * dpr);
  target.height = Math.floor(cssH * dpr);
  target.style.width = `${cssW}px`;
  target.style.height = `${cssH}px`;
  const worldW = (runtime?.layout.cols ?? 12) * TILE_SIZE;
  const worldH = (runtime?.layout.rows ?? 10) * TILE_SIZE;
  // True contain: never clip the map in the rail. No artificial zoom floor.
  const fit = Math.min(cssW / worldW, cssH / worldH);
  zoom = Math.max(0.5, Math.min(5, fit * 0.98));
}

function ensureInspectorOpen(): void {
  void import('../context-inspector.js').then(({ setContextInspectorOpen }) => {
    setContextInspectorOpen(true);
  });
}

function syncOpenDom(): void {
  const inspector = inspectorEl();
  const office = officeEl();
  const visible = officeOpen && pixelModeEnabled;
  inspector?.classList.toggle('pixel-office-rail-visible', visible);
  office?.toggleAttribute('hidden', !visible);
  office?.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (visible) {
    ensureInspectorOpen();
    startRuntime();
  } else {
    stopRuntime();
  }
}

function onCanvasDown(event: MouseEvent): void {
  if (!editorChrome?.editor.enabled) return;
  painting = true;
  paintWorld(event, true);
}

function onCanvasClick(event: MouseEvent): void {
  if (editorChrome?.editor.enabled) return;
  const world = canvasToWorld(event);
  if (!world || !runtime) return;
  const hit = runtime.hitTest(world.x, world.y);
  if (!hit) return;
  const project = appState.activeProject;
  if (!project) return;
  appState.setActiveSession(project.id, hit.sessionId);
}

function onCanvasMove(event: MouseEvent): void {
  if (painting && editorChrome?.editor.enabled) {
    paintWorld(event, false);
    return;
  }
  const world = canvasToWorld(event);
  if (!world || !runtime) {
    hoveredId = null;
    return;
  }
  hoveredId = runtime.hitTest(world.x, world.y)?.id ?? null;
}

async function loadEvidenceTails(): Promise<void> {
  if (!runtime || !window.calder?.evidence) return;
  const sessions = runtime.sessionCharacterIds();
  const runIds: string[] = [];
  await Promise.all(
    sessions.map(async (sessionId) => {
      try {
        const meta = await window.calder.evidence.getMeta(sessionId);
        if (!meta) {
          runtime?.applyEvidence(sessionId, []);
          return;
        }
        if (meta.runId) runIds.push(meta.runId);
        const total = meta.eventCount ?? 0;
        const offset = Math.max(0, total - EVIDENCE_WINDOW);
        const page = await window.calder.evidence.listEvents(sessionId, offset, EVIDENCE_WINDOW);
        runtime?.applyEvidence(sessionId, [...page.events]);
      } catch {
        runtime?.applyEvidence(sessionId, []);
      }
    }),
  );
  if (runIds.length > 0) window.calder.evidence.subscribe(runIds);
  else window.calder.evidence.unsubscribe();
}

function startRuntime(): void {
  if (stopLoop) return;
  runtime = runtime ?? new OfficeRuntime();
  runtime.syncSessionsFromAppState();
  syncCanvasSize();
  const target = ensureCanvas();
  if (!target) return;

  void ensureCharacterSheetsLoaded();
  void loadEvidenceTails();

  stopLoop = startGameLoop(target, {
    update: (dt) => runtime?.update(dt),
    render: (ctx) => {
      if (!runtime) return;
      renderOffice(ctx, runtime.layout, runtime.listCharacters(), {
        selectedSessionId: runtime.selectedSessionId(),
        hoveredId,
        zoom,
      });
    },
  });
}

function stopRuntime(): void {
  stopLoop?.();
  stopLoop = null;
  hoveredId = null;
  painting = false;
  window.calder?.evidence?.unsubscribe();
}

function bindAppListeners(): void {
  const refresh = (): void => {
    if (!officeOpen || !runtime) return;
    runtime.syncSessionsFromAppState();
    void loadEvidenceTails();
  };
  unsubs.push(
    appState.on('session-added', refresh),
    appState.on('session-removed', refresh),
    appState.on('session-changed', refresh),
    appState.on('project-changed', refresh),
    appState.on('state-loaded', refresh),
    appState.on('preferences-changed', () => {
      syncSoundButton();
    }),
  );

  if (window.calder?.evidence?.onEvent) {
    const off = window.calder.evidence.onEvent((_runId, incoming) => {
      if (!runtime || incoming.length === 0) return;
      const sessionId = incoming[0]?.calderSessionId;
      if (!sessionId || !runtime.characters.has(sessionId)) return;
      void (async () => {
        try {
          const meta = await window.calder.evidence.getMeta(sessionId);
          if (!meta) return;
          const total = meta.eventCount ?? 0;
          const offset = Math.max(0, total - EVIDENCE_WINDOW);
          const page = await window.calder.evidence.listEvents(sessionId, offset, EVIDENCE_WINDOW);
          runtime?.applyEvidence(sessionId, [...page.events]);
        } catch {
          // ignore transient IPC errors
        }
      })();
    });
    unsubs.push(off);
  }
}

async function syncPixelModeFromSettings(): Promise<void> {
  if (!window.calder?.evidence?.getSettings) {
    pixelModeEnabled = true;
    syncOpenDom();
    return;
  }
  try {
    const settings = await window.calder.evidence.getSettings();
    pixelModeEnabled = settings.pixelMode === 'office';
    if (!pixelModeEnabled) officeOpen = false;
    syncOpenDom();
  } catch {
    pixelModeEnabled = true;
    syncOpenDom();
  }
}

function bindRailResize(): void {
  const handle = resizeHandleEl();
  if (!handle) return;
  let dragging = false;
  let startY = 0;
  let startHeight = HEIGHT_DEFAULT;

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    applyRailHeight(startHeight + (event.clientY - startY));
    syncCanvasSize();
  };
  const onUp = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try {
      handle.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };

  handle.addEventListener('pointerdown', (event) => {
    if (officeCollapsed || !officeOpen) return;
    event.preventDefault();
    dragging = true;
    startY = event.clientY;
    startHeight = readStoredHeight();
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

export function isPixelOfficeOpen(): boolean {
  return officeOpen && pixelModeEnabled;
}

export function setPixelOfficeOpen(next: boolean): void {
  officeOpen = next;
  writeStoredOpen(next);
  syncOpenDom();
}

export function togglePixelOffice(): void {
  if (!pixelModeEnabled) {
    openPixelOffice();
    return;
  }
  setPixelOfficeOpen(!officeOpen);
}

export function openPixelOffice(): void {
  officeCollapsed = false;
  syncCollapseButton();
  setPixelOfficeOpen(true);
}

export function initPixelOffice(): void {
  const office = officeEl();
  const host = hostEl();
  const inspector = inspectorEl();
  if (!office || !host || !inspector) return;

  applyRailHeight(readStoredHeight());
  bindRailResize();
  soundBtn()?.addEventListener('click', () => {
    appState.setPreference('soundOnSessionWaiting', !appState.preferences.soundOnSessionWaiting);
    syncSoundButton();
  });
  collapseBtn()?.addEventListener('click', () => {
    officeCollapsed = !officeCollapsed;
    syncCollapseButton();
    if (!officeCollapsed) syncCanvasSize();
  });
  syncSoundButton();
  syncCollapseButton();
  editorChrome = createOfficeEditorChrome({
    toolbarEl: toolbarEl(),
    editBtn: editBtn(),
    getLayout: () => runtime?.layout ?? null,
    onLayoutChange: (layout) => {
      runtime?.replaceLayout(layout);
      syncCanvasSize();
    },
  });
  bindAppListeners();
  resizeObserver = new ResizeObserver(() => {
    if (officeOpen && pixelModeEnabled && !officeCollapsed) syncCanvasSize();
  });
  resizeObserver.observe(host);
  officeOpen = readStoredOpen();
  void syncPixelModeFromSettings().then(() => {
    if (officeOpen && pixelModeEnabled) syncOpenDom();
  });
}
