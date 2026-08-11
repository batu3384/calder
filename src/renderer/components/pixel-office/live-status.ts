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

export function formatEventAge(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return t('No event');
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return t('now');
  if (seconds < 60) return `${seconds}${t('s ago')}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${t('m ago')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${t('h ago')}`;
  return `${Math.floor(hours / 24)}${t('d ago')}`;
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
  const liveStateText =
    mode === 'unavailable' ? t('Unavailable') : mode === 'live' ? t('Live') : t('Standby');
  if (liveState.dataset.mode !== mode || liveState.textContent !== liveStateText) {
    liveState.dataset.mode = mode;
    liveState.textContent = liveStateText;
  }
  const countText = `${activeCount} ${t('Active sessions')}`;
  if (count.textContent !== countText) count.textContent = countText;
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
    const eventAge = formatEventAge(
      state.runtime?.latestEvidenceTimestamp(character.sessionId) ?? null,
    );
    const context =
      character.contextPct === null
        ? ''
        : ` · ${t('Context')} ${Math.round(character.contextPct)}%`;
    const detail = `${statusLabel} · ${eventAge}${context}`;
    item.textContent = detail;
    item.setAttribute('aria-label', detail);
    fragment.appendChild(item);
  }
  list.appendChild(fragment);
}
