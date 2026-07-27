import type { ProviderId } from '../../../shared/types/provider.js';
import { appState, type ProjectRecord, type SessionRecord } from '../../state.js';
import { buildResumeWithProviderItems } from '../resume-with-provider-menu.js';
import {
  closeInspector,
  getInspectedSessionId,
  isInspectorOpen,
  openInspector,
} from '../session-inspector/session-inspector.js';
import { getProviderCapabilities } from '../surface-services/provider-availability.js';

export interface SessionTabContextMenuOptions {
  x: number;
  y: number;
  project: ProjectRecord;
  session: SessionRecord;
  tab: HTMLElement;
  hideTabContextMenu: () => void;
  setActiveContextMenu: (menu: HTMLElement) => void;
  applyContextMenuSemantics: (menu: HTMLElement, label: string, focusFirstItem?: boolean) => void;
  startRename: (tab: HTMLElement, project: ProjectRecord, session: SessionRecord) => void;
}

function constrainMenuToViewport(menu: HTMLElement): void {
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  }
}

function createMenuSeparator(): HTMLDivElement {
  const separator = document.createElement('div');
  separator.className = 'tab-context-menu-separator';
  return separator;
}

interface ContextMenuItemOptions {
  disabled?: boolean;
  onSelect?: () => void;
}

function createContextMenuItem(
  label: string,
  hideTabContextMenu: () => void,
  options: ContextMenuItemOptions = {},
): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'tab-context-menu-item' + (options.disabled ? ' disabled' : '');
  item.textContent = label;
  if (!options.disabled && options.onSelect) {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      options.onSelect?.();
    });
  }
  return item;
}

function createContextMenuRoot(x: number, y: number): HTMLDivElement {
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());
  return menu;
}

function appendDebugMenuItems(
  menu: HTMLElement,
  session: SessionRecord,
  hideTabContextMenu: () => void,
): void {
  if (!appState.preferences.debugMode) {
    return;
  }
  const cliSessionId = session.cliSessionId;
  const hasCliSession = Boolean(cliSessionId);
  menu.appendChild(createMenuSeparator());
  menu.appendChild(
    createContextMenuItem('Copy Internal ID', hideTabContextMenu, {
      onSelect: () => navigator.clipboard.writeText(session.id),
    }),
  );
  menu.appendChild(
    createContextMenuItem('Copy CLI Session ID', hideTabContextMenu, {
      disabled: !hasCliSession,
      onSelect: () => navigator.clipboard.writeText(cliSessionId as string),
    }),
  );
}

function buildInspectMenuItem(
  session: SessionRecord,
  hideTabContextMenu: () => void,
): HTMLElement | null {
  const isCliSession = !session.type || session.type === 'claude';
  const providerCapabilities = getProviderCapabilities(session.providerId || 'claude');
  const canInspect = isCliSession && providerCapabilities?.hookStatus !== false;
  if (!canInspect) return null;

  return createContextMenuItem(
    isInspectorOpen() && getInspectedSessionId() === session.id ? 'Close Inspector' : 'Inspect',
    hideTabContextMenu,
    {
      onSelect: () => {
        if (isInspectorOpen() && getInspectedSessionId() === session.id) {
          closeInspector();
        } else {
          openInspector(session.id);
        }
      },
    },
  );
}

function appendResumeWithProviderMenuItems(
  menu: HTMLElement,
  session: SessionRecord,
  project: ProjectRecord,
  hideTabContextMenu: () => void,
): void {
  if (!session.type || session.type === 'claude') {
    const items = buildResumeWithProviderItems(
      (session.providerId || 'claude') as ProviderId,
      (targetId) => {
        hideTabContextMenu();
        appState.resumeWithProvider(project.id, { sessionId: session.id }, targetId);
      },
    );
    for (const element of items) {
      menu.appendChild(element);
    }
  }
}

export function showSessionTabContextMenu(options: SessionTabContextMenuOptions): void {
  const {
    x,
    y,
    project,
    session,
    tab,
    hideTabContextMenu,
    setActiveContextMenu,
    applyContextMenuSemantics,
    startRename,
  } = options;

  hideTabContextMenu();
  const menu = createContextMenuRoot(x, y);

  const sessionIdx = project.sessions.findIndex((candidate) => candidate.id === session.id);
  const totalSessions = project.sessions.length;

  const renameItem = createContextMenuItem('Rename', hideTabContextMenu, {
    onSelect: () => startRename(tab, project, session),
  });
  const closeItem = createContextMenuItem('Close', hideTabContextMenu, {
    onSelect: () => appState.removeSession(project.id, session.id),
  });
  const closeAllItem = createContextMenuItem('Close All', hideTabContextMenu, {
    onSelect: () => appState.removeAllSessions(project.id),
  });
  const closeOthersItem = createContextMenuItem('Close Others', hideTabContextMenu, {
    disabled: totalSessions <= 1,
    onSelect: () => appState.removeOtherSessions(project.id, session.id),
  });
  const closeRightItem = createContextMenuItem('Close to the Right', hideTabContextMenu, {
    disabled: sessionIdx >= totalSessions - 1,
    onSelect: () => appState.removeSessionsFromRight(project.id, session.id),
  });
  const closeLeftItem = createContextMenuItem('Close to the Left', hideTabContextMenu, {
    disabled: sessionIdx <= 0,
    onSelect: () => appState.removeSessionsFromLeft(project.id, session.id),
  });
  const moveLeftItem = createContextMenuItem('Move Left', hideTabContextMenu, {
    disabled: sessionIdx <= 0,
    onSelect: () => appState.reorderSession(project.id, session.id, sessionIdx - 1),
  });
  const moveRightItem = createContextMenuItem('Move Right', hideTabContextMenu, {
    disabled: sessionIdx >= totalSessions - 1,
    onSelect: () => appState.reorderSession(project.id, session.id, sessionIdx + 1),
  });
  const inspectItem = buildInspectMenuItem(session, hideTabContextMenu);

  menu.appendChild(renameItem);
  menu.appendChild(moveLeftItem);
  menu.appendChild(moveRightItem);

  appendDebugMenuItems(menu, session, hideTabContextMenu);
  if (inspectItem) {
    menu.appendChild(createMenuSeparator());
    menu.appendChild(inspectItem);
  }
  appendResumeWithProviderMenuItems(menu, session, project, hideTabContextMenu);

  menu.appendChild(closeItem);
  menu.appendChild(createMenuSeparator());
  menu.appendChild(closeAllItem);
  menu.appendChild(closeOthersItem);
  menu.appendChild(closeRightItem);
  menu.appendChild(closeLeftItem);
  document.body.appendChild(menu);
  setActiveContextMenu(menu);
  constrainMenuToViewport(menu);
  applyContextMenuSemantics(menu, 'Session actions');
}
