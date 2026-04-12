import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOn = vi.fn();
const mockAppState = {
  on: (...args: unknown[]) => mockOn(...args),
  activeSession: { id: 'active-session' },
};

vi.mock('../state.js', () => ({
  appState: mockAppState,
}));

function makeElement() {
  return {
    className: '',
    textContent: '',
    style: { animation: '' },
    classList: {
      add() {},
      remove() {},
      toggle() { return false; },
    },
    appendChild() {},
    addEventListener() {},
    remove() {},
  };
}

const mockQuerySelector = vi.fn();

vi.stubGlobal('document', {
  createElement: () => makeElement(),
  querySelector: (...args: unknown[]) => mockQuerySelector(...args),
});

describe('alert banner', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('targets the warned session pane instead of the active session', async () => {
    const pane = {
      querySelector: vi.fn(() => null),
      prepend: vi.fn(),
      insertBefore: vi.fn(),
    };
    mockQuerySelector.mockReturnValueOnce(pane);

    const mod = await import('./alert-banner.js');
    mod.showAlertBanner({
      sessionId: 'warned-session',
      icon: '!',
      message: 'Tracking is off',
    });

    expect(mockQuerySelector).toHaveBeenCalledWith('.terminal-pane[data-session-id="warned-session"]');
  });
});

