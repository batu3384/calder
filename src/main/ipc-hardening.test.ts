import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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

  it('rejects unsupported preferences default providers', () => {
    const state = makeBaseState();
    state.preferences.defaultProvider = 'not-a-provider' as never;

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/unsupported preferences.defaultProvider/i);
  });

  it('rejects duplicate project paths after normalization', () => {
    const state = makeBaseState();
    state.projects.push({
      ...state.projects[0],
      id: 'project-2',
      name: 'Browser 2',
      path: state.projects[0].path,
      sessions: [{
        ...state.projects[0].sessions[0],
        id: 'session-3',
      }],
      activeSessionId: 'session-3',
    });
    state.activeProjectId = 'project-2';

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/duplicate project.path/i);
  });

  it('rejects duplicate session ids within a project', () => {
    const state = makeBaseState();
    state.projects[0].sessions.push({
      ...state.projects[0].sessions[0],
      name: 'Duplicate',
    });

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/duplicate session.id/i);
  });

  it('rejects dangling active session references in a project', () => {
    const state = makeBaseState();
    state.projects[0].activeSessionId = 'missing-session';

    expect(() => sanitizePersistedStateForSave(state)).toThrow(/activeSessionId is missing/i);
  });

  it('rejects invalid session metadata values', () => {
    const invalidDateState = makeBaseState();
    invalidDateState.projects[0].sessions[0].createdAt = 'not-a-date';
    expect(() => sanitizePersistedStateForSave(invalidDateState)).toThrow(/session.createdAt must be a valid date/i);

    const invalidTypeState = makeBaseState();
    invalidTypeState.projects[0].sessions[0].type = 'invalid-type' as never;
    expect(() => sanitizePersistedStateForSave(invalidTypeState)).toThrow(/unsupported session.type/i);
  });

  it('validates optional session string fields when present', () => {
    const state = makeBaseState();
    state.projects[0].sessions[0].args = '';
    state.projects[0].sessions[0].diffFilePath = '';
    state.projects[0].sessions[0].worktreePath = '';
    state.projects[0].sessions[0].fileReaderPath = '';

    const sanitized = sanitizePersistedStateForSave(state);
    expect(sanitized.projects[0].sessions[0].args).toBe('');
    expect(sanitized.projects[0].sessions[0].diffFilePath).toBe('');
    expect(sanitized.projects[0].sessions[0].worktreePath).toBe('');
    expect(sanitized.projects[0].sessions[0].fileReaderPath).toBe('');
  });

  it('rejects empty, NUL-byte, and oversized string fields', () => {
    const emptyNameState = makeBaseState();
    emptyNameState.projects[0].name = '   ';
    expect(() => sanitizePersistedStateForSave(emptyNameState)).toThrow(/must not be empty/i);

    const nulNameState = makeBaseState();
    nulNameState.projects[0].sessions[0].name = 'bad\0name';
    expect(() => sanitizePersistedStateForSave(nulNameState)).toThrow(/contains NUL byte/i);

    const longPathState = makeBaseState();
    longPathState.projects[0].path = `./${'a'.repeat(5_000)}`;
    expect(() => sanitizePersistedStateForSave(longPathState)).toThrow(/exceeds max length/i);
  });

  it('rejects malformed top-level payloads', () => {
    expect(() => sanitizePersistedStateForSave(null)).toThrow(/expected object/i);

    const badVersion = makeBaseState() as unknown as Record<string, unknown>;
    badVersion.version = 2;
    expect(() => sanitizePersistedStateForSave(badVersion)).toThrow(/unsupported version/i);

    const badProjects = makeBaseState() as unknown as Record<string, unknown>;
    badProjects.projects = 'not-an-array';
    expect(() => sanitizePersistedStateForSave(badProjects)).toThrow(/projects must be an array/i);

    const tooManyProjects = makeBaseState();
    tooManyProjects.projects = Array.from({ length: 501 }, (_value, index) => ({
      ...makeBaseState().projects[0],
      id: `project-${index}`,
      name: `Project ${index}`,
      path: `./tmp/project-${index}`,
      sessions: [{
        ...makeBaseState().projects[0].sessions[0],
        id: `session-${index}`,
      }],
      activeSessionId: `session-${index}`,
    }));
    tooManyProjects.activeProjectId = tooManyProjects.projects[0].id;
    expect(() => sanitizePersistedStateForSave(tooManyProjects)).toThrow(/project count exceeds limit/i);

    const malformedProjects = makeBaseState() as unknown as Record<string, unknown>;
    malformedProjects.projects = [{
      id: 'project-x',
      name: 'Broken',
      path: './tmp/broken',
      activeSessionId: null,
      sessions: [{ id: 's1' }],
    }];
    expect(() => sanitizePersistedStateForSave(malformedProjects)).toThrow(/projects are malformed/i);

    const invalidActiveProjectIdType = makeBaseState() as unknown as Record<string, unknown>;
    invalidActiveProjectIdType.activeProjectId = 123;
    expect(() => sanitizePersistedStateForSave(invalidActiveProjectIdType)).toThrow(/activeProjectId must be string or null/i);

    const invalidPreferences = makeBaseState() as unknown as Record<string, unknown>;
    invalidPreferences.preferences = { soundOnSessionWaiting: true };
    expect(() => sanitizePersistedStateForSave(invalidPreferences)).toThrow(/preferences are malformed/i);
  });

  it('rejects oversized serialized payloads', () => {
    const state = makeBaseState();
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockReturnValue('x'.repeat(26 * 1024 * 1024));
    try {
      expect(() => sanitizePersistedStateForSave(state)).toThrow(/serialized state is too large/i);
    } finally {
      stringifySpy.mockRestore();
    }
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
