import { appState } from '../../state.js';
import { startGameLoop } from './game-loop.js';
import { createOfficeEditorChrome, type OfficeEditorChrome } from './office-editor-chrome.js';
import { OfficeRuntime } from './office-state.js';
import { renderOffice } from './renderer.js';
import { ensureCharacterSheetsLoaded } from './sprites.js';
import { TILE_SIZE } from './types.js';

const OPEN_STORAGE_KEY = 'calder.pixelOffice.open';
const WIDTH_STORAGE_KEY = 'calder.pixelOffice.width';
const WIDTH_DEFAULT = 480;
const WIDTH_MIN = 360;
const WIDTH_MAX = 720;
const EVIDENCE_WINDOW = 120;

function shellEl(): HTMLElement | null {
  return document.getElementById('workspace-shell');
}
function officeEl(): HTMLElement | null {
  return document.getElementById('pixel-office');
}
function hostEl(): HTMLElement | null {
  return document.getElementById('pixel-office-canvas-host');
}
function resizeHandleEl(): HTMLElement | null {
  return document.getElementById('pixel-office-resize-handle');
}
function closeBtn(): HTMLElement | null {
  return document.getElementById('btn-close-pixel-office');
}
function soundBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-sound');
}
function editBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-edit');
}
function toolbarEl(): HTMLElement | null {
  return document.getElementById('pixel-office-editor-toolbar');
}

let officeOpen = false;
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

function readStoredWidth(): number {
  try {
    const raw = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    if (Number.isFinite(raw)) return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, raw));
  } catch {
    // ignore
  }
  return WIDTH_DEFAULT;
}

function writeStoredWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // ignore
  }
}

function syncSoundButton(): void {
  const on = appState.preferences.soundOnSessionWaiting;
  const btn = soundBtn();
  btn?.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn?.setAttribute('title', on ? 'Mute office sound' : 'Unmute office sound');
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
  canvas.setAttribute('aria-label', 'Pixel Office map');
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
  const worldW = (runtime?.layout.cols ?? 18) * TILE_SIZE;
  const worldH = (runtime?.layout.rows ?? 14) * TILE_SIZE;
  zoom = Math.max(2, Math.min(4, Math.floor(Math.min(cssW / worldW, cssH / worldH))));
}

function applyWidth(width: number): void {
  const next = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, width));
  shellEl()?.style.setProperty('--pixel-office-width', `${next}px`);
  writeStoredWidth(next);
}

function syncOpenDom(): void {
  shellEl()?.classList.toggle('pixel-office-open', officeOpen);
  officeEl()?.toggleAttribute('hidden', !officeOpen);
  officeEl()?.setAttribute('aria-hidden', officeOpen ? 'false' : 'true');
  if (officeOpen) {
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

function bindResizeHandle(): void {
  const handle = resizeHandleEl();
  if (!handle) return;
  let dragging = false;
  let startX = 0;
  let startWidth = WIDTH_DEFAULT;

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return;
    applyWidth(startWidth + (startX - event.clientX));
  };
  const onUp = (): void => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    syncCanvasSize();
  };

  handle.addEventListener('pointerdown', (event) => {
    if (!officeOpen) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = readStoredWidth();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
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

export function isPixelOfficeOpen(): boolean {
  return officeOpen;
}

export function setPixelOfficeOpen(next: boolean): void {
  officeOpen = next;
  writeStoredOpen(next);
  syncOpenDom();
}

export function togglePixelOffice(): void {
  setPixelOfficeOpen(!officeOpen);
}

export function openPixelOffice(): void {
  setPixelOfficeOpen(true);
}

export function initPixelOffice(): void {
  const office = officeEl();
  const host = hostEl();
  const shell = shellEl();
  if (!office || !host || !shell) return;
  applyWidth(readStoredWidth());
  closeBtn()?.addEventListener('click', () => setPixelOfficeOpen(false));
  soundBtn()?.addEventListener('click', () => {
    appState.setPreference('soundOnSessionWaiting', !appState.preferences.soundOnSessionWaiting);
    syncSoundButton();
  });
  syncSoundButton();
  editorChrome = createOfficeEditorChrome({
    toolbarEl: toolbarEl(),
    editBtn: editBtn(),
    getLayout: () => runtime?.layout ?? null,
    onLayoutChange: (layout) => {
      runtime?.replaceLayout(layout);
      syncCanvasSize();
    },
  });
  bindResizeHandle();
  bindAppListeners();
  resizeObserver = new ResizeObserver(() => {
    if (officeOpen) syncCanvasSize();
  });
  resizeObserver.observe(host);
  setPixelOfficeOpen(readStoredOpen());
}
