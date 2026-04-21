import type { ProviderId } from '../../../shared/types.js';
import { appState } from '../../state.js';
import { getProviderDisplayName } from '../../provider-availability.js';
import { getStatus } from '../../session-activity.js';
import { anchorFloatingSurface } from '../floating-surface.js';

interface CliTargetMenuElements {
  composerEl: HTMLDivElement;
  selectedButton: HTMLButtonElement;
  newButton: HTMLButtonElement;
  customButton: HTMLButtonElement;
  targetMenuEl: HTMLDivElement;
  targetMenuListEl: HTMLDivElement;
}

interface CliTargetMenuControllerOptions {
  projectId: string;
  elements: CliTargetMenuElements;
  hasPayload: () => boolean;
  onSendToNew: () => void;
  onSendToCustom: () => void;
}

export interface CliTargetMenuController {
  closeMenu: () => void;
  openMenu: () => void;
  syncControls: () => void;
}

function buildCliTargetButtonLabel(projectId: string): string {
  const selectedTarget = appState.resolveSurfaceTargetSession(projectId);
  const label = selectedTarget?.name ?? 'Select Session';
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

function getCliProviderLabel(providerId: string): string {
  const displayName = getProviderDisplayName(providerId as Parameters<typeof getProviderDisplayName>[0]);
  if (displayName !== providerId) return displayName;
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

function setProviderAccentTarget(element: HTMLElement, providerId?: ProviderId): void {
  if (providerId) {
    element.dataset.provider = providerId;
    return;
  }
  delete element.dataset.provider;
}

function formatCliSessionStatus(status: ReturnType<typeof getStatus>): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'waiting':
      return 'Waiting';
    case 'completed':
      return 'Completed';
    case 'input':
      return 'Needs input';
    default:
      return 'Idle';
  }
}

