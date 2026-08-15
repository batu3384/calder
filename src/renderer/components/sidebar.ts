import { appState } from '../state.js';
import { showPreferencesModal } from './preferences/preferences-modal.js';
import {
  hideSidebarProjectContextMenu,
  promptNewProject,
  renderSidebarProjectList,
} from './sidebar-project-list.js';
import { onChange as onSessionStatusChange } from './surface-services/session-activity.js';
import { onChange as onUnreadChange } from './surface-services/session-unread.js';
import { enableTooltip } from './tooltip.js';

const projectListEl = document.getElementById('project-list')!;
const btnAddProject = document.getElementById('btn-add-project')!;
const btnPreferences = document.getElementById('btn-preferences')!;
const sidebarEl = document.getElementById('sidebar')!;
const resizeHandle = document.getElementById('sidebar-resize-handle')!;
const sidebarFooterEl = document.getElementById('sidebar-footer')!;
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar')!;

const SIDEBAR_DEFAULT = 264;
const SIDEBAR_MIN = 232;
const SIDEBAR_MAX = 380;
const LEGACY_SIDEBAR_DEFAULT = 214;

export { promptNewProject } from './sidebar-project-list.js';

export function toggleSidebar(): void {
  appState.toggleSidebar();
}

function applySidebarCollapsed(): void {
  const collapsed = appState.sidebarCollapsed;
  sidebarEl.classList.toggle('collapsed', collapsed);
  resizeHandle.style.display = collapsed ? 'none' : '';
}

let unsubscribers: Array<() => void> = [];
let renderRAF: number | null = null;
let tooltipCleanups: Array<() => void> = [];
let finishDragCleanup: () => void = () => {};

export function initSidebar(): void {
  btnAddProject.addEventListener('click', promptNewProject);
  btnPreferences.addEventListener('click', showPreferencesModal);
  btnToggleSidebar.addEventListener('click', toggleSidebar);
  initResizeHandle();

  tooltipCleanups.push(
    enableTooltip(btnAddProject, { content: 'New Project (Ctrl+Shift+P)', placement: 'bottom' }),
    enableTooltip(btnPreferences, { content: 'Preferences', placement: 'bottom' }),
    enableTooltip(btnToggleSidebar, { content: 'Toggle Sidebar (Cmd+B)', placement: 'bottom' }),
  );

  const onStateLoaded = () => {
    const preferredWidth = appState.sidebarWidth || SIDEBAR_DEFAULT;
    const normalizedWidth =
      preferredWidth === LEGACY_SIDEBAR_DEFAULT ? SIDEBAR_DEFAULT : preferredWidth;
    const clampedWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, normalizedWidth));
    sidebarEl.style.width = clampedWidth + 'px';
    applySidebarCollapsed();
    render();
  };

  unsubscribers.push(appState.on('state-loaded', onStateLoaded));
  unsubscribers.push(appState.on('sidebar-toggled', applySidebarCollapsed));
  unsubscribers.push(appState.on('project-added', render));
  unsubscribers.push(appState.on('project-removed', render));
  unsubscribers.push(appState.on('project-changed', render));
  unsubscribers.push(appState.on('session-added', render));
  unsubscribers.push(appState.on('session-removed', render));
  unsubscribers.push(appState.on('preferences-changed', applyCostFooterVisibility));
  unsubscribers.push(onUnreadChange(render));
  unsubscribers.push(onSessionStatusChange(() => render()));

  document.addEventListener('click', hideSidebarProjectContextMenu);
  document.addEventListener('keydown', onSidebarEscapeKey);
}

function onSidebarEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') hideSidebarProjectContextMenu();
}

export function destroySidebar(): void {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  if (renderRAF !== null) {
    cancelAnimationFrame(renderRAF);
    renderRAF = null;
  }
  tooltipCleanups.forEach((fn) => fn());
  tooltipCleanups = [];
  document.removeEventListener('click', hideSidebarProjectContextMenu);
  document.removeEventListener('keydown', onSidebarEscapeKey);
  finishDragCleanup();
}

function render(): void {
  if (renderRAF !== null) return;
  renderRAF = requestAnimationFrame(() => {
    renderRAF = null;
    renderSidebarProjectList(projectListEl);
  });
}

function initResizeHandle(): void {
  let dragging = false;

  const finishDrag = () => {
    if (!dragging) return;
    dragging = false;
    resizeHandle.classList.remove('active');
    document.body.classList.remove('sidebar-resizing');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    const width = parseInt(sidebarEl.style.width, 10);
    if (!Number.isNaN(width)) {
      appState.setSidebarWidth(width);
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    const width = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX));
    sidebarEl.style.width = `${width}px`;
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') finishDrag();
  };

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    resizeHandle.classList.add('active');
    document.body.classList.add('sidebar-resizing');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', finishDrag);
  window.addEventListener('blur', finishDrag);
  document.addEventListener('visibilitychange', onVisibilityChange);

  finishDragCleanup = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', finishDrag);
    window.removeEventListener('blur', finishDrag);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    finishDragCleanup = () => {};
  };
}

function applyCostFooterVisibility(): void {
  const visible = appState.preferences.sidebarViews?.costFooter ?? true;
  if (!visible) {
    sidebarFooterEl.classList.add('hidden');
    return;
  }
  sidebarFooterEl.innerHTML = '';
  sidebarFooterEl.classList.add('hidden');
}
