import { appState, ArchivedSession } from '../state.js';
import { loadProviderAvailability } from '../provider-availability.js';
import { buildResumeWithProviderItems } from './resume-with-provider-menu.js';
import type { ProviderId } from '../../shared/types.js';

let historyContextMenu: HTMLElement | null = null;
function hideHistoryContextMenu(): void {
  if (historyContextMenu) {
    historyContextMenu.remove();
    historyContextMenu = null;
  }
}

function showHistoryContextMenu(x: number, y: number, archived: ArchivedSession): void {
  hideHistoryContextMenu();
  const project = appState.activeProject;
  if (!project) return;

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  if (archived.cliSessionId) {
    const resumeItem = document.createElement('div');
    resumeItem.className = 'tab-context-menu-item';
    resumeItem.textContent = 'Resume';
    resumeItem.addEventListener('click', (e) => {
      e.stopPropagation();
      hideHistoryContextMenu();
      appState.resumeFromHistory(project.id, archived.id);
    });
    menu.appendChild(resumeItem);
  }

  const resumeWithItems = buildResumeWithProviderItems(
    (archived.providerId || 'claude') as ProviderId,
    (targetId) => {
      hideHistoryContextMenu();
      appState.resumeWithProvider(project.id, { archivedSessionId: archived.id }, targetId);
    },
  );
  for (const el of resumeWithItems) menu.appendChild(el);

  if (!menu.firstChild) return;
  document.body.appendChild(menu);
  historyContextMenu = menu;
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;
}

const MAX_VISIBLE = 50;
const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  copilot: 'GitHub Copilot',
  gemini: 'Gemini CLI',
  qwen: 'Qwen Code',
  blackbox: 'Blackbox CLI',
};

let container: HTMLElement;
let searchInput: HTMLInputElement;
let listEl: HTMLElement;
let collapsed = true;
let bookmarkFilterActive = false;

function applyHistoryVisibility(): void {
  if (!container) return;
  const featureEnabled = appState.preferences.sessionHistoryEnabled;
  const sidebarVisible = appState.preferences.sidebarViews?.sessionHistory ?? true;
  container.classList.toggle('hidden', !featureEnabled || !sidebarVisible);
}

export function initSessionHistory(): void {
  container = document.getElementById('session-history')!;
  render();

  appState.on('history-changed', onHistoryChanged);
  appState.on('project-changed', render);
  appState.on('state-loaded', render);
  appState.on('preferences-changed', () => applyHistoryVisibility());
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('click', hideHistoryContextMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHistoryContextMenu(); });
  }
}

function onHistoryChanged(): void {
  applyHistoryVisibility();

  const project = appState.activeProject;
  if (!collapsed && listEl && project) {
    const history = appState.getSessionHistory(project.id);
    // Update the count badge in the header
    const countEl = container.querySelector('.config-section-count');
    if (countEl) {
      countEl.textContent = String(history.length);
    } else if (history.length > 0) {
      const headerMeta = container.querySelector('.config-section-meta');
      if (headerMeta) {
        const span = document.createElement('span');
        span.className = 'config-section-count control-chip';
        span.textContent = String(history.length);
        headerMeta.appendChild(span);
      }
    }
    renderList(history);
    return;
  }

  render();
}

