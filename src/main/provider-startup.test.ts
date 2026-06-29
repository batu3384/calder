import { describe, expect, it, vi } from 'vitest';

import type { PersistedState } from '../shared/types/project-state';
import type { CliProviderMeta, ProviderId } from '../shared/types/provider';
import {
  analyzeProviderStartup,
  formatMissingProviderDialog,
  formatProviderStartupWarning,
  installProviderStartupArtifacts,
} from './provider-startup';
import type { CliProvider } from './providers/provider';

vi.mock('./external-hook-policy', () => ({
  EXTERNAL_HOOK_INJECTION_ENABLED: true,
  cleanupAllExternalProviderHooks: vi.fn(),
}));

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
      configReading: false,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'session-start',
    },
    defaultContextWindowSize: 128_000,
  };
}

function makeProvider(
  id: ProviderId,
  ok: boolean,
  message = `${id} missing`,
  overrides?: Partial<Pick<CliProvider, 'installHooks' | 'installStatusScripts'>>,
): CliProvider {
  return {
    meta: makeMeta(id, `${id.toUpperCase()} CLI`),
    resolveBinaryPath: () => id,
    validatePrerequisites: () => ({ ok, message: ok ? '' : message }),
    buildEnv: (_sid, env) => env,
    buildArgs: () => [],
    installHooks: overrides?.installHooks ?? (async () => {}),
    installStatusScripts: overrides?.installStatusScripts ?? (() => {}),
    cleanup: () => {},
    getConfig: async () => ({ mcpServers: [], agents: [], skills: [], commands: [] }),
    getShiftEnterSequence: () => null,
    validateSettings: () => ({ statusLine: 'missing', hooks: 'missing', hookDetails: {} }),
    reinstallSettings: () => {},
  };
}

function makeState(overrides?: Partial<PersistedState>): PersistedState {
  return {
    version: 1,
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
              name: 'Qwen',
              providerId: 'qwen',
              cliSessionId: null,
              createdAt: '2026-04-12T10:00:00.000Z',
            },
          ],
        },
      ],
    });

    const analysis = analyzeProviderStartup(
      [makeProvider('codex', true), makeProvider('qwen', false, 'Qwen Code not found')],
      state,
    );

    expect(analysis.relevantUnavailable.map((result) => result.provider.meta.id)).toEqual(['qwen']);
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

describe('installProviderStartupArtifacts', () => {
  it('continues to install startup artifacts when one provider hook install fails', async () => {
    const failHooks = vi.fn(async () => {
      throw new Error('hook install failed');
    });
    const failStatus = vi.fn();
    const nextHooks = vi.fn(async () => {});
    const nextStatus = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        installProviderStartupArtifacts([
          makeProvider('codex', true, '', {
            installHooks: failHooks,
            installStatusScripts: failStatus,
          }),
          makeProvider('claude', true, '', {
            installHooks: nextHooks,
            installStatusScripts: nextStatus,
          }),
        ]),
      ).resolves.toBeUndefined();

      expect(failHooks).toHaveBeenCalledTimes(1);
      expect(failStatus).not.toHaveBeenCalled();
      expect(nextHooks).toHaveBeenCalledTimes(1);
      expect(nextStatus).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('CODEX CLI');
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('codex');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('continues to install startup artifacts when one provider status script install fails', async () => {
    const failHooks = vi.fn(async () => {});
    const failStatus = vi.fn(() => {
      throw new Error('status script install failed');
    });
    const nextHooks = vi.fn(async () => {});
    const nextStatus = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(
        installProviderStartupArtifacts([
          makeProvider('qwen', true, '', {
            installHooks: failHooks,
            installStatusScripts: failStatus,
          }),
          makeProvider('claude', true, '', {
            installHooks: nextHooks,
            installStatusScripts: nextStatus,
          }),
        ]),
      ).resolves.toBeUndefined();

      expect(failHooks).toHaveBeenCalledTimes(1);
      expect(failStatus).toHaveBeenCalledTimes(1);
      expect(nextHooks).toHaveBeenCalledTimes(1);
      expect(nextStatus).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('QWEN CLI');
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('qwen');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
