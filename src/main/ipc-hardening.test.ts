import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedGuestMessagePayload } from './ipc-app-browser';
import { sanitizePersistedStateForSave } from './ipc-state-sanitizer';
import type { PersistedState } from '../shared/types';

function makeBaseState(): PersistedState {
  const createdAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
  return {
    version: 1,
    activeProjectId: 'project-1',
    preferences: {
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      debugMode: false,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
      defaultProvider: 'claude',
    },
    projects: [
      {
        id: 'project-1',
        name: 'Browser',
        path: './tmp/browser-project',
        sessions: [
          {
            id: 'session-1',
            name: 'Main',
            providerId: 'claude',
            cliSessionId: null,
            createdAt,
          },
          {
            id: 'session-2',
            name: 'Web',
            type: 'browser-tab',
            cliSessionId: null,
            createdAt,
            browserTargetSessionId: 'session-1',
            browserTabUrl: 'about:blank',
          },
        ],
        activeSessionId: 'session-1',
        layout: {
          mode: 'mosaic',
          splitPanes: [],
          splitDirection: 'horizontal',
        },
      },
    ],
  };
}

describe('ipc hardening helpers', () => {
  it('sanitizes and normalizes valid state payloads', () => {
    const sanitized = sanitizePersistedStateForSave(makeBaseState());
    expect(path.isAbsolute(sanitized.projects[0].path)).toBe(true);
  });

  it('rejects duplicate project ids', () => {
    const state = makeBaseState();
    state.projects.push({
      ...state.projects[0],
      path: './tmp/another-project',
    });

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/duplicate project.id/i);
  });

  it('rejects dangling activeProjectId references', () => {
    const state = makeBaseState();
    state.activeProjectId = 'missing-project';

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/activeProjectId does not match/i);
  });

  it('rejects dangling browser target session references', () => {
    const state = makeBaseState();
    state.projects[0].sessions[1].browserTargetSessionId = 'missing-session';

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/browserTargetSessionId is missing/i);
  });

  it('rejects unsupported provider ids in sessions', () => {
    const state = makeBaseState();
    state.projects[0].sessions[0].providerId = 'not-a-provider' as never;

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/unsupported session.providerId/i);
  });

  it('allows no-arg webview control channels without args', () => {
    expect(isAllowedGuestMessagePayload('enter-inspect-mode', [])).toBe(true);
    expect(isAllowedGuestMessagePayload('draw-clear', [])).toBe(true);
  });

  it('rejects no-arg channels when args are provided', () => {
    expect(isAllowedGuestMessagePayload('enter-inspect-mode', [{ bad: true }])).toBe(false);
  });

  it('accepts auth-fill payloads with bounded string fields', () => {
    expect(isAllowedGuestMessagePayload('auth-fill-credentials', [{
      username: 'demo@example.com',
      password: 'secret',
    }])).toBe(true);
  });

  it('rejects auth-fill payloads with non-string fields', () => {
    expect(isAllowedGuestMessagePayload('auth-fill-credentials', [{
      username: 123,
      password: 'secret',
    }])).toBe(false);
  });

  it('rejects oversized flow replay payloads', () => {
    const hugePayload = {
      selector: `#${'a'.repeat(1_500_000)}`,
    };
    expect(isAllowedGuestMessagePayload('flow-do-click', [hugePayload])).toBe(false);
  });
});
