import { appState } from '../../state.js';
import { getProviderDisplayName } from '../../provider-availability.js';
import type { ProviderId } from '../../../shared/types.js';
import type { BrowserTabInstance } from './types.js';
import { sendDrawToCustomSession, sendDrawToNewSession } from './draw-mode.js';
import {
  sendFlowToCustomSession,
  sendFlowToNewSession,
  sendToCustomSession,
  sendToNewSession,
} from './session-integration.js';
import { anchorFloatingSurface } from '../floating-surface.js';
import { logDebugEvent } from '../debug-panel.js';

function browserTargetButtonLabel(instance: BrowserTabInstance): string {
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  const label = selectedTarget?.name ?? 'Select Session';
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

function setProviderAccentTarget(element: HTMLElement, providerId?: ProviderId): void {
  if (providerId) {
    element.dataset.provider = providerId;
    return;
  }
  delete element.dataset.provider;
}

export function closeBrowserTargetMenu(instance: BrowserTabInstance, reason = 'programmatic'): void {
  const wasOpen = instance.targetMenu.style.display !== 'none';
  instance.targetMenuFloatingCleanup?.();
  instance.targetMenuFloatingCleanup = null;
  instance.targetMenu.style.display = 'none';
  instance.activeTargetTrigger = null;
  instance.activeTargetMode = null;
  if (wasOpen) {
    logDebugEvent('browserMenu', instance.sessionId, {
      menu: 'session-target',
      state: 'close',
      reason,
    });
  }
}

function runTargetMenuAction(instance: BrowserTabInstance, action: 'new' | 'custom'): void {
  const mode = instance.activeTargetMode;
  closeBrowserTargetMenu(instance, `menu-action:${action}`);
  if (!mode) return;

  if (mode === 'inspect') {
    if (action === 'new') sendToNewSession(instance);
    else sendToCustomSession(instance);
    return;
  }

  if (mode === 'draw') {
    if (action === 'new') {
      void sendDrawToNewSession(instance);
    } else {
      void sendDrawToCustomSession(instance);
    }
    return;
  }

  if (action === 'new') {
    sendFlowToNewSession(instance);
  } else {
    sendFlowToCustomSession(instance);
  }
}

function renderBrowserTargetMenu(instance: BrowserTabInstance): void {
  const targetSessions = appState.listBrowserTargetSessions(instance.sessionId);
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  instance.targetMenuList.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'browser-target-menu-header';
  header.textContent = 'Open Sessions';
  instance.targetMenuList.appendChild(header);

  if (targetSessions.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'browser-target-menu-empty';
    emptyState.textContent = 'Open a CLI session to route browser prompts here.';
    instance.targetMenuList.appendChild(emptyState);
  } else {
    for (const session of targetSessions) {
      const providerId = session.providerId ?? 'claude';
      const button = document.createElement('button');
      button.className = 'browser-target-menu-item';
      setProviderAccentTarget(button, providerId);
      if (selectedTarget?.id === session.id) {
        button.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'browser-target-session-name';
      label.textContent = session.name;

      const meta = document.createElement('span');
      meta.className = 'browser-target-session-meta';
      setProviderAccentTarget(meta, providerId);
      const parts = [getProviderDisplayName(providerId)];
      if (appState.activeProject?.activeSessionId === session.id) {
        parts.unshift('Active');
      }
      meta.textContent = parts.join(' · ');

      button.appendChild(label);
      button.appendChild(meta);
      button.addEventListener('click', () => {
        appState.setBrowserTargetSession(instance.sessionId, session.id);
        closeBrowserTargetMenu(instance, 'select-target');
      });
      instance.targetMenuList.appendChild(button);
    }
  }

  const separator = document.createElement('div');
  separator.className = 'browser-target-menu-separator';
  instance.targetMenuList.appendChild(separator);

  const newSessionBtn = document.createElement('button');
  newSessionBtn.className = 'browser-target-menu-item browser-target-menu-action';
  newSessionBtn.textContent = 'Send to New Session';
  newSessionBtn.addEventListener('click', () => runTargetMenuAction(instance, 'new'));
  instance.targetMenuList.appendChild(newSessionBtn);

  const customSessionBtn = document.createElement('button');
  customSessionBtn.className = 'browser-target-menu-item browser-target-menu-action';
  customSessionBtn.textContent = 'Send to Custom Session…';
  customSessionBtn.addEventListener('click', () => runTargetMenuAction(instance, 'custom'));
  instance.targetMenuList.appendChild(customSessionBtn);
}

export function syncBrowserTargetControls(instance: BrowserTabInstance): void {
  const selectedTarget = appState.resolveBrowserTargetSession(instance.sessionId);
  const selectedProviderId: ProviderId | undefined = selectedTarget
    ? selectedTarget.providerId ?? 'claude'
    : undefined;
  const hasTarget = !!selectedTarget;
  const primaryButtons = [instance.submitBtn, instance.drawSubmitBtn, instance.flowSubmitBtn];
  for (const button of primaryButtons) {
    button.disabled = !hasTarget;
    setProviderAccentTarget(button, selectedProviderId);
    button.title = hasTarget
      ? `Send to ${selectedTarget.name}`
      : 'Select an open session target first';
  }

  const targetButtons = [instance.inspectTargetBtn, instance.drawTargetBtn, instance.flowTargetBtn];
  const label = `${browserTargetButtonLabel(instance)} ▾`;
  for (const button of targetButtons) {
    setProviderAccentTarget(button, selectedProviderId);
    button.textContent = label;
    button.title = selectedTarget
      ? `Current target: ${getProviderDisplayName(selectedTarget.providerId ?? 'claude')} / ${selectedTarget.name}`
      : 'Choose which open session receives the browser prompt';
  }

  if (instance.targetMenu.style.display !== 'none') {
    renderBrowserTargetMenu(instance);
  }

  instance.syncToolbarState();
}

export function openBrowserTargetMenu(
  instance: BrowserTabInstance,
  trigger: HTMLButtonElement,
  mode: 'inspect' | 'draw' | 'flow',
): void {
  if (instance.activeTargetTrigger === trigger && instance.targetMenu.style.display !== 'none') {
    closeBrowserTargetMenu(instance, 'trigger-toggle');
    return;
  }

  instance.activeTargetTrigger = trigger;
  instance.activeTargetMode = mode;
  renderBrowserTargetMenu(instance);
  instance.targetMenu.style.display = 'flex';
  instance.targetMenuFloatingCleanup?.();
  instance.targetMenuFloatingCleanup = anchorFloatingSurface(trigger, instance.targetMenu, {
    placement: 'bottom-end',
    offsetPx: 6,
    maxWidthPx: 300,
    maxHeightPx: 360,
  });
  logDebugEvent('browserMenu', instance.sessionId, {
    menu: 'session-target',
    state: 'open',
    reason: `trigger:${mode}`,
  });
}
