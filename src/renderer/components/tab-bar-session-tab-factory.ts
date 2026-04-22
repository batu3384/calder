import { appState, type ProjectRecord, type SessionRecord } from '../state.js';
import type { ProjectSurfaceRecord } from '../../shared/types/project.js';
import { getStatus } from '../session-activity.js';
import { isUnread } from '../session-unread.js';
import { isSharing } from '../sharing/peer-host.js';
import { hasMultipleAvailableProviders } from '../provider-availability.js';
import { buildProviderIconMarkup } from './tab-provider-icon.js';
import { buildSessionTabTitle } from './tab-bar-session-titles.js';

interface CreateSessionTabOptions {
  project: ProjectRecord;
  session: SessionRecord;
  tabListEl: HTMLElement;
  cliSurfaceTabActive: boolean;
  mobileSurfaceTabActive: boolean;
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
  const { project, session, cliSurfaceTabActive, mobileSurfaceTabActive } = options;
  const tab = document.createElement('div');
  const isActive = !cliSurfaceTabActive && !mobileSurfaceTabActive && session.id === project.activeSessionId;
  const unread = !isActive && isUnread(session.id);
  const isMcp = session.type === 'mcp-inspector';
  const isDiff = session.type === 'diff-viewer';
  const isFileReader = session.type === 'file-reader';
  const isRemoteTab = session.type === 'remote-terminal';
  const isBrowserTab = session.type === 'browser-tab';
  const isSpecial = isMcp || isDiff || isFileReader || isRemoteTab || isBrowserTab;
  const sharing = isSharing(session.id);
  tab.className = 'tab-item'
    + (isActive ? ' active' : '')
    + (unread ? ' unread' : '')
    + (sharing ? ' tab-sharing' : '')
    + (isRemoteTab ? ' tab-remote' : '');
  tab.dataset.sessionId = session.id;
  tab.title = buildSessionTabTitle(session, getStatus(session.id));
  const providerId = session.providerId || 'claude';
  const providerIcon = buildProviderIconMarkup(providerId, hasMultipleAvailableProviders());
  const namePrefix = isDiff
    ? '<span class="tab-diff-badge">DIFF</span> '
    : isMcp
      ? '<span class="tab-mcp-badge">MCP</span> '
      : isFileReader
        ? '<span class="tab-file-badge">FILE</span> '
        : isRemoteTab
          ? '<span class="tab-remote-badge">P2P</span> '
          : isBrowserTab
            ? '<span class="tab-browser-badge">WEB</span> '
            : !isSpecial
              ? providerIcon
              : '';
  const shareIndicator = sharing
    ? '<span class="tab-share-indicator calder-status-pill" title="Sharing">Live</span>'
    : '';
  const statusDot = isSpecial ? '' : `<span class="tab-status ${getStatus(session.id)}"></span>`;
  const reorderHandle = project.sessions.length > 1
    ? '<span class="tab-reorder-handle" aria-hidden="true" title="Drag to reorder">&#8942;&#8942;</span>'
    : '';
  const nameContent = `
    <span class="tab-name-prefix">${namePrefix}</span>
    <span class="tab-name-label">${options.escapeHtml(session.name)}</span>
  `;
  tab.innerHTML = `
    ${reorderHandle}
    ${statusDot}
    <span class="tab-name">${nameContent}</span>
    ${shareIndicator}
    <span class="tab-close" title="Close session">&times;</span>
  `;

  tab.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('tab-close')) return;
    if (tab.querySelector('.tab-name input')) return;
    const shouldReturnSurfaceFocusToSession = session.id === project.activeSessionId
      && Boolean(project.surface?.active)
      && (
        (project.surface?.kind === 'cli' && project.surface.tabFocus === 'cli')
        || (project.surface?.kind === 'mobile' && project.surface.tabFocus === 'mobile')
      );
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

  const reorderHandleEl = tab.querySelector('.tab-reorder-handle') as HTMLElement | null;
  if (reorderHandleEl) {
    reorderHandleEl.draggable = true;

    reorderHandleEl.addEventListener('dragstart', (event) => {
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

    reorderHandleEl.addEventListener('dragend', () => {
      tab.classList.remove('dragging');
      options.tabListEl.querySelectorAll('.drag-over-left, .drag-over-right').forEach((entry) => {
        entry.classList.remove('drag-over-left', 'drag-over-right');
      });
    });
  }

  return tab;
}
