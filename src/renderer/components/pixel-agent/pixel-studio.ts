import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import {
  isPixelMotionActive,
  pixelProviderLabel,
  resolvePixelProviderId,
} from './provider-pixel.js';
import {
  type PixelStudioPresentation,
  type PixelStudioStation,
  resolvePixelStudioPresentation,
  studioSceneLabel,
  studioStationLabel,
  studioStationPosition,
} from './studio-resolver.js';
import { pixelStateLabel } from './visual-resolver.js';

const STATIONS: PixelStudioStation[] = [
  'research',
  'files',
  'git',
  'terminal',
  'test_build',
  'security',
];

const VISIBLE_SUBAGENT_DESKS = 3;

function renderSubagentDesks(studio: HTMLElement, count: number): void {
  let desks = studio.querySelector<HTMLElement>('.inspector-pixel-studio-desks');
  if (!desks) {
    desks = document.createElement('div');
    desks.className = 'inspector-pixel-studio-desks';
    desks.setAttribute('aria-hidden', 'true');
    studio.appendChild(desks);
  }

  desks.replaceChildren();
  if (count <= 0) {
    desks.hidden = true;
    return;
  }

  desks.hidden = false;
  const visible = Math.min(count, VISIBLE_SUBAGENT_DESKS);
  for (let index = 0; index < visible; index += 1) {
    const desk = document.createElement('span');
    desk.className = 'inspector-pixel-studio-desk';
    desks.appendChild(desk);
  }
  if (count > VISIBLE_SUBAGENT_DESKS) {
    const overflow = document.createElement('span');
    overflow.className = 'inspector-pixel-studio-desk-overflow';
    overflow.textContent = `+${count - VISIBLE_SUBAGENT_DESKS}`;
    desks.appendChild(overflow);
  }
}

function syncSceneOverlay(studio: HTMLElement, presentation: PixelStudioPresentation): void {
  let overlay = studio.querySelector<HTMLElement>('.inspector-pixel-studio-scene');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'inspector-pixel-studio-scene';
    overlay.setAttribute('aria-hidden', 'true');
    studio.prepend(overlay);
  }

  studio.dataset.scene = presentation.scene;
  overlay.dataset.scene = presentation.scene;
  overlay.textContent =
    presentation.scene === 'normal' ? '' : t(studioSceneLabel(presentation.scene));
  overlay.hidden = presentation.scene === 'normal';
}

export interface PixelStudioUpdateOptions {
  paused?: boolean;
  providerId?: string | null;
}

export function updatePixelStudio(
  studio: HTMLElement,
  events: EvidenceEvent[],
  options?: PixelStudioUpdateOptions,
): PixelStudioPresentation {
  const paused = options?.paused ?? false;
  const presentation = resolvePixelStudioPresentation(events);
  const providerId = resolvePixelProviderId(events, options?.providerId);
  const [x, y] = studioStationPosition(presentation.station);

  studio.dataset.paused = paused ? 'true' : 'false';
  studio.dataset.station = presentation.station;
  studio.dataset.state = presentation.visualState;
  studio.dataset.provider = providerId;
  studio.dataset.motion = isPixelMotionActive(presentation.visualState) ? 'active' : 'idle';
  studio.style.setProperty('--pixel-agent-x', `${x}%`);
  studio.style.setProperty('--pixel-agent-y', `${y}%`);

  for (const cell of studio.querySelectorAll<HTMLElement>('.inspector-pixel-studio-station')) {
    cell.classList.toggle('is-active', cell.dataset.station === presentation.station);
  }

  const status = studio.querySelector('.inspector-pixel-studio-status');
  if (status) {
    status.textContent = `${pixelProviderLabel(providerId)} · ${t(studioStationLabel(presentation.station))} · ${t(pixelStateLabel(presentation.visualState))}`;
  }

  const subagentBadge = studio.querySelector<HTMLElement>('.inspector-pixel-studio-subagents');
  if (subagentBadge) {
    if (presentation.subagentCount > 0) {
      subagentBadge.hidden = false;
      subagentBadge.textContent = `+${presentation.subagentCount} ${t('subtasks')}`;
    } else {
      subagentBadge.hidden = true;
    }
  }

  renderSubagentDesks(studio, presentation.subagentCount);
  syncSceneOverlay(studio, presentation);

  return presentation;
}

export function renderPixelStudio(
  container: HTMLElement,
  events: EvidenceEvent[],
  options?: { variant?: 'inline' | 'tab'; paused?: boolean; providerId?: string | null },
): HTMLElement {
  const studio = document.createElement('div');
  studio.className =
    'inspector-pixel-studio' + (options?.variant === 'tab' ? ' inspector-pixel-studio--tab' : '');
  studio.setAttribute('role', 'region');
  studio.setAttribute('aria-label', t('Pixel Agent studio'));

  const grid = document.createElement('div');
  grid.className = 'inspector-pixel-studio-grid';

  for (const station of STATIONS) {
    const cell = document.createElement('div');
    cell.className = 'inspector-pixel-studio-station';
    cell.dataset.station = station;

    const icon = document.createElement('div');
    icon.className = 'inspector-pixel-studio-station-icon';
    icon.setAttribute('aria-hidden', 'true');
    cell.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'inspector-pixel-studio-station-label';
    label.textContent = t(studioStationLabel(station));
    cell.appendChild(label);

    grid.appendChild(cell);
  }

  studio.appendChild(grid);

  const agent = document.createElement('div');
  agent.className = 'inspector-pixel-studio-agent';
  agent.setAttribute('aria-hidden', 'true');
  const agentSprite = document.createElement('span');
  agentSprite.className = 'inspector-pixel-studio-agent-sprite';
  agent.appendChild(agentSprite);
  studio.appendChild(agent);

  const status = document.createElement('div');
  status.className = 'inspector-pixel-studio-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  studio.appendChild(status);

  const subagentBadge = document.createElement('div');
  subagentBadge.className = 'inspector-pixel-studio-subagents';
  subagentBadge.hidden = true;
  studio.appendChild(subagentBadge);

  updatePixelStudio(studio, events, {
    paused: options?.paused,
    providerId: options?.providerId,
  });

  if (options?.variant === 'tab') {
    container.appendChild(studio);
  } else {
    container.prepend(studio);
  }

  return studio;
}
