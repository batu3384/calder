import type { UiLanguage } from '../../shared/types/provider.js';
import { getShareConnectionSnapshot, isConnected, isSharing } from '../sharing/peer-host.js';
import { appState } from '../state.js';
import {
  type ShareDialogCopy,
  type ShareDialogLanguage,
  getShareDialogCopy,
  resolveShareDialogLanguage,
} from './share-dialog-copy.js';

export type ShareDialogMobilePresenceCopy = Pick<
  ShareDialogCopy,
  | 'mobileConnectionSummary'
  | 'mobileConnectionStateConnected'
  | 'mobileConnectionStateWaiting'
  | 'mobileConnectionStateIdle'
  | 'mobileConnectionMetaConnected'
  | 'mobileConnectionMetaWaiting'
  | 'readOnly'
  | 'readWrite'
>;

type ShareDialogMobilePresenceState = 'connected' | 'waiting' | 'idle';

export interface ShareDialogMobilePresenceView {
  state: ShareDialogMobilePresenceState;
  stateLabel: string;
  summaryText: string;
  metaText: string;
  modeLabel?: string;
  activeSessionName?: string;
  durationLabel?: string;
}

interface BuildShareDialogMobilePresenceOptions {
  sessionId: string;
  language: UiLanguage | undefined;
  resolveSessionName?: (sessionId: string, fallbackSessionId: string) => string;
  nowMs?: number;
}

export function getShareDialogMobilePresenceCopy(language: UiLanguage | undefined): ShareDialogMobilePresenceCopy {
  const normalizedLanguage = resolveShareDialogLanguage(language);
  const copy = getShareDialogCopy(normalizedLanguage);
  return {
    mobileConnectionSummary: copy.mobileConnectionSummary,
    mobileConnectionStateConnected: copy.mobileConnectionStateConnected,
    mobileConnectionStateWaiting: copy.mobileConnectionStateWaiting,
    mobileConnectionStateIdle: copy.mobileConnectionStateIdle,
    mobileConnectionMetaConnected: copy.mobileConnectionMetaConnected,
    mobileConnectionMetaWaiting: copy.mobileConnectionMetaWaiting,
    readOnly: copy.readOnly,
    readWrite: copy.readWrite,
  };
}

export function buildShareDialogMobilePresence(
  options: BuildShareDialogMobilePresenceOptions,
): ShareDialogMobilePresenceView {
  const { sessionId, language, resolveSessionName: resolveSessionNameFn, nowMs = Date.now() } = options;
  const copy = getShareDialogMobilePresenceCopy(language);
  const mobileConnectedNow = isConnected(sessionId);
  const mobileSharingNow = isSharing(sessionId);
  const state: ShareDialogMobilePresenceState = mobileConnectedNow
    ? 'connected'
    : mobileSharingNow
      ? 'waiting'
      : 'idle';

  const stateLabel = state === 'connected'
    ? copy.mobileConnectionStateConnected
    : state === 'waiting'
      ? copy.mobileConnectionStateWaiting
      : copy.mobileConnectionStateIdle;
  const summaryText = copy.mobileConnectionSummary(stateLabel);

  const snapshot = getShareConnectionSnapshot(sessionId);
  if (snapshot && state === 'connected') {
    const activeSessionName = (resolveSessionNameFn ?? resolveSessionName)(snapshot.activeSessionId, snapshot.activeSessionId);
    const modeLabel = snapshot.mode === 'readwrite' ? copy.readWrite : copy.readOnly;
    const since = snapshot.verifiedAtMs ?? snapshot.connectedAtMs;
    const durationLabel = since
      ? formatShareConnectionDuration(nowMs - since, language)
      : formatShareConnectionDuration(0, language);
    return {
      state,
      stateLabel,
      summaryText,
      metaText: copy.mobileConnectionMetaConnected(activeSessionName, modeLabel, durationLabel),
      modeLabel,
      activeSessionName,
      durationLabel,
    };
  }

  if (snapshot && state === 'waiting') {
    return {
      state,
      stateLabel,
      summaryText,
      metaText: copy.mobileConnectionMetaWaiting,
    };
  }

  return {
    state,
    stateLabel,
    summaryText,
    metaText: '',
  };
}

export function formatShareConnectionDuration(
  durationMs: number,
  language: UiLanguage | ShareDialogLanguage | undefined,
): string {
  const normalizedLanguage = language === 'tr' ? 'tr' : 'en';
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return normalizedLanguage === 'tr' ? 'şimdi' : 'just now';
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (normalizedLanguage === 'tr') {
    if (hours > 0) return `${hours}sa ${minutes}dk`;
    if (minutes > 0) return `${minutes}dk ${seconds}sn`;
    return `${seconds}sn`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function resolveSessionName(sessionId: string, fallbackSessionId: string): string {
  const project = appState.projects.find((entry) => entry.sessions.some((session) => session.id === sessionId));
  const session = project?.sessions.find((entry) => entry.id === sessionId);
  return session?.name?.trim() || fallbackSessionId;
}
