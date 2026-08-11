import { t } from '../../i18n.js';
import { appState } from '../../state.js';
import { loadEvidenceTails } from './evidence-sync.js';
import { startGameLoop } from './game-loop.js';
import { syncLiveStatus, syncOfficeText } from './live-status.js';
import { createOfficeEditorChrome, type OfficeEditorChrome } from './office-editor-chrome.js';
import { OfficeRuntime } from './office-state.js';
import { readOfficeTheme } from './office-theme.js';
import { bindRailResize } from './rail-resize.js';
import { renderOffice } from './renderer.js';
import { ensureCharacterSheetsLoaded } from './sprites.js';
import { TILE_SIZE } from './types.js';

const OPEN_STORAGE_KEY = 'calder.pixelOffice.open';
const COLLAPSED_STORAGE_KEY = 'calder.pixelOffice.collapsed';
const HEIGHT_STORAGE_KEY = 'calder.pixelOffice.railHeight';
const HEIGHT_DEFAULT = 200;
const HEIGHT_MIN = 140;
const HEIGHT_MAX = 480;

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
let pixelModeEnabled = false;
let canvas: HTMLCanvasElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let stopLoop: (() => void) | null = null;
let runtime: OfficeRuntime | null = null;
let editorChrome: OfficeEditorChrome | null = null;
let zoom = 2;
let hoveredId: string | null = null;
let painting = false;
let unsubs: Array<() => void> = [];
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let evidenceLoadGeneration = 0;
let expectedRunBySession = new Map<string, string>();
let officeTheme = readOfficeTheme();

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
function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
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
  const inspector = inspectorEl();
  inspector?.style.setProperty('--pixel-office-rail-height', `${next}px`);
  resizeHandleEl()?.setAttribute('aria-valuenow', String(Math.round(next)));
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
  syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled });
  if (officeCollapsed) {
    stopGameLoop();
  } else if (officeOpen && pixelModeEnabled) {
    startRuntime();
  }
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
  syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled });
  if (visible) {
    ensureInspectorOpen();
    if (officeCollapsed) stopGameLoop();
    else startRuntime();
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

function beginEvidenceLoad(): void {
  const activeRuntime = runtime;
  if (!activeRuntime) return;
  const generation = ++evidenceLoadGeneration;
  void loadEvidenceTails({
    runtime: activeRuntime,
    isCurrent: () => runtime === activeRuntime && generation === evidenceLoadGeneration,
    onApplied: () => syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled }),
    onRunsResolved: (runIds) => {
      expectedRunBySession = new Map(runIds);
    },
  });
}

function startRuntime(): void {
  if (stopLoop) return;
  runtime = runtime ?? new OfficeRuntime();
  runtime.syncSessionsFromAppState();
  syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled });
  syncCanvasSize();
  const target = ensureCanvas();
  if (!target) return;

  void ensureCharacterSheetsLoaded();
  beginEvidenceLoad();

  stopLoop = startGameLoop(target, {
    update: (dt) => runtime?.update(dt),
    render: (ctx) => {
      if (!runtime) return;
      renderOffice(ctx, runtime.layout, runtime.listCharacters(), {
        selectedSessionId: runtime.selectedSessionId(),
        hoveredId,
        zoom,
        theme: officeTheme,
      });
    },
  });
}

function stopRuntime(): void {
  evidenceLoadGeneration += 1;
  stopGameLoop();
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  hoveredId = null;
  painting = false;
  expectedRunBySession.clear();
  window.calder?.evidence?.unsubscribe();
}

function bindInspectorLifecycle(): void {
  const inspector = inspectorEl();
  if (!inspector) return;
  const onVisibility = (event: Event): void => {
    const open = (event as CustomEvent<{ open?: boolean }>).detail?.open === true;
    if (!open) stopRuntime();
    else if (officeOpen && pixelModeEnabled && !officeCollapsed) startRuntime();
    syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled });
  };
  inspector.addEventListener('context-inspector-visibility', onVisibility);
  unsubs.push(() => inspector.removeEventListener('context-inspector-visibility', onVisibility));
}

