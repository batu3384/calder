import { appState, type ProjectRecord, type SessionRecord } from '../../state.js';
import type { ProviderId } from '../../../shared/types/provider.js';
import { showShareDialog } from '../share-dialog/share-dialog.js';
import { isSharing } from '../../sharing/peer-host.js';
import { endShare } from '../../sharing/share-manager.js';
import {
  closeInspector,
  getInspectedSessionId,
  isInspectorOpen,
  openInspector,
} from '../session-inspector/session-inspector.js';
import { getProviderCapabilities } from '../../provider-availability.js';
import { buildResumeWithProviderItems } from '../resume-with-provider-menu.js';

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

function appendDebugMenuItems(menu: HTMLElement, session: SessionRecord, hideTabContextMenu: () => void): void {
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

interface SessionContextMenuSections {
  isCliSession: boolean;
  isRemote: boolean;
  canInspect: boolean;
  currentlySharing: boolean;
  inspectItem: HTMLElement;
  shareSeparator: HTMLElement;
  shareItem: HTMLElement;
  mobileShareItem: HTMLElement;
  stopShareItem: HTMLElement;
}

function buildSessionContextMenuSections(
  session: SessionRecord,
  hideTabContextMenu: () => void,
): SessionContextMenuSections {
  const isCliSession = !session.type || session.type === 'claude';
  const isRemote = session.type === 'remote-terminal';
  const providerCapabilities = getProviderCapabilities(session.providerId || 'claude');
  const canInspect = isCliSession && providerCapabilities?.hookStatus !== false;
  const currentlySharing = isSharing(session.id);

  const inspectItem = createContextMenuItem(
    isInspectorOpen() && getInspectedSessionId() === session.id ? 'Close Inspector' : 'Inspect',
    hideTabContextMenu,
    {
      disabled: !canInspect,
      onSelect: () => {
        if (isInspectorOpen() && getInspectedSessionId() === session.id) {
          closeInspector();
        } else {
          openInspector(session.id);
        }
      },
    },
  );

  const shareSeparator = createMenuSeparator();

  const shareItem = createContextMenuItem('', hideTabContextMenu, {
    disabled: !isCliSession,
    onSelect: () => showShareDialog(session.id),
  });
  shareItem.textContent = currentlySharing ? 'Manage Sharing…' : 'Share Session…';

  const mobileShareItem = createContextMenuItem('', hideTabContextMenu, {
    disabled: !isCliSession,
    onSelect: () => showShareDialog(session.id),
  });
  mobileShareItem.textContent = 'Mobile Control…';

  const stopShareItem = createContextMenuItem('Stop Sharing', hideTabContextMenu, {
    disabled: !currentlySharing,
    onSelect: () => endShare(session.id),
  });

  return {
    isCliSession,
    isRemote,
    canInspect,
    currentlySharing,
    inspectItem,
    shareSeparator,
    shareItem,
    mobileShareItem,
    stopShareItem,
  };
}

function appendShareAndInspectMenuSections(
  menu: HTMLElement,
  sections: SessionContextMenuSections,
): void {
  menu.appendChild(createMenuSeparator());
  if (sections.isCliSession || sections.isRemote) {
    menu.appendChild(sections.shareSeparator);
    if (!sections.currentlySharing) {
      menu.appendChild(sections.shareItem);
      menu.appendChild(sections.mobileShareItem);
    }
    if (sections.currentlySharing) {
      menu.appendChild(sections.stopShareItem);
    }
  }
  if (sections.canInspect) {
    menu.appendChild(createMenuSeparator());
    menu.appendChild(sections.inspectItem);
  }
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
  const sections = buildSessionContextMenuSections(session, hideTabContextMenu);

  menu.appendChild(renameItem);
  menu.appendChild(moveLeftItem);
  menu.appendChild(moveRightItem);

  appendDebugMenuItems(menu, session, hideTabContextMenu);
  appendShareAndInspectMenuSections(menu, sections);
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
