import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { t } from '../../i18n.js';
import {
  isPixelMotionActive,
  type PixelProviderId,
  pixelProviderLabel,
  resolvePixelProviderId,
} from './provider-pixel.js';
import {
  pixelStateLabel,
  type PixelVisualState,
  resolvePixelVisualState,
} from './visual-resolver.js';

export interface PixelCompactUpdateOptions {
  providerId?: string | null;
}

export function updatePixelCompactStrip(
  strip: HTMLElement,
  events: EvidenceEvent[],
  options?: PixelCompactUpdateOptions,
): PixelVisualState {
  const state = resolvePixelVisualState(events);
  const providerId = resolvePixelProviderId(events, options?.providerId);
  strip.dataset.state = state;
  strip.dataset.provider = providerId;
  strip.dataset.motion = isPixelMotionActive(state) ? 'active' : 'idle';

  const provider = strip.querySelector('.inspector-pixel-provider');
  if (provider) {
    provider.textContent = pixelProviderLabel(providerId);
  }

  const label = strip.querySelector('.inspector-pixel-label');
  if (label) {
    label.textContent = t(pixelStateLabel(state));
  }

  const badge = strip.querySelector('.inspector-pixel-state');
  if (badge) {
    badge.textContent = state.replace(/_/g, ' ');
    badge.setAttribute('aria-label', t(pixelStateLabel(state)));
  }

  return state;
}

export function renderPixelCompactStrip(
  container: HTMLElement,
  events: EvidenceEvent[],
  options?: PixelCompactUpdateOptions,
): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'inspector-pixel-strip';
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');

  const avatar = document.createElement('div');
  avatar.className = 'inspector-pixel-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  strip.appendChild(avatar);

  const provider = document.createElement('span');
  provider.className = 'inspector-pixel-provider';
  strip.appendChild(provider);

  const label = document.createElement('span');
  label.className = 'inspector-pixel-label';
  strip.appendChild(label);

  const badge = document.createElement('span');
  badge.className = 'inspector-pixel-state';
  strip.appendChild(badge);

  updatePixelCompactStrip(strip, events, options);
  container.prepend(strip);
  return strip;
}

export type { PixelProviderId };
