import { appState, ProjectRecord } from '../state.js';
import { closeModal,setModalError, showModal } from './modal.js';
import { showPreferencesModal } from './preferences/preferences-modal.js';
import { getStatus, onChange as onSessionStatusChange } from './surface-services/session-activity.js';
import { hasUnreadInProject, isUnread, onChange as onUnreadChange } from './surface-services/session-unread.js';
import { applyTabContextMenuSemantics } from './tab-bar/tab-bar-menu-semantics.js';
import { enableTooltip } from './tooltip.js';

const projectListEl = document.getElementById('project-list')!;
let activeProjectContextMenu: HTMLElement | null = null;
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

type ProjectSignalTone = 'attention' | 'unread' | 'live' | 'queue';

interface ProjectSignal {
  label: string;
  summary: string;
  tone: ProjectSignalTone;
}

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

  // Enable tooltips for sidebar buttons
  tooltipCleanups.push(enableTooltip(btnAddProject, { content: 'New Project (Ctrl+Shift+P)', placement: 'bottom' }));
  tooltipCleanups.push(enableTooltip(btnPreferences, { content: 'Preferences', placement: 'bottom' }));
  tooltipCleanups.push(enableTooltip(btnToggleSidebar, { content: 'Toggle Sidebar (Cmd+B)', placement: 'bottom' }));

  const onStateLoaded = () => {
    const preferredWidth = appState.sidebarWidth || SIDEBAR_DEFAULT;
    const normalizedWidth = preferredWidth === LEGACY_SIDEBAR_DEFAULT
      ? SIDEBAR_DEFAULT
      : preferredWidth;
    const clampedWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, normalizedWidth));
    sidebarEl.style.width = clampedWidth + 'px';
    applySidebarCollapsed();
    render();
  };

  const onSidebarToggled = () => applySidebarCollapsed();
  const onPreferencesChanged = () => applyCostFooterVisibility();

  unsubscribers.push(appState.on('state-loaded', onStateLoaded));
  unsubscribers.push(appState.on('sidebar-toggled', onSidebarToggled));
  unsubscribers.push(appState.on('project-added', render));
  unsubscribers.push(appState.on('project-removed', render));
  unsubscribers.push(appState.on('project-changed', render));
  unsubscribers.push(appState.on('session-added', render));
  unsubscribers.push(appState.on('session-removed', render));
  unsubscribers.push(appState.on('preferences-changed', onPreferencesChanged));

  const unsubUnread = onUnreadChange(render);
  unsubscribers.push(unsubUnread);

  const unsubStatus = onSessionStatusChange(() => render());
  unsubscribers.push(unsubStatus);

  document.addEventListener('click', hideProjectContextMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideProjectContextMenu(); });
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
  document.removeEventListener('click', hideProjectContextMenu);
  document.removeEventListener('keydown', (e) => { if (e.key === 'Escape') hideProjectContextMenu(); });
  finishDragCleanup();
}

function render(): void {
  if (renderRAF !== null) return;
  renderRAF = requestAnimationFrame(() => {
    renderRAF = null;
    doRender();
  });
}

