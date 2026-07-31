import { describe, expect, it, vi } from 'vitest';

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: { activeSessionId: 'session-active' } as {
      activeSessionId: string | null;
    } | null,
  },
}));

import { appState } from '../../state.js';
import { isActiveCliSessionForeground, isInspectedSessionForeground } from './studio-session.js';

describe('studio session foreground', () => {
  it('is true only for the active CLI session id', () => {
    expect(isActiveCliSessionForeground('session-active')).toBe(true);
    expect(isActiveCliSessionForeground('session-other')).toBe(false);
  });

  it('is false when there is no active session', () => {
    (appState as { activeProject: { activeSessionId: string | null } | null }).activeProject = {
      activeSessionId: null,
    };
    expect(isActiveCliSessionForeground('session-active')).toBe(false);
    expect(isInspectedSessionForeground()).toBe(false);
  });
});
