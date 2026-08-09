import { t } from '../../i18n.js';
import { formatCharacterStatusLabel } from './character-label.js';
import type { OfficeRuntime } from './office-state.js';

function officeEl(): HTMLElement | null {
  return document.getElementById('pixel-office');
}

function editBtn(): HTMLElement | null {
  return document.getElementById('btn-pixel-office-edit');
}

function resizeHandleEl(): HTMLElement | null {
  return document.getElementById('pixel-office-rail-resize');
}

function liveStateEl(): HTMLElement | null {
  return document.getElementById('pixel-office-live-state');
}

function liveCountEl(): HTMLElement | null {
  return document.getElementById('pixel-office-live-count');
}

function liveUpdatedEl(): HTMLElement | null {
  return document.getElementById('pixel-office-live-updated');
}

function sessionStatusEl(): HTMLElement | null {
  return document.getElementById('pixel-office-session-status');
}

export function syncOfficeText(): void {
  officeEl()?.setAttribute('aria-label', t('Pixel Office'));
  sessionStatusEl()?.setAttribute('aria-label', t('Pixel Office session status'));
  const title = document.querySelector<HTMLElement>('.pixel-office-title');
  if (title) title.textContent = t('Pixel Office');
  editBtn()?.setAttribute('title', t('Edit office layout'));
  editBtn()?.setAttribute('aria-label', t('Edit office layout'));
  resizeHandleEl()?.setAttribute('aria-label', t('Resize office view'));
  resizeHandleEl()?.setAttribute('title', t('Resize office view'));

  const toolLabels: Record<string, string> = {
    wall: 'Wall',
    floor: 'Floor',
    seat: 'Seat',
    'erase-seat': 'Erase',
  };
  for (const button of document.querySelectorAll<HTMLElement>('.pixel-office-tool-btn')) {
    const tool = button.dataset.officeTool;
    if (tool && toolLabels[tool]) button.textContent = t(toolLabels[tool]!);
    const action = button.dataset.officeAction;
    if (action) button.textContent = t(action[0]!.toUpperCase() + action.slice(1));
    const facing = button.dataset.officeFacing;
    if (facing) {
      const labels = ['Face down', 'Face left', 'Face right', 'Face up'];
      button.setAttribute('title', t(labels[Number(facing)] ?? 'Face down'));
    }
  }
}

export function syncLiveStatus(state: {
  runtime: OfficeRuntime | null;
  officeOpen: boolean;
  officeCollapsed: boolean;
  pixelModeEnabled: boolean;
}): void {
  const liveState = liveStateEl();
  const count = liveCountEl();
  const updated = liveUpdatedEl();
  const list = sessionStatusEl();
  if (!liveState || !count || !updated || !list) return;

  const characters =
    state.runtime?.listCharacters().filter((character) => !character.isSubagent) ?? [];
  const activeCount = characters.filter((character) => character.isActive).length;
  const mode = !state.pixelModeEnabled
    ? 'unavailable'
    : state.officeOpen && !state.officeCollapsed
      ? 'live'
      : 'standby';
  liveState.dataset.mode = mode;
  liveState.textContent =
    mode === 'unavailable' ? t('Unavailable') : mode === 'live' ? t('Live') : t('Standby');
  count.textContent = `${activeCount} ${t('Active sessions')}`;
  updated.textContent = `${t('Last update')} ${new Date().toLocaleTimeString()}`;

  list.replaceChildren();
  if (characters.length === 0) {
    list.textContent = t('No active sessions');
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const character of characters) {
    const item = document.createElement('div');
    item.className = 'pixel-office-session-status-item';
    item.dataset.state = character.isActive ? 'active' : character.visualState;
    const statusLabel = formatCharacterStatusLabel(character);
    item.textContent = statusLabel;
    item.setAttribute('aria-label', statusLabel);
    fragment.appendChild(item);
  }
  list.appendChild(fragment);
}
