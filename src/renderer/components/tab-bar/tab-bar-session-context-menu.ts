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

  const menu = document.createElement('div');
  menu.className = 'tab-context-menu calder-floating-list';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.addEventListener('click', (event) => event.stopPropagation());

  const renameItem = document.createElement('div');
  renameItem.className = 'tab-context-menu-item';
  renameItem.textContent = 'Rename';
  renameItem.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTabContextMenu();
    startRename(tab, project, session);
  });

  const closeItem = document.createElement('div');
  closeItem.className = 'tab-context-menu-item';
  closeItem.textContent = 'Close';
  closeItem.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTabContextMenu();
    appState.removeSession(project.id, session.id);
  });

  const sessionIdx = project.sessions.findIndex((candidate) => candidate.id === session.id);
  const totalSessions = project.sessions.length;

  const separator = document.createElement('div');
  separator.className = 'tab-context-menu-separator';

  const closeAllItem = document.createElement('div');
  closeAllItem.className = 'tab-context-menu-item';
  closeAllItem.textContent = 'Close All';
  closeAllItem.addEventListener('click', (event) => {
    event.stopPropagation();
    hideTabContextMenu();
    appState.removeAllSessions(project.id);
  });

  const closeOthersItem = document.createElement('div');
  closeOthersItem.className = 'tab-context-menu-item' + (totalSessions <= 1 ? ' disabled' : '');
  closeOthersItem.textContent = 'Close Others';
  if (totalSessions > 1) {
    closeOthersItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      appState.removeOtherSessions(project.id, session.id);
    });
  }

  const closeRightItem = document.createElement('div');
  closeRightItem.className = 'tab-context-menu-item' + (sessionIdx >= totalSessions - 1 ? ' disabled' : '');
  closeRightItem.textContent = 'Close to the Right';
  if (sessionIdx < totalSessions - 1) {
    closeRightItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      appState.removeSessionsFromRight(project.id, session.id);
    });
  }

  const closeLeftItem = document.createElement('div');
  closeLeftItem.className = 'tab-context-menu-item' + (sessionIdx <= 0 ? ' disabled' : '');
  closeLeftItem.textContent = 'Close to the Left';
  if (sessionIdx > 0) {
    closeLeftItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      appState.removeSessionsFromLeft(project.id, session.id);
    });
  }

  const moveLeftItem = document.createElement('div');
  moveLeftItem.className = 'tab-context-menu-item' + (sessionIdx <= 0 ? ' disabled' : '');
  moveLeftItem.textContent = 'Move Left';
  if (sessionIdx > 0) {
    moveLeftItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      appState.reorderSession(project.id, session.id, sessionIdx - 1);
    });
  }

  const moveRightItem = document.createElement('div');
  moveRightItem.className = 'tab-context-menu-item' + (sessionIdx >= totalSessions - 1 ? ' disabled' : '');
  moveRightItem.textContent = 'Move Right';
  if (sessionIdx < totalSessions - 1) {
    moveRightItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      appState.reorderSession(project.id, session.id, sessionIdx + 1);
    });
  }

  const isCliSession = !session.type || session.type === 'claude';
  const isRemote = session.type === 'remote-terminal';
  const providerCapabilities = getProviderCapabilities(session.providerId || 'claude');
  const canInspect = isCliSession && providerCapabilities?.hookStatus !== false;
  const currentlySharing = isSharing(session.id);

  const shareSeparator = document.createElement('div');
  shareSeparator.className = 'tab-context-menu-separator';

  const shareItem = document.createElement('div');
  shareItem.className = 'tab-context-menu-item' + (!isCliSession ? ' disabled' : '');
  shareItem.textContent = currentlySharing ? 'Manage Sharing…' : 'Share Session…';
  if (isCliSession) {
    shareItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      showShareDialog(session.id);
    });
  }

  const mobileShareItem = document.createElement('div');
  mobileShareItem.className = 'tab-context-menu-item' + (!isCliSession ? ' disabled' : '');
  mobileShareItem.textContent = 'Mobile Control…';
  if (isCliSession) {
    mobileShareItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      showShareDialog(session.id);
    });
  }

  const stopShareItem = document.createElement('div');
  stopShareItem.className = 'tab-context-menu-item' + (!currentlySharing ? ' disabled' : '');
  stopShareItem.textContent = 'Stop Sharing';
  if (currentlySharing) {
    stopShareItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      endShare(session.id);
    });
  }

  menu.appendChild(renameItem);
  menu.appendChild(moveLeftItem);
  menu.appendChild(moveRightItem);

  if (appState.preferences.debugMode) {
    const sessionSeparator = document.createElement('div');
    sessionSeparator.className = 'tab-context-menu-separator';

    const cliSessionId = session.cliSessionId;
    const hasCliSession = !!cliSessionId;

    const copySessionIdItem = document.createElement('div');
    copySessionIdItem.className = 'tab-context-menu-item' + (!hasCliSession ? ' disabled' : '');
    copySessionIdItem.textContent = 'Copy CLI Session ID';
    if (hasCliSession) {
      copySessionIdItem.addEventListener('click', (event) => {
        event.stopPropagation();
        hideTabContextMenu();
        navigator.clipboard.writeText(cliSessionId);
      });
    }

    const copyInternalIdItem = document.createElement('div');
    copyInternalIdItem.className = 'tab-context-menu-item';
    copyInternalIdItem.textContent = 'Copy Internal ID';
    copyInternalIdItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      navigator.clipboard.writeText(session.id);
    });

    menu.appendChild(sessionSeparator);
    menu.appendChild(copyInternalIdItem);
    menu.appendChild(copySessionIdItem);
  }

  const inspectItem = document.createElement('div');
  const isCurrentlyInspecting = isInspectorOpen() && getInspectedSessionId() === session.id;
  inspectItem.className = 'tab-context-menu-item' + (!canInspect ? ' disabled' : '');
  inspectItem.textContent = isCurrentlyInspecting ? 'Close Inspector' : 'Inspect';
  if (canInspect) {
    inspectItem.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTabContextMenu();
      if (isCurrentlyInspecting) {
        closeInspector();
      } else {
        openInspector(session.id);
      }
    });
  }

  const moveSeparator = document.createElement('div');
  moveSeparator.className = 'tab-context-menu-separator';
  menu.appendChild(moveSeparator);
  if (isCliSession || isRemote) {
    menu.appendChild(shareSeparator);
    if (!currentlySharing) {
      menu.appendChild(shareItem);
      menu.appendChild(mobileShareItem);
    }
    if (currentlySharing) {
      menu.appendChild(stopShareItem);
    }
  }
  if (canInspect) {
    const inspectSeparator = document.createElement('div');
    inspectSeparator.className = 'tab-context-menu-separator';
    menu.appendChild(inspectSeparator);
    menu.appendChild(inspectItem);
  }

  if (isCliSession) {
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

  menu.appendChild(closeItem);
  menu.appendChild(separator);
  menu.appendChild(closeAllItem);
  menu.appendChild(closeOthersItem);
  menu.appendChild(closeRightItem);
  menu.appendChild(closeLeftItem);
  document.body.appendChild(menu);
  setActiveContextMenu(menu);
  constrainMenuToViewport(menu);
  applyContextMenuSemantics(menu, 'Session actions');
}
