import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../sharing/peer-host.js', () => ({
  getShareConnectionSnapshot: vi.fn(),
  isConnected: vi.fn(),
  isSharing: vi.fn(),
}));

vi.mock('../../state.js', () => ({
  appState: { projects: [] },
}));

import {
  getShareConnectionSnapshot,
  isConnected,
  isSharing,
} from '../../sharing/peer-host.js';
import {
  buildShareDialogMobilePresence,
  formatShareConnectionDuration,
  getShareDialogMobilePresenceCopy,
} from './share-dialog-mobile-presence.js';

const mockGetShareConnectionSnapshot = vi.mocked(getShareConnectionSnapshot);
const mockIsConnected = vi.mocked(isConnected);
const mockIsSharing = vi.mocked(isSharing);

describe('share-dialog mobile presence helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockReturnValue(false);
    mockIsSharing.mockReturnValue(false);
    mockGetShareConnectionSnapshot.mockReturnValue(null);
  });

  it('formats connection durations for english and turkish', () => {
    expect(formatShareConnectionDuration(0, 'en')).toBe('just now');
    expect(formatShareConnectionDuration(0, 'tr')).toBe('şimdi');
    expect(formatShareConnectionDuration(65_000, 'en')).toBe('1m 5s');
    expect(formatShareConnectionDuration(65_000, 'tr')).toBe('1dk 5sn');
    expect(formatShareConnectionDuration(3_661_000, 'en')).toBe('1h 1m');
    expect(formatShareConnectionDuration(3_661_000, 'tr')).toBe('1sa 1dk');
  });

  it('exposes localized presence copy for mobile status labels', () => {
    const copy = getShareDialogMobilePresenceCopy('en');
    expect(copy.mobileConnectionStateConnected).toBe('Connected');
    expect(copy.mobileConnectionStateWaiting).toBe('Sharing active, waiting for connection');
    expect(copy.mobileConnectionStateIdle).toBe('No active mobile connection');
  });

  it('builds connected presence metadata with mode and duration', () => {
    const nowMs = 1_000_000;
    mockIsConnected.mockReturnValue(true);
    mockGetShareConnectionSnapshot.mockReturnValue({
      activeSessionId: 'session-2',
      mode: 'readwrite',
      connectedAtMs: nowMs - 75_000,
      verifiedAtMs: nowMs - 75_000,
    } as any);

    const view = buildShareDialogMobilePresence({
      sessionId: 'session-1',
      language: 'en',
      nowMs,
      resolveSessionName: () => 'QA Session',
    });

    expect(view.state).toBe('connected');
    expect(view.stateLabel).toBe('Connected');
    expect(view.summaryText).toContain('Connected');
    expect(view.modeLabel).toBe('Read-write');
    expect(view.activeSessionName).toBe('QA Session');
    expect(view.durationLabel).toBe('1m 15s');
    expect(view.metaText).toContain('QA Session');
    expect(view.metaText).toContain('Read-write');
  });

  it('builds waiting/idle states without connected metadata', () => {
    mockIsSharing.mockReturnValue(true);
    mockGetShareConnectionSnapshot.mockReturnValue({
      activeSessionId: 'session-2',
      mode: 'readonly',
    } as any);

    const waiting = buildShareDialogMobilePresence({
      sessionId: 'session-1',
      language: 'en',
    });
    expect(waiting.state).toBe('waiting');
    expect(waiting.metaText).toBe('Waiting for secure authentication...');

    mockIsSharing.mockReturnValue(false);
    mockGetShareConnectionSnapshot.mockReturnValue(null);

    const idle = buildShareDialogMobilePresence({
      sessionId: 'session-1',
      language: 'en',
    });
    expect(idle.state).toBe('idle');
    expect(idle.metaText).toBe('');
  });
});
