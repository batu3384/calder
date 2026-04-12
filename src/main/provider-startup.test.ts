import { describe, expect, it } from 'vitest';
import type { PersistedState, CliProviderMeta, ProviderId } from '../shared/types';
import type { CliProvider } from './providers/provider';
import { analyzeProviderStartup, formatProviderStartupWarning, formatMissingProviderDialog } from './provider-startup';

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

function makeProvider(id: ProviderId, ok: boolean, message = `${id} missing`): CliProvider {
  return {
    meta: makeMeta(id, `${id.toUpperCase()} CLI`),
    resolveBinaryPath: () => id,
    validatePrerequisites: () => ({ ok, message: ok ? '' : message }),
    buildEnv: (_sid, env) => env,
    buildArgs: () => [],
    installHooks: async () => {},
    installStatusScripts: () => {},
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
    const analysis = analyzeProviderStartup([
      makeProvider('codex', true),
      makeProvider('blackbox', false, 'Blackbox CLI not found'),
    ], state);

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
        defaultProvider: 'blackbox',
      },
    });

    const analysis = analyzeProviderStartup([
      makeProvider('codex', true),
      makeProvider('blackbox', false, 'Blackbox CLI not found'),
    ], state);

    expect(analysis.blocking).toBe(false);
    expect(analysis.relevantUnavailable.map(result => result.provider.meta.id)).toEqual(['blackbox']);
    expect(analysis.relevantUnavailable[0]?.reasons).toEqual(['default-provider']);
  });

  it('surfaces an unavailable provider referenced by saved sessions', () => {
    const state = makeState({
      projects: [{
        id: 'project-1',
        name: 'Project',
        path: '/tmp/project',
        activeSessionId: 'session-1',
        layout: { mode: 'tabs', splitPanes: [], splitDirection: 'horizontal' },
        sessions: [{
          id: 'session-1',
          name: 'Qwen',
          providerId: 'qwen',
          cliSessionId: null,
          createdAt: '2026-04-12T10:00:00.000Z',
        }],
      }],
    });

    const analysis = analyzeProviderStartup([
      makeProvider('codex', true),
      makeProvider('qwen', false, 'Qwen Code not found'),
    ], state);

    expect(analysis.relevantUnavailable.map(result => result.provider.meta.id)).toEqual(['qwen']);
    expect(analysis.relevantUnavailable[0]?.reasons).toEqual(['saved-session']);
  });

  it('blocks startup only when every provider is unavailable', () => {
    const analysis = analyzeProviderStartup([
      makeProvider('claude', false, 'Claude Code not found'),
      makeProvider('codex', false, 'Codex CLI not found'),
    ], makeState());

    expect(analysis.blocking).toBe(true);
    expect(analysis.relevantUnavailable).toHaveLength(2);
  });
});

describe('formatters', () => {
  it('describes why an unavailable provider still matters', () => {
    const [result] = analyzeProviderStartup([
      makeProvider('blackbox', false, 'Blackbox CLI not found'),
    ], makeState({
      preferences: {
        soundOnSessionWaiting: true,
        notificationsDesktop: true,
        debugMode: false,
        sessionHistoryEnabled: true,
        insightsEnabled: true,
        autoTitleEnabled: true,
        defaultProvider: 'blackbox',
      },
    })).relevantUnavailable;

    expect(formatProviderStartupWarning(result!)).toContain('your default provider');
    expect(formatProviderStartupWarning(result!)).toContain('Blackbox CLI not found');
  });

  it('formats the blocking dialog details for all unavailable providers', () => {
    const unavailable = analyzeProviderStartup([
      makeProvider('claude', false, 'Claude Code not found'),
      makeProvider('codex', false, 'Codex CLI not found'),
    ], makeState()).unavailable;

    const details = formatMissingProviderDialog(unavailable);
    expect(details).toContain('CLAUDE CLI');
    expect(details).toContain('CODEX CLI');
  });
});
