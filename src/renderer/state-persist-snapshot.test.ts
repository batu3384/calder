import { describe, expect, it } from 'vitest';

import type { PersistedState } from '../shared/types/project-state.js';
import { buildRendererPersistSnapshot } from './state-persist-snapshot.js';

function makeState(): PersistedState {
  return {
    version: 2,
    activeProjectId: 'project-1',
    preferences: {
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      debugMode: false,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
    },
    projects: [
      {
        id: 'project-1',
        name: 'Project',
        path: '/tmp/project',
        activeSessionId: 'session-1',
        layout: {
          mode: 'mosaic',
          splitPanes: ['session-1'],
          splitDirection: 'horizontal',
        },
        surface: {
          kind: 'web',
          active: true,
          targetSessionId: 'session-1',
          web: {
            sessionId: 'browser-1',
            url: 'http://localhost:3000',
            history: ['http://localhost:3000'],
          },
        },
        sessions: [
          {
            id: 'session-1',
            name: 'Session',
            cliSessionId: null,
            createdAt: '2026-04-21T00:00:00Z',
            pendingInitialPrompt: 'Transient prompt',
          },
        ],
      },
    ],
  };
}

describe('state persist snapshot', () => {
  it('strips transient session fields before saving', () => {
    const snapshot = buildRendererPersistSnapshot(makeState());

    expect(snapshot.projects[0].sessions[0]).not.toHaveProperty('pendingInitialPrompt');
    expect(snapshot.projects[0].surface).toEqual({
      kind: 'web',
      active: true,
      targetSessionId: 'session-1',
      web: {
        sessionId: 'browser-1',
        url: 'http://localhost:3000',
        history: ['http://localhost:3000'],
      },
    });
  });

  it('clones mutable surface collections', () => {
    const state = makeState();
    const snapshot = buildRendererPersistSnapshot(state);

    expect(snapshot.projects[0].surface?.web?.history).toEqual(['http://localhost:3000']);
    expect(snapshot.projects[0].surface?.web?.history).not.toBe(
      state.projects[0].surface?.web?.history,
    );
  });
});
