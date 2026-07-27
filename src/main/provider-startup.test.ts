import { describe, expect, it } from 'vitest';

import type { PersistedState } from '../shared/types/project-state';
import type { CliProviderMeta, ProviderId } from '../shared/types/provider';
import {
  analyzeProviderStartup,
  formatMissingProviderDialog,
  formatProviderStartupWarning,
} from './provider-startup';
import type { CliProvider } from './providers/provider';

function makeMeta(id: ProviderId, displayName: string): CliProviderMeta {
  return {
    id,
    displayName,
    binaryName: id,
    capabilities: {
      sessionResume: true,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'session-start',
    },
    defaultContextWindowSize: 128_000,
  };
}

function makeProvider(id: ProviderId, ok: boolean, message = `${id} missing`): CliProvider {
  return {
    meta: makeMeta(id, `${id.toUpperCase()} CLI`),
    resolveBinaryPath: () => id,
    getInstallCommand: () => `install-${id}`,
    clearBinaryCache: () => {},
    checkBinaryInstalled: () => ({ ok, message: ok ? '' : message }),
    validatePrerequisites: () => ({ ok, message: ok ? '' : message }),
    buildEnv: (_sid, env) => env,
    buildArgs: () => [],
    cleanup: () => {},
    getShiftEnterSequence: () => null,
  };
}

function makeState(overrides?: Partial<PersistedState>): PersistedState {
  return {
    version: 2,
    activeProjectId: null,
    projects: [],
    preferences: {
      soundOnSessionWaiting: true,
      notificationsDesktop: true,
      debugMode: false,
      sessionHistoryEnabled: true,
      insightsEnabled: true,
      autoTitleEnabled: true,
      ...overrides?.preferences,
    },
    ...overrides,
  };
}

describe('analyzeProviderStartup', () => {
  it('stays quiet for unrelated optional providers when at least one provider is available', () => {
    const state = makeState();
    const analysis = analyzeProviderStartup(
      [
        makeProvider('codex', true),
        makeProvider('antigravity', false, 'Antigravity CLI not found'),
      ],
      state,
    );

    expect(analysis.blocking).toBe(false);
    expect(analysis.relevantUnavailable).toHaveLength(0);
  });

  it('surfaces an unavailable default provider when a fallback provider exists', () => {
    const state = makeState({
      preferences: {
        soundOnSessionWaiting: true,
        notificationsDesktop: true,
        debugMode: false,
        sessionHistoryEnabled: true,
        insightsEnabled: true,
        autoTitleEnabled: true,
        defaultProvider: 'antigravity',
      },
    });

    const analysis = analyzeProviderStartup(
      [
        makeProvider('codex', true),
        makeProvider('antigravity', false, 'Antigravity CLI not found'),
      ],
      state,
    );

    expect(analysis.blocking).toBe(false);
    expect(analysis.relevantUnavailable.map((result) => result.provider.meta.id)).toEqual([
      'antigravity',
    ]);
    expect(analysis.relevantUnavailable[0]?.reasons).toEqual(['default-provider']);
  });

  it('surfaces an unavailable provider referenced by saved sessions', () => {
    const state = makeState({
      projects: [
        {
          id: 'project-1',
          name: 'Project',
          path: '/tmp/project',
          activeSessionId: 'session-1',
          layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
          sessions: [
            {
              id: 'session-1',
              name: 'Cursor',
              providerId: 'cursor',
              cliSessionId: null,
              createdAt: '2026-04-12T10:00:00.000Z',
            },
          ],
        },
      ],
    });

    const analysis = analyzeProviderStartup(
      [makeProvider('codex', true), makeProvider('cursor', false, 'Cursor CLI not found')],
      state,
    );

    expect(analysis.relevantUnavailable.map((result) => result.provider.meta.id)).toEqual([
      'cursor',
    ]);
    expect(analysis.relevantUnavailable[0]?.reasons).toEqual(['saved-session']);
  });

  it('blocks startup only when every provider is unavailable', () => {
    const analysis = analyzeProviderStartup(
      [
        makeProvider('claude', false, 'Claude Code not found'),
        makeProvider('codex', false, 'Codex CLI not found'),
      ],
      makeState(),
    );

    expect(analysis.blocking).toBe(true);
    expect(analysis.relevantUnavailable).toHaveLength(2);
  });
});

describe('formatters', () => {
  it('describes why an unavailable provider still matters', () => {
    const [result] = analyzeProviderStartup(
      [makeProvider('antigravity', false, 'Antigravity CLI not found')],
      makeState({
        preferences: {
          soundOnSessionWaiting: true,
          notificationsDesktop: true,
          debugMode: false,
          sessionHistoryEnabled: true,
          insightsEnabled: true,
          autoTitleEnabled: true,
          defaultProvider: 'antigravity',
        },
      }),
    ).relevantUnavailable;

    expect(formatProviderStartupWarning(result!)).toContain('your default provider');
    expect(formatProviderStartupWarning(result!)).toContain('Antigravity CLI not found');
  });

  it('formats the blocking dialog details for all unavailable providers', () => {
    const unavailable = analyzeProviderStartup(
      [
        makeProvider('claude', false, 'Claude Code not found'),
        makeProvider('codex', false, 'Codex CLI not found'),
      ],
      makeState(),
    ).unavailable;

    const details = formatMissingProviderDialog(unavailable);
    expect(details).toContain('CLAUDE CLI');
    expect(details).toContain('CODEX CLI');
  });
});
