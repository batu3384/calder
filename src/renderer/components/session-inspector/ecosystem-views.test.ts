import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../state.js', () => ({
  appState: {
    activeProject: null as null | {
      sessions: Array<{ id: string; type?: string }>;
    },
  },
}));

import { appState } from '../../state.js';
import { listOpenCliSessions } from '../context-pixel-panel.js';

describe('listOpenCliSessions', () => {
  beforeEach(() => {
    (appState as { activeProject: unknown }).activeProject = null;
  });

  it('returns empty when no active project', () => {
    expect(listOpenCliSessions()).toEqual([]);
  });

  it('filters CLI sessions and ignores browser tabs', () => {
    (appState as { activeProject: unknown }).activeProject = {
      sessions: [
        { id: 'cli-1', type: 'claude' },
        { id: 'cli-2' },
        { id: 'web-1', type: 'browser-tab' },
      ],
    };
    expect(listOpenCliSessions().map((session) => session.id)).toEqual(['cli-1', 'cli-2']);
  });
});