function doRender(): void {
  hideProjectContextMenu();
  projectListEl.innerHTML = '';
  projectListEl.setAttribute('role', 'list');
  projectListEl.setAttribute('aria-label', 'Projects');

  for (const project of appState.projects) {
    const locationLabel = shortProjectPath(project.path);
    const sessionCount = project.sessions.length;
    const signal = buildProjectSignal(project);
    const unread = hasUnreadInProject(project.id);
    const titleParts = [
      project.name,
      `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`,
      signal?.summary,
    ].filter(Boolean);
    const shell = document.createElement('div');
    shell.className = 'project-item-shell';
    shell.setAttribute('role', 'listitem');

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'project-item sidebar-project-row' + (project.id === appState.activeProjectId ? ' active' : '');
    selectBtn.setAttribute('title', titleParts.join(' • '));
    selectBtn.setAttribute('aria-label', titleParts.join(' • '));
    if (project.id === appState.activeProjectId) {
      selectBtn.setAttribute('aria-current', 'page');
    }
    selectBtn.innerHTML = `
      <div class="project-collapsed-pill" aria-hidden="true">
        <span class="project-collapsed-initial">${esc(getProjectInitial(project.name))}</span>
        ${signal ? `<span class="project-collapsed-dot is-${signal.tone}"></span>` : ''}
      </div>
      <div class="project-item-main">
        <div class="project-item-row">
          <div class="project-name${unread ? ' unread' : ''}">${esc(project.name)}</div>
        </div>
        <div class="project-meta-row">
          <span class="project-session-meta">${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}</span>
          ${signal ? `<span class="project-session-count project-status-chip is-${signal.tone} control-chip" title="${esc(signal.summary)}">${esc(signal.label)}</span>` : ''}
        </div>
        <div class="project-path" title="${esc(project.path)}">${esc(locationLabel)}</div>
      </div>
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'project-delete';
    deleteBtn.title = `Remove ${project.name}`;
    deleteBtn.setAttribute('aria-label', `Remove project ${project.name}`);
    deleteBtn.textContent = '×';

    selectBtn.addEventListener('click', () => {
      if (project.id === appState.activeProjectId) {
        appState.toggleSidebar();
      } else {
        appState.setActiveProject(project.id);
      }
    });

    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      confirmRemoveProject(project);
    });

    shell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showProjectContextMenu(e.clientX, e.clientY, project);
    });

    shell.appendChild(selectBtn);
    shell.appendChild(deleteBtn);
    projectListEl.appendChild(shell);
  }
}

function buildProjectSignal(project: ProjectRecord): ProjectSignal | null {
  let inputCount = 0;
  let unreadCount = 0;
  let workingCount = 0;

  for (const session of project.sessions) {
    const status = getStatus(session.id);
    if (status === 'input') inputCount += 1;
    if (status === 'working') workingCount += 1;
    if (isUnread(session.id)) unreadCount += 1;
  }

  const runningTasks = project.projectBackgroundTasks?.runningCount ?? 0;
  const queuedTasks = project.projectBackgroundTasks?.queuedCount ?? 0;
  const liveCount = workingCount + runningTasks;

  if (inputCount > 0) {
    return {
      label: `Input ${inputCount}`,
      summary: `${inputCount} ${inputCount === 1 ? 'session needs input' : 'sessions need input'}`,
      tone: 'attention',
    };
  }

  if (unreadCount > 0) {
    return {
      label: `New ${unreadCount}`,
      summary: `${unreadCount} ${unreadCount === 1 ? 'session has new output' : 'sessions have new output'}`,
      tone: 'unread',
    };
  }

  if (liveCount > 0) {
    return {
      label: `Live ${liveCount}`,
      summary: `${liveCount} ${liveCount === 1 ? 'active run' : 'active runs'}`,
      tone: 'live',
    };
  }

  if (queuedTasks > 0) {
    return {
      label: `Queue ${queuedTasks}`,
      summary: `${queuedTasks} ${queuedTasks === 1 ? 'queued task' : 'queued tasks'}`,
      tone: 'queue',
    };
  }

  return null;
}

function getProjectInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function shortProjectPath(fullPath: string): string {
  const normalized = fullPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return `.../${parts.slice(-2).join('/')}`;
}

export function promptNewProject(): void {
  showModal('New Project', [
    { label: 'Name', id: 'project-name', placeholder: 'My Project' },
    {
      label: 'Path', id: 'project-path', placeholder: '/path/to/project',
      buttonLabel: 'Browse',
      onButtonClick: async (input) => {
        const dir = await window.calder.fs.browseDirectory();
        if (!dir) return;
        input.value = dir;
        autoFillName(dir);
      },
    },
  ], async (values) => {
    const name = values['project-name']?.trim();
    const rawPath = values['project-path']?.trim();
    if (!name || !rawPath) return;

    const projectPath = await window.calder.fs.expandPath(rawPath);
    const isDir = await window.calder.fs.isDirectory(projectPath);
    if (!isDir) {
      setModalError('project-path', 'Directory does not exist');
      return;
    }

    closeModal();
    appState.addProject(name, projectPath);
  });

  const nameInput = document.getElementById('modal-project-name') as HTMLInputElement | null;
  let nameManuallyEdited = false;
  nameInput?.addEventListener('input', () => { nameManuallyEdited = true; });

  const autoFillName = (path: string) => {
    if (nameInput && !nameManuallyEdited) {
      nameInput.value = path.split('/').pop() || '';
    }
  };

  // Attach path autocomplete to the rendered input
  const pathInput = document.getElementById('modal-project-path') as HTMLInputElement | null;
  if (pathInput) {
    const fieldRow = pathInput.parentElement!;
    fieldRow.style.position = 'relative';
    fieldRow.style.flexWrap = 'wrap';

    const dropdown = document.createElement('div');
    dropdown.className = 'path-autocomplete-dropdown calder-floating-list';
    fieldRow.appendChild(dropdown);

    let activeIndex = -1;

    const hideDropdown = () => {
      dropdown.innerHTML = '';
      dropdown.classList.remove('visible');
      activeIndex = -1;
    };

    const showSuggestions = (dirs: string[], dirPart: string) => {
      dropdown.innerHTML = '';
      activeIndex = -1;
      if (dirs.length === 0) { hideDropdown(); return; }
      for (const dir of dirs) {
        const item = document.createElement('div');
        item.className = 'path-autocomplete-item';
        item.textContent = dirPart + (dir.split('/').pop() ?? '');
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pathInput.value = item.textContent!;
          hideDropdown();
          autoFillName(pathInput.value);
        });
        dropdown.appendChild(item);
      }
      dropdown.classList.add('visible');
    };

    pathInput.addEventListener('input', async () => {
      const value = pathInput.value;
      autoFillName(value);
      const lastSlash = value.lastIndexOf('/');
      if (lastSlash === -1) { hideDropdown(); return; }

      const dirPart = value.substring(0, lastSlash + 1);
      const namePart = value.substring(lastSlash + 1).toLowerCase();

      const dirs = await window.calder.fs.listDirs(dirPart, namePart || undefined);
      showSuggestions(dirs, dirPart);
    });

    pathInput.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll<HTMLElement>('.path-autocomplete-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[activeIndex]?.classList.remove('active');
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        items[activeIndex].classList.add('active');
        items[activeIndex].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items[activeIndex]?.classList.remove('active');
        activeIndex = Math.max(activeIndex - 1, 0);
        items[activeIndex].classList.add('active');
        items[activeIndex].scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'Enter' || e.key === 'Tab') && activeIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        pathInput.value = items[activeIndex].textContent!;
        hideDropdown();
        autoFillName(pathInput.value);
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });

    pathInput.addEventListener('blur', () => {
      setTimeout(hideDropdown, 100);
      autoFillName(pathInput.value);
    });
  }
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
    sidebarEl.style.width = width + 'px';
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

  // Provide a cleanup function to remove drag listeners.
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
  } else {
    renderCostFooter();
  }
}

function renderCostFooter(): void {
  sidebarFooterEl.innerHTML = '';
  sidebarFooterEl.classList.add('hidden');
}

function confirmRemoveProject(project: ProjectRecord): void {
  const historyCount = project.sessionHistory?.length ?? 0;
  const message = historyCount > 0
    ? `Remove project "${project.name}"? This will delete all sessions and history (${historyCount} entries) from Calder. No files on disk will be affected.`
    : `Remove project "${project.name}"? No files on disk will be affected.`;
  if (!confirm(message)) return;
  appState.removeProject(project.id);
}

function showProjectContextMenu(x: number, y: number, project: ProjectRecord): void {
  hideProjectContextMenu();

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());

  const hasSessions = project.sessions.length > 0;

  const closeAllItem = document.createElement('div');
  closeAllItem.className = 'tab-context-menu-item' + (!hasSessions ? ' disabled' : '');
  closeAllItem.textContent = 'Close All Sessions';
  if (hasSessions) {
    closeAllItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideProjectContextMenu();
      appState.removeAllSessions(project.id);
    });
  }

  const separator = document.createElement('div');
  separator.className = 'tab-context-menu-separator';

  const removeItem = document.createElement('div');
  removeItem.className = 'tab-context-menu-item';
  removeItem.textContent = 'Remove Project';
  removeItem.addEventListener('click', (e) => {
    e.stopPropagation();
    hideProjectContextMenu();
    confirmRemoveProject(project);
  });

  menu.appendChild(closeAllItem);
  menu.appendChild(separator);
  menu.appendChild(removeItem);
  document.body.appendChild(menu);
  activeProjectContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  applyTabContextMenuSemantics(menu, 'Project actions', hideProjectContextMenu);
}

function hideProjectContextMenu(): void {
  if (activeProjectContextMenu) {
    activeProjectContextMenu.remove();
    activeProjectContextMenu = null;
  }
}

function esc(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}