function render(): void {
  applyHistoryVisibility();

  const project = appState.activeProject;
  const history = project ? appState.getSessionHistory(project.id) : [];

  if (!project) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'config-section-header';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'config-section-heading config-section-toggle-button';
  button.setAttribute('aria-expanded', String(!collapsed));
  button.innerHTML = `
    <span class="config-section-toggle ${collapsed ? 'collapsed' : ''}">&#x25BC;</span>
    <span class="config-section-title">Activity</span>
  `;
  header.appendChild(button);

  const meta = document.createElement('div');
  meta.className = 'config-section-meta';
  if (history.length > 0) {
    const count = document.createElement('span');
    count.className = 'config-section-count control-chip';
    count.textContent = String(history.length);
    meta.appendChild(count);
  }
  header.appendChild(meta);

  button.addEventListener('click', () => {
    collapsed = !collapsed;
    render();
  });
  container.appendChild(header);

  if (collapsed) return;

  const body = document.createElement('div');
  body.className = 'history-body';

  if (history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'No session history yet';
    body.appendChild(empty);
    container.appendChild(body);
    return;
  }

  // Search
  searchInput = document.createElement('input');
  searchInput.className = 'history-search';
  searchInput.type = 'text';
  searchInput.placeholder = 'Filter history…';
  searchInput.ariaLabel = 'Filter session history';
  searchInput.addEventListener('input', () => renderList(history));
  body.appendChild(searchInput);

  // Bookmark filter
  const bookmarkFilter = document.createElement('button');
  const applyFilterState = () => {
    bookmarkFilter.className = `history-bookmark-filter${bookmarkFilterActive ? ' active' : ''}`;
    bookmarkFilter.textContent = bookmarkFilterActive ? '★ Bookmarked' : '☆ Bookmarked';
  };
  applyFilterState();
  bookmarkFilter.addEventListener('click', () => {
    bookmarkFilterActive = !bookmarkFilterActive;
    applyFilterState();
    renderList(history);
  });
  // Clear button
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'history-clear-btn';
  clearBtn.textContent = 'Clear History';
  clearBtn.ariaLabel = 'Clear session history';
  clearBtn.addEventListener('click', () => {
    if (!project) return;
    if (!confirm('Clear all session history for this project? This cannot be undone.')) return;
    appState.clearSessionHistory(project.id);
  });

  const actions = document.createElement('div');
  actions.className = 'history-actions';
  actions.appendChild(bookmarkFilter);
  actions.appendChild(clearBtn);
  body.appendChild(actions);

  // List
  listEl = document.createElement('div');
  listEl.className = 'history-list';
  body.appendChild(listEl);

  container.appendChild(body);
  renderList(history);
}

function renderList(history: ArchivedSession[]): void {
  const filter = searchInput?.value.toLowerCase() || '';
  const filtered = history
    .filter((a) => a.name.toLowerCase().includes(filter))
    .filter((a) => !bookmarkFilterActive || a.bookmarked)
    .reverse(); // newest first

  listEl.innerHTML = '';

  const visible = filtered.slice(0, MAX_VISIBLE);
  for (const archived of visible) {
    const item = document.createElement('div');
    item.className = 'history-item calder-list-row';

    if (archived.cliSessionId) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        const project = appState.activeProject;
        if (project) {
          appState.resumeFromHistory(project.id, archived.id);
        }
      });
    }
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadProviderAvailability().catch(() => {});
      showHistoryContextMenu(e.clientX, e.clientY, archived);
    });

    const info = document.createElement('div');
    info.className = 'history-item-info';

    const name = document.createElement('div');
    name.className = 'history-item-name';
    name.textContent = archived.name;
    name.title = archived.cliSessionId
      ? `${archived.name}\nSession ID: ${archived.cliSessionId}`
      : archived.name;
    info.appendChild(name);

    const details = document.createElement('div');
    details.className = 'history-item-details';
    const parts: string[] = [];
    parts.push(formatDate(archived.closedAt));
    if (archived.cost) {
      const costLabel = archived.cost.source === 'fallback'
        ? `Estimated $${archived.cost.totalCostUsd.toFixed(2)}`
        : `$${archived.cost.totalCostUsd.toFixed(2)}`;
      parts.push(costLabel);
    }
    parts.push(getProviderLabel(archived.providerId));
    details.textContent = parts.join(' · ');
    info.appendChild(details);

    item.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'history-item-actions';

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.type = 'button';
    bookmarkBtn.className = `history-bookmark-btn${archived.bookmarked ? ' bookmarked' : ''}`;
    bookmarkBtn.innerHTML = archived.bookmarked ? '&#9733;' : '&#9734;';
    bookmarkBtn.title = archived.bookmarked ? 'Remove bookmark' : 'Bookmark session';
    bookmarkBtn.ariaLabel = archived.bookmarked ? 'Remove bookmark' : 'Bookmark session';
    bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const project = appState.activeProject;
      if (project) {
        appState.toggleBookmark(project.id, archived.id);
      }
    });
    actions.appendChild(bookmarkBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'history-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove from history';
    removeBtn.ariaLabel = 'Remove from history';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const project = appState.activeProject;
      if (!confirm(`Remove "${archived.name}" from session history?`)) return;
      if (project) {
        appState.removeHistoryEntry(project.id, archived.id);
      }
    });
    actions.appendChild(removeBtn);

    item.appendChild(actions);

    listEl.appendChild(item);
  }

  if (filtered.length > MAX_VISIBLE) {
    const more = document.createElement('div');
    more.className = 'history-item-details';
    more.style.padding = '4px 12px';
    more.textContent = `${filtered.length - MAX_VISIBLE} more items…`;
    listEl.appendChild(more);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}
