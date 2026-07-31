import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import type { ProviderId } from '../../../shared/types-provider.js';
import type { SessionRecord } from '../../../shared/types-session.js';
import { t } from '../../i18n.js';
import { getProviderCapabilities } from '../../provider-availability.js';
import { formatPixelActivityLine } from '../pixel-agent/activity-label.js';
import {
  isPixelMotionActive,
  type PixelProviderId,
  pixelProviderLabel,
  pixelProviderMark,
  resolvePixelProviderId,
} from '../pixel-agent/provider-pixel.js';
import { pixelStateLabel, resolvePixelVisualState } from '../pixel-agent/visual-resolver.js';

export const ECOSYSTEM_EVENT_WINDOW = 80;

export interface EcosystemCardModel {
  session: SessionRecord;
  events: EvidenceEvent[];
  runId: string | null;
  isActive: boolean;
  isInspected: boolean;
}

export function truncateCliSessionId(cliSessionId: string | null | undefined): string | null {
  if (!cliSessionId) return null;
  if (cliSessionId.length <= 12) return cliSessionId;
  return `${cliSessionId.slice(0, 6)}…${cliSessionId.slice(-4)}`;
}

export function formatEcosystemStatusText(model: EcosystemCardModel): string {
  const providerId = resolvePixelProviderId(
    model.events,
    model.session.providerId,
  ) as PixelProviderId;
  const caps = getProviderCapabilities((model.session.providerId || 'claude') as ProviderId);
  const ptyOnly = caps?.hookStatus === false;
  const state = ptyOnly
    ? resolvePixelVisualState(
        model.events.filter(
          (event) =>
            event.type === 'pty_started' ||
            event.type === 'pty_exited' ||
            event.type === 'evidence_run_started',
        ),
      )
    : resolvePixelVisualState(model.events);
  const activity = formatPixelActivityLine(model.events, state);
  const bits = [
    model.session.name || t('Untitled session'),
    pixelProviderLabel(providerId),
    t(pixelStateLabel(state)),
  ];
  if (activity.toolName) bits.push(activity.toolName);
  if (activity.context) bits.push(activity.context);
  return bits.join(' · ');
}

export function buildEcosystemCardElement(
  model: EcosystemCardModel,
  onSelect: (sessionId: string) => void,
  onOpenStudio: (sessionId: string) => void,
): HTMLElement {
  const providerId = resolvePixelProviderId(
    model.events,
    model.session.providerId,
  ) as PixelProviderId;
  const caps = getProviderCapabilities((model.session.providerId || 'claude') as ProviderId);
  const ptyOnly = caps?.hookStatus === false;
  const state = ptyOnly
    ? resolvePixelVisualState(
        model.events.filter(
          (event) =>
            event.type === 'pty_started' ||
            event.type === 'pty_exited' ||
            event.type === 'evidence_run_started',
        ),
      )
    : resolvePixelVisualState(model.events);
  const activity = formatPixelActivityLine(model.events, state);
  const shortCliId = truncateCliSessionId(model.session.cliSessionId);

  const card = document.createElement('div');
  card.className =
    'inspector-ecosystem-card' +
    (model.isActive ? ' is-active-session' : '') +
    (model.isInspected ? ' is-inspected' : '');
  card.dataset.sessionId = model.session.id;
  card.dataset.provider = providerId;
  card.dataset.state = state;
  card.dataset.motion = isPixelMotionActive(state) ? 'active' : 'idle';
  card.setAttribute('role', 'listitem');

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'inspector-ecosystem-select';
  selectBtn.setAttribute('aria-label', `${model.session.name} · ${pixelProviderLabel(providerId)}`);

  const mark = document.createElement('span');
  mark.className = 'inspector-ecosystem-mark';
  mark.textContent = pixelProviderMark(providerId);
  mark.setAttribute('aria-hidden', 'true');
  selectBtn.appendChild(mark);

  const avatar = document.createElement('span');
  avatar.className = 'inspector-ecosystem-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  selectBtn.appendChild(avatar);

  const body = document.createElement('span');
  body.className = 'inspector-ecosystem-body';

  const title = document.createElement('span');
  title.className = 'inspector-ecosystem-title';
  title.textContent = model.session.name || t('Untitled session');
  body.appendChild(title);

  const providerLine = document.createElement('span');
  providerLine.className = 'inspector-ecosystem-provider';
  providerLine.textContent = shortCliId
    ? `${pixelProviderLabel(providerId)} · ${shortCliId}`
    : pixelProviderLabel(providerId);
  body.appendChild(providerLine);

  const status = document.createElement('span');
  status.className = 'inspector-ecosystem-status';
  const bits = [t(pixelStateLabel(state))];
  if (activity.toolName) bits.push(activity.toolName);
  if (activity.context) bits.push(activity.context);
  status.textContent = bits.join(' · ');
  body.appendChild(status);

  selectBtn.appendChild(body);
  selectBtn.addEventListener('click', () => onSelect(model.session.id));
  card.appendChild(selectBtn);

  const chips = document.createElement('div');
  chips.className = 'inspector-ecosystem-chips';

  if (ptyOnly) {
    const fidelity = document.createElement('span');
    fidelity.className = 'inspector-ecosystem-chip inspector-ecosystem-chip-fidelity';
    fidelity.textContent = t('PTY only');
    chips.appendChild(fidelity);
  }

  if (!model.runId) {
    const noRun = document.createElement('span');
    noRun.className = 'inspector-ecosystem-chip';
    noRun.textContent = t('No evidence run');
    chips.appendChild(noRun);
  }

  const studioBtn = document.createElement('button');
  studioBtn.type = 'button';
  studioBtn.className = 'inspector-ecosystem-chip inspector-ecosystem-chip-action';
  studioBtn.textContent = t('Studio');
  studioBtn.setAttribute('aria-label', t('Open Pixel Studio'));
  studioBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenStudio(model.session.id);
  });
  chips.appendChild(studioBtn);

  card.appendChild(chips);
  return card;
}
