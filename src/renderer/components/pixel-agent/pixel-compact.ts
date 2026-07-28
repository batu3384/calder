import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { pixelStateLabel, resolvePixelVisualState } from './visual-resolver.js';

export function renderPixelCompactStrip(
  container: HTMLElement,
  events: EvidenceEvent[],
): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'inspector-pixel-strip';

  const state = resolvePixelVisualState(events);
  const label = document.createElement('span');
  label.className = 'inspector-pixel-label';
  label.textContent = pixelStateLabel(state);
  strip.appendChild(label);

  const badge = document.createElement('span');
  badge.className = 'inspector-pixel-state';
  badge.textContent = state.replace(/_/g, ' ');
  strip.appendChild(badge);

  container.prepend(strip);
  return strip;
}
