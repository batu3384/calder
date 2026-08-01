import { t } from '../../i18n.js';
import {
  normalizePixelProviderId,
  pixelProviderLabel,
} from '../pixel-agent/provider-pixel.js';
import type { OfficeCharacter } from './types.js';

const GENERIC_SESSION_NAME = /^(Session|Oturum)\s*\d+$/i;

/** Prefer provider + activity over generic "Session 1" chrome names. */
export function formatCharacterChromeLabel(ch: OfficeCharacter): string {
  if (ch.isActive && ch.activityLabel) return ch.activityLabel.slice(0, 22);
  const provider = pixelProviderLabel(normalizePixelProviderId(ch.providerId));
  const who = GENERIC_SESSION_NAME.test(ch.name.trim()) ? provider : ch.name.trim().slice(0, 14);
  if (!ch.isActive) return `${who} · ${t('Resting')}`.slice(0, 22);
  return who.slice(0, 22);
}

export function isGenericSessionName(name: string): boolean {
  return GENERIC_SESSION_NAME.test(name.trim());
}
