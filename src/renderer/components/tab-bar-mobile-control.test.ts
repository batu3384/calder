import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRecord, SessionRecord } from '../../shared/types.js';

const mockIsSharing = vi.fn<(sessionId: string) => boolean>();
const mockIsConnected = vi.fn<(sessionId: string) => boolean>();

vi.mock('../sharing/peer-host.js', () => ({
  isSharing: (sessionId: string) => mockIsSharing(sessionId),
  isConnected: (sessionId: string) => mockIsConnected(sessionId),
}));

vi.mock('./share-dialog.js', () => ({
  buildShareDialogMobilePresence: vi.fn(),
}));

import { getPreferredCliSession } from './tab-bar-mobile-control.js';

function makeCliSession(id: string): SessionRecord {
  return {
    id,
    name: id,
    cliSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeProject(sessions: SessionRecord[], activeSessionId: string | null): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Project',
    path: '/tmp/project',
    sessions,
    activeSessionId,
    layout: {
      mode: 'tabs',
      splitPanes: [],
      splitDirection: 'horizontal',
    },
  };
}

describe('tab-bar-mobile-control', () => {
  beforeEach(() => {
    mockIsSharing.mockReset();
    mockIsConnected.mockReset();
    mockIsSharing.mockReturnValue(false);
    mockIsConnected.mockReturnValue(false);
  });

  it('prefers connected cli session first', () => {
    const first = makeCliSession('a');
    const second = makeCliSession('b');
    mockIsConnected.mockImplementation((sessionId) => sessionId === second.id);
    const project = makeProject([first, second], first.id);

    expect(getPreferredCliSession(project)?.id).toBe(second.id);
  });

  it('falls back to sharing session when no connected session exists', () => {
    const first = makeCliSession('a');
    const second = makeCliSession('b');
    mockIsSharing.mockImplementation((sessionId) => sessionId === second.id);
    const project = makeProject([first, second], first.id);

    expect(getPreferredCliSession(project)?.id).toBe(second.id);
  });

  it('falls back to active cli session', () => {
    const first = makeCliSession('a');
    const second = makeCliSession('b');
    const project = makeProject([first, second], second.id);

    expect(getPreferredCliSession(project)?.id).toBe(second.id);
  });

  it('falls back to first cli session when no active session exists', () => {
    const first = makeCliSession('a');
    const second = makeCliSession('b');
    const project = makeProject([first, second], null);

    expect(getPreferredCliSession(project)?.id).toBe(first.id);
  });
});