export function createCliTargetMenuController(options: CliTargetMenuControllerOptions): CliTargetMenuController {
  const {
    projectId,
    elements,
    hasPayload,
    onSendToNew,
    onSendToCustom,
  } = options;
  const {
    composerEl,
    selectedButton,
    newButton,
    customButton,
    targetMenuEl,
    targetMenuListEl,
  } = elements;
  let targetMenuCleanup: (() => void) | undefined;

  const closeMenu = (): void => {
    targetMenuCleanup?.();
    targetMenuCleanup = undefined;
    targetMenuEl.style.display = 'none';
  };

  const renderMenu = (): void => {
    const targetSessions = appState.listSurfaceTargetSessions(projectId);
    const selectedTarget = appState.resolveSurfaceTargetSession(projectId);
    const payloadReady = hasPayload();
    targetMenuListEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cli-surface-target-menu-header';
    header.textContent = 'Open Sessions';
    targetMenuListEl.appendChild(header);

    if (targetSessions.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'cli-surface-target-menu-empty';
      emptyState.textContent = 'Open a CLI session to route this terminal capture.';
      targetMenuListEl.appendChild(emptyState);
    } else {
      for (const session of targetSessions) {
        const providerId = session.providerId ?? 'claude';
        const button = document.createElement('button');
        button.className = 'cli-surface-target-menu-item';
        setProviderAccentTarget(button, providerId);
        if (selectedTarget?.id === session.id) {
          button.classList.add('active');
        }

        const label = document.createElement('span');
        label.className = 'cli-surface-target-session-name';
        label.textContent = session.name;

        const meta = document.createElement('span');
        meta.className = 'cli-surface-target-session-meta';
        const badges = document.createElement('span');
        badges.className = 'cli-surface-target-session-badges';
        const status = getStatus(session.id);

        const statusBadge = document.createElement('span');
        statusBadge.className = 'cli-surface-target-session-status';

        const statusDot = document.createElement('span');
        statusDot.className = `tab-status ${status}`;

        const statusLabel = document.createElement('span');
        statusLabel.textContent = formatCliSessionStatus(status);

        statusBadge.appendChild(statusDot);
        statusBadge.appendChild(statusLabel);
        badges.appendChild(statusBadge);

        if (appState.activeProject?.activeSessionId === session.id) {
          const activeBadge = document.createElement('span');
          activeBadge.className = 'cli-surface-target-session-badge cli-surface-target-session-badge-active';
          activeBadge.textContent = 'Active';
          badges.appendChild(activeBadge);
        }

        const providerBadge = document.createElement('span');
        providerBadge.className = 'cli-surface-target-session-badge';
        setProviderAccentTarget(providerBadge, providerId);
        providerBadge.textContent = getCliProviderLabel(providerId);
        badges.appendChild(providerBadge);
        meta.appendChild(badges);

        button.appendChild(label);
        button.appendChild(meta);
        button.addEventListener('click', () => {
          appState.setSurfaceTargetSession(projectId, session.id);
          controller.syncControls();
          controller.closeMenu();
        });
        targetMenuListEl.appendChild(button);
      }
    }

    const separator = document.createElement('div');
    separator.className = 'cli-surface-target-menu-separator';
    targetMenuListEl.appendChild(separator);

    const newSessionBtn = document.createElement('button');
    newSessionBtn.className = 'cli-surface-target-menu-item cli-surface-target-menu-action';
    newSessionBtn.textContent = 'Send to New Session';
    newSessionBtn.disabled = !payloadReady;
    newSessionBtn.title = payloadReady ? 'Open a new session with this captured terminal context' : 'Capture terminal output first to send it.';
    newSessionBtn.addEventListener('click', () => {
      controller.closeMenu();
      onSendToNew();
    });
    targetMenuListEl.appendChild(newSessionBtn);

    const customSessionBtn = document.createElement('button');
    customSessionBtn.className = 'cli-surface-target-menu-item cli-surface-target-menu-action';
    customSessionBtn.textContent = 'Send to Custom Session…';
    customSessionBtn.disabled = !payloadReady;
    customSessionBtn.title = payloadReady ? 'Choose a custom session for this captured terminal context' : 'Capture terminal output first to send it.';
    customSessionBtn.addEventListener('click', () => {
      controller.closeMenu();
      onSendToCustom();
    });
    targetMenuListEl.appendChild(customSessionBtn);
  };

  const openMenu = (): void => {
    if (targetMenuEl.style.display !== 'none') {
      closeMenu();
      return;
    }

    renderMenu();
    targetMenuEl.style.display = 'flex';
    targetMenuCleanup?.();
    try {
      targetMenuCleanup = anchorFloatingSurface(customButton, targetMenuEl, {
        placement: 'bottom-end',
        offsetPx: 6,
        maxWidthPx: 300,
        maxHeightPx: 360,
      });
    } catch {
      targetMenuCleanup = undefined;
    }
  };

  const syncControls = (): void => {
    const selectedTarget = appState.resolveSurfaceTargetSession(projectId);
    const selectedProviderId: ProviderId | undefined = selectedTarget
      ? selectedTarget.providerId ?? 'claude'
      : undefined;
    const payloadReady = hasPayload();
    const hasTarget = Boolean(selectedTarget);

    selectedButton.disabled = !payloadReady || !hasTarget;
    newButton.disabled = !payloadReady;
    customButton.disabled = false;
    setProviderAccentTarget(composerEl, selectedProviderId);
    setProviderAccentTarget(selectedButton, selectedProviderId);
    setProviderAccentTarget(newButton, selectedProviderId);
    setProviderAccentTarget(customButton, selectedProviderId);

    selectedButton.title = hasTarget
      ? `Send to ${selectedTarget?.name}`
      : 'Select an open session target first';

    customButton.textContent = `${buildCliTargetButtonLabel(projectId)} ▾`;
    customButton.title = hasTarget
      ? `Current target: ${getCliProviderLabel(selectedTarget?.providerId ?? 'claude')} / ${selectedTarget?.name}`
      : payloadReady
        ? 'Choose which open session receives this terminal capture'
        : 'Choose the default open session before capturing terminal output';

    if (targetMenuEl.style.display !== 'none') {
      renderMenu();
    }
  };

  const controller: CliTargetMenuController = {
    closeMenu,
    openMenu,
    syncControls,
  };

  return controller;
}
