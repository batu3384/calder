import type { ProjectSurfaceRecord } from '../../../shared/types/project-surface.js';
import { t } from '../../i18n.js';
import { appState, type ProjectRecord, type SessionRecord } from '../../state.js';
import { hasMultipleAvailableProviders } from '../surface-services/provider-availability.js';
import { getStatus } from '../surface-services/session-activity.js';
import { isUnread } from '../surface-services/session-unread.js';
import { buildProviderIconMarkup } from '../tab-provider-icon.js';
import { buildSessionTabTitle } from './tab-bar-session-titles.js';

interface CreateSessionTabOptions {
  project: ProjectRecord;
  session: SessionRecord;
  tabListEl: HTMLElement;
  cliSurfaceTabActive: boolean;
  escapeHtml: (value: string) => string;
  startRename: (tab: HTMLElement, project: ProjectRecord, session: SessionRecord) => void;
  showTabContextMenu: (
    x: number,
    y: number,
    project: ProjectRecord,
    session: SessionRecord,
    tab: HTMLElement,
  ) => void;
  getProjectSurface: (project: ProjectRecord) => ProjectSurfaceRecord;
  updateProjectSurface: (project: ProjectRecord, next: ProjectSurfaceRecord) => void;
}

export function createSessionTab(options: CreateSessionTabOptions): HTMLElement {
  const { project, session, cliSurfaceTabActive } = options;
  const tab = document.createElement('div');
  const isActive = !cliSurfaceTabActive && session.id === project.activeSessionId;
  const unread = !isActive && isUnread(session.id);
  const isMcp = session.type === 'mcp-inspector';
  const isDiff = session.type === 'diff-viewer';
  const isFileReader = session.type === 'file-reader';
  const isBrowserTab = session.type === 'browser-tab';
  const isSpecial = isMcp || isDiff || isFileReader || isBrowserTab;
  tab.className = 'tab-item' + (isActive ? ' active' : '') + (unread ? ' unread' : '');
  tab.dataset.sessionId = session.id;
  tab.title = buildSessionTabTitle(session, getStatus(session.id));
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', String(isActive));
  tab.tabIndex = 0;
  const providerId = session.providerId || 'claude';
  const providerIcon = buildProviderIconMarkup(providerId, hasMultipleAvailableProviders());
  const namePrefix = isDiff
    ? '<span class="tab-diff-badge">DIFF</span> '
    : isMcp
      ? '<span class="tab-mcp-badge">MCP</span> '
      : isFileReader
        ? '<span class="tab-file-badge">FILE</span> '
        : isBrowserTab
          ? '<span class="tab-browser-badge">WEB</span> '
          : !isSpecial
            ? providerIcon
            : '';
  const status = isSpecial ? null : getStatus(session.id);
  const statusDot = status
    ? `<span class="tab-status ${status}"><span class="tab-status-label">${t(status)}</span></span>`
    : '';
  const nameContent = `
    <span class="tab-name-prefix">${namePrefix}</span>
    <span class="tab-name-label">${options.escapeHtml(session.name)}</span>
  `;
  tab.innerHTML = `
    ${statusDot}
    <span class="tab-name">${nameContent}</span>
    <button type="button" class="tab-close" aria-label="Close session ${options.escapeHtml(session.name)}" title="Close session">&times;</button>
  `;

  tab.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tab.click();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const tabs = [...options.tabListEl.querySelectorAll<HTMLElement>('.tab-item')];
      const index = tabs.indexOf(tab);
      const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;
      tabs[nextIndex]?.focus();
    }
  });

  tab.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('tab-close')) return;
    if (tab.querySelector('.tab-name input')) return;
    const shouldReturnSurfaceFocusToSession =
      session.id === project.activeSessionId &&
      Boolean(project.surface?.active) &&
      project.surface?.kind === 'cli' &&
      project.surface.tabFocus === 'cli';
    if (session.id !== project.activeSessionId || shouldReturnSurfaceFocusToSession) {
      appState.setActiveSession(project.id, session.id);
    }
  });

  tab.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
      appState.removeSession(project.id, session.id);
    }
  });

  tab.addEventListener('dblclick', () => options.startRename(tab, project, session));

  tab.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    options.showTabContextMenu(event.clientX, event.clientY, project, session, tab);
  });

  tab.querySelector('.tab-close')!.addEventListener('click', () => {
    appState.removeSession(project.id, session.id);
  });

  if (project.sessions.length > 1) {
    tab.draggable = true;
    tab.title = `${tab.title} · Drag to reorder`;

    tab.addEventListener('dragstart', (event) => {
      if ((event.target as HTMLElement).closest('button, input')) {
        event.preventDefault();
        return;
      }
      event.dataTransfer!.effectAllowed = 'move';
      event.dataTransfer!.setData('text/plain', session.id);
      tab.classList.add('dragging');
    });

    tab.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'move';
      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      tab.classList.remove('drag-over-left', 'drag-over-right');
      if (event.clientX < midX) {
        tab.classList.add('drag-over-left');
      } else {
        tab.classList.add('drag-over-right');
      }
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drag-over-left', 'drag-over-right');
    });

    tab.addEventListener('drop', (event) => {
      event.preventDefault();
      tab.classList.remove('drag-over-left', 'drag-over-right');
      const draggedId = event.dataTransfer!.getData('text/plain');
      if (!draggedId || draggedId === session.id) return;

      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (draggedId.startsWith('__surface:')) {
        const desiredPlacement = event.clientX < midX ? 'start' : 'end';
        const currentSurface = options.getProjectSurface(project);
        if ((currentSurface.tabPlacement ?? 'end') !== desiredPlacement) {
          options.updateProjectSurface(project, {
            ...currentSurface,
            tabPlacement: desiredPlacement,
          });
        }
        return;
      }
      let targetIndex = project.sessions.findIndex((candidate) => candidate.id === session.id);
      if (event.clientX >= midX) targetIndex++;

      const fromIndex = project.sessions.findIndex((candidate) => candidate.id === draggedId);
      if (fromIndex < targetIndex) targetIndex--;

      appState.reorderSession(project.id, draggedId, targetIndex);
    });

    tab.addEventListener('dragend', () => {
      tab.classList.remove('dragging');
      options.tabListEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach((entry) => {
        entry.classList.remove('drag-over-left', 'drag-over-right');
      });
    });
  }

  return tab;
}
