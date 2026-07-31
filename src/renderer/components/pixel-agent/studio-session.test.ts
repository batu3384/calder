import { describe, expect, it, vi } from 'vitest';

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: { activeSessionId: 'session-active' },
  },
}));

vi.mock('../session-inspector/session-inspector-state-ui.js', () => ({
  inspectorState: { inspectedSessionId: 'session-other' },
}));

import { isInspectedSessionForeground } from './studio-session.js';

describe('studio session foreground', () => {
  it('returns false when inspected session is not active', () => {
    expect(isInspectedSessionForeground()).toBe(false);
  });
});
