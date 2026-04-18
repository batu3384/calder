import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock peer-host before importing share-dialog
const mockIsSharing = vi.fn<(sessionId: unknown) => boolean>(() => false);
const mockIsConnected = vi.fn<(sessionId: unknown) => boolean>(() => false);
vi.mock('../sharing/peer-host.js', () => ({
  isSharing: (sessionId: unknown) => mockIsSharing(sessionId),
  isConnected: (sessionId: unknown) => mockIsConnected(sessionId),
}));

// Mock share-manager before importing share-dialog
const mockEndShare = vi.fn<(sessionId: unknown) => void>();
const mockShareSession = vi.fn<(sessionId: unknown, mode: unknown, pin: unknown) => Promise<unknown>>();
vi.mock('../sharing/share-manager.js', () => ({
  shareSession: (sessionId: unknown, mode: unknown, pin: unknown) => mockShareSession(sessionId, mode, pin),
  acceptShareAnswer: vi.fn(),
  endShare: (sessionId: unknown) => mockEndShare(sessionId),
}));

// Mock share-crypto
const mockValidateSharePassphrase = vi.fn(() => null);
const mockGeneratePassphrase = vi.fn(() => 'ABCD-EF12-GH34-JK56');
vi.mock('../sharing/share-crypto.js', () => ({
  validateSharePassphrase: (passphrase: string) => mockValidateSharePassphrase(passphrase),
  generatePassphrase: () => mockGeneratePassphrase(),
  DecryptionError: class DecryptionError extends Error {},
}));

// Minimal DOM stubs so share-dialog can create elements without jsdom
function makeElement(): Record<string, unknown> {
  const el: Record<string, unknown> = {
    className: '',
    textContent: '',
    innerHTML: '',
    readOnly: false,
    rows: 0,
    placeholder: '',
    type: '',
    name: '',
    value: '',
    checked: false,
    disabled: false,
    _listeners: {} as Record<string, Function[]>,
    appendChild(child: Record<string, unknown>) { return child; },
    remove() {},
    focus() {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener(event: string, cb: Function) {
      const listeners = (el._listeners as Record<string, Function[]>);
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
  };
  return el;
}

// Stub document and navigator
const createdElements: Record<string, unknown>[] = [];
function installGlobalStubs() {
  vi.stubGlobal('document', {
    createElement(_tag: string) {
      const el = makeElement();
      createdElements.push(el);
      return el;
    },
    body: {
      appendChild(_child: unknown) {},
    },
    querySelector(_sel: string) {
      // Return a checked radio with value 'readonly'
      return { value: 'readonly' };
    },
  });

  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn() },
  });

  vi.stubGlobal('window', {
    calder: {
      sharing: {
        getRtcConfig: vi.fn(async () => ({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          iceTransportPolicy: 'all',
        })),
      },
    },
  });
}

installGlobalStubs();

import { showShareDialog, closeShareDialog } from './share-dialog.js';

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  createdElements.length = 0;
  installGlobalStubs();
  // Reset module state by closing any lingering dialog
  closeShareDialog();
  vi.clearAllMocks();
  mockValidateSharePassphrase.mockReturnValue(null);
  mockGeneratePassphrase.mockReturnValue('ABCD-EF12-GH34-JK56');
});

function findButtons(text: string): Record<string, unknown>[] {
  return createdElements.filter(
    (el) => el.textContent === text && (el as { className?: string }).className !== undefined
  );
}

async function clickButton(text: string): Promise<void> {
  const buttons = findButtons(text);
  if (buttons.length === 0) throw new Error(`Button "${text}" not found`);
  for (const btn of buttons) {
    const listeners = (btn._listeners as Record<string, Function[]> | undefined);
    for (const cb of listeners?.click ?? []) {
      await cb();
    }
  }
}

describe('share-dialog cleanup on close', () => {
  it('does not call endShare when dialog closed before starting share', () => {
    showShareDialog('session-1');
    closeShareDialog();
    expect(mockEndShare).not.toHaveBeenCalled();
  });

  it('shows validation feedback and blocks share start on invalid passphrase', async () => {
    mockValidateSharePassphrase.mockReturnValue('invalid passphrase');
    showShareDialog('session-1');
    await clickButton('Start Sharing');
    expect(mockShareSession).not.toHaveBeenCalled();
    expect(mockEndShare).not.toHaveBeenCalled();
  });

  it('calls endShare when shareSession throws', async () => {
    mockShareSession.mockRejectedValue(new Error('WebRTC failed'));
    mockIsSharing.mockReturnValue(true);

    showShareDialog('session-1');
    await clickButton('Start Sharing');

    await vi.waitFor(() => {
      expect(mockEndShare).toHaveBeenCalledWith('session-1');
    });
  });
});
