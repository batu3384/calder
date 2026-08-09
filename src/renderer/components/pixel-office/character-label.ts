import { t } from '../../i18n.js';
import { normalizePixelProviderId, pixelProviderLabel } from '../pixel-agent/provider-pixel.js';
import type { OfficeCharacter } from './types.js';

const GENERIC_SESSION_NAME = /^(Session|Oturum|Sub)\s*\d+$/i;
const INACTIVE_STATE_LABELS: Record<string, string> = {
  waiting_for_approval: 'Waiting for approval',
  blocked: 'Blocked',
  failed: 'Failed',
  completed: 'Completed',
};

/** Prefer provider + activity over generic "Session 1" chrome names. */
export function formatCharacterChromeLabel(ch: OfficeCharacter): string {
  const provider = pixelProviderLabel(normalizePixelProviderId(ch.providerId));
  const who = isGenericSessionName(ch.name) ? provider : ch.name.trim().slice(0, 14);
  const activity = ch.activityLabel || t('Resting');
  return `${who} · ${activity}`.slice(0, 22);
}

export function formatCharacterStatusLabel(ch: OfficeCharacter): string {
  const provider = pixelProviderLabel(normalizePixelProviderId(ch.providerId));
  const name = ch.name.trim();
  const who = isGenericSessionName(name) ? provider : name.slice(0, 24);
  const activity = ch.activityLabel || t(INACTIVE_STATE_LABELS[ch.visualState] ?? 'Resting');
  return `${who} · ${activity}`.slice(0, 64);
}

function isGenericSessionName(name: string): boolean {
  return GENERIC_SESSION_NAME.test(name.trim());
}