function bindAppListeners(): void {
  const refresh = (): void => {
    if (!officeOpen || !runtime) return;
    runtime.syncSessionsFromAppState();
    if (refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (officeOpen && runtime) beginEvidenceLoad();
    }, 50);
  };
  unsubs.push(
    appState.on('session-added', refresh),
    appState.on('session-removed', refresh),
    appState.on('session-changed', refresh),
    appState.on('project-changed', refresh),
    appState.on('state-loaded', refresh),
    appState.on('preferences-changed', () => {
      officeTheme = readOfficeTheme();
      syncSoundButton();
    }),
  );

  if (window.calder?.evidence?.onEvent) {
    const off = window.calder.evidence.onEvent((runId, incoming) => {
      if (!runtime || !officeOpen || !pixelModeEnabled || incoming.length === 0) return;
      if (inspectorEl()?.classList.contains('context-inspector-closed')) return;
      runtime.syncSessionsFromAppState();
      const bySession = new Map<string, typeof incoming>();
      for (const event of incoming) {
        if (event.evidenceRunId !== runId) continue;
        const expectedRunId = expectedRunBySession.get(event.calderSessionId);
        if (expectedRunId !== runId) continue;
        const events = bySession.get(event.calderSessionId) ?? [];
        events.push(event);
        bySession.set(event.calderSessionId, events);
      }
      for (const [sessionId, events] of bySession) {
        runtime.applyEvidence(sessionId, events, runId);
      }
      syncLiveStatus({ runtime, officeOpen, officeCollapsed, pixelModeEnabled });
    });
    unsubs.push(off);
  }
}

function stopGameLoop(): void {
  stopLoop?.();
  stopLoop = null;
}

async function syncPixelModeFromSettings(): Promise<void> {
  if (!window.calder?.evidence?.getSettings) {
    pixelModeEnabled = true;
    syncOpenDom();
    return;
  }
  try {
    const settings = await window.calder.evidence.getSettings();
    setPixelOfficeMode(settings.pixelMode === 'office');
    syncOpenDom();
  } catch {
    pixelModeEnabled = true;
    syncOpenDom();
  }
}

export function isPixelOfficeOpen(): boolean {
  return officeOpen && pixelModeEnabled;
}

export function setPixelOfficeOpen(next: boolean): void {
  officeOpen = next;
  writeStoredOpen(next);
  syncOpenDom();
}

export function setPixelOfficeMode(enabled: boolean): void {
  pixelModeEnabled = enabled;
  if (!enabled) officeOpen = false;
  syncOpenDom();
}

export function togglePixelOffice(): void {
  if (!pixelModeEnabled) return;
  setPixelOfficeOpen(!officeOpen);
}

export function openPixelOffice(): void {
  syncCollapseButton();
  setPixelOfficeOpen(true);
}

export function initPixelOffice(): void {
  const office = officeEl();
  const host = hostEl();
  const inspector = inspectorEl();
  if (!office || !host || !inspector) return;

  applyRailHeight(readStoredHeight());
  const resizeHandle = resizeHandleEl();
  if (resizeHandle) {
    unsubs.push(
      bindRailResize({
        handle: resizeHandle,
        isEnabled: () => officeOpen && !officeCollapsed && pixelModeEnabled,
        readHeight: readStoredHeight,
        applyHeight: applyRailHeight,
        syncCanvasSize,
        minHeight: HEIGHT_MIN,
        maxHeight: HEIGHT_MAX,
      }),
    );
  }
  soundBtn()?.addEventListener('click', () => {
    appState.setPreference('soundOnSessionWaiting', !appState.preferences.soundOnSessionWaiting);
    syncSoundButton();
  });
  collapseBtn()?.addEventListener('click', () => {
    officeCollapsed = !officeCollapsed;
    writeStoredCollapsed(officeCollapsed);
    syncCollapseButton();
    if (!officeCollapsed) syncCanvasSize();
  });
  syncSoundButton();
  syncOfficeText();
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
  bindInspectorLifecycle();
  const themeObserver = new MutationObserver(() => {
    officeTheme = readOfficeTheme();
  });
  themeObserver.observe(document.documentElement, { attributes: true });
  if (document.body) themeObserver.observe(document.body, { attributes: true });
  resizeObserver = new ResizeObserver(() => {
    if (officeOpen && pixelModeEnabled && !officeCollapsed) syncCanvasSize();
  });
  resizeObserver.observe(host);
  officeOpen = readStoredOpen();
  officeCollapsed = readStoredCollapsed();
  syncCollapseButton();
  void syncPixelModeFromSettings().then(() => {
    if (officeOpen && pixelModeEnabled) syncOpenDom();
  });
}
