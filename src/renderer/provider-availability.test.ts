import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliProviderMeta } from '../shared/types.js';

const providers: CliProviderMeta[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    binaryName: 'claude',
    defaultContextWindowSize: 200_000,
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: true,
      pendingPromptTrigger: 'session-start',
    },
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    binaryName: 'codex',
    defaultContextWindowSize: 200_000,
    capabilities: {
      sessionResume: true,
      costTracking: true,
      contextWindow: true,
      hookStatus: true,
      configReading: true,
      shiftEnterNewline: true,
      pendingPromptTrigger: 'session-start',
    },
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    binaryName: 'gemini',
    defaultContextWindowSize: 1_000_000,
    capabilities: {
      sessionResume: false,
      costTracking: false,
      contextWindow: false,
      hookStatus: false,
      configReading: false,
      shiftEnterNewline: false,
      pendingPromptTrigger: 'first-output',
    },
  },
];

async function loadModule(checks: Partial<Record<(typeof providers)[number]['id'], boolean>> = {}) {
  vi.resetModules();
  const listProviders = vi.fn().mockResolvedValue(providers);
  const checkBinary = vi.fn(async (providerId: string) => ({ ok: checks[providerId as keyof typeof checks] ?? false }));

  vi.stubGlobal('window', {
    calder: {
      provider: {
        listProviders,
        checkBinary,
      },
    },
  });

  const module = await import('./provider-availability.js');
  return { module, listProviders, checkBinary };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provider-availability', () => {
  it('loads provider metadata once and exposes cached display details', async () => {
    const { module, listProviders } = await loadModule();

    await module.loadProviderMetas();
    await module.loadProviderMetas();

    expect(listProviders).toHaveBeenCalledTimes(1);
    expect(module.getCachedProviderMetas()).toEqual(providers);
    expect(module.getProviderCapabilities('codex')).toEqual(providers[1].capabilities);
    expect(module.getProviderCapabilities('blackbox')).toBeNull();
    expect(module.getProviderDisplayName('gemini')).toBe('Gemini CLI');
    expect(module.getProviderDisplayName('blackbox')).toBe('blackbox');
  });

  it('builds an availability snapshot and resolves inline selector visibility', async () => {
    const { module, checkBinary } = await loadModule({ claude: true, codex: true, gemini: false });

    await module.loadProviderAvailability();

    expect(checkBinary).toHaveBeenCalledTimes(3);
    expect(module.hasMultipleAvailableProviders()).toBe(true);

    const snapshot = module.getProviderAvailabilitySnapshot();
    expect(snapshot?.providers).toEqual(providers);
    expect(snapshot?.availability.get('claude')).toBe(true);
    expect(snapshot?.availability.get('gemini')).toBe(false);
    expect(module.shouldRenderInlineProviderSelector(snapshot)).toBe(true);
    expect(module.shouldRenderInlineProviderSelector({
      providers,
      availability: new Map([
        ['claude', true],
        ['codex', false],
        ['gemini', false],
      ]),
    })).toBe(false);
  });

  it('resolves preferred launch and check providers from availability state', async () => {
    const { module } = await loadModule({ claude: false, codex: true, gemini: false });
    await module.loadProviderAvailability();
    const snapshot = module.getProviderAvailabilitySnapshot();

    expect(module.resolvePreferredProviderForLaunch('codex', snapshot)).toBe('codex');
    expect(module.resolvePreferredProviderForLaunch('claude', snapshot)).toBe('codex');
    expect(module.resolvePreferredProviderForLaunch(undefined, snapshot)).toBe('codex');
    expect(module.resolvePreferredProviderForLaunch(undefined, null)).toBe('claude');

    expect(module.resolveProviderForCheck('codex', ['claude', 'codex'], snapshot)).toBe('codex');
    expect(module.resolveProviderForCheck('claude', ['claude', 'gemini'], snapshot)).toBe('claude');
    expect(module.resolveProviderForCheck(undefined, ['gemini', 'claude'], snapshot)).toBe('gemini');
    expect(module.resolveProviderForCheck(undefined, ['gemini', 'claude'], null)).toBe('gemini');
    expect(module.resolveProviderForCheck(undefined, undefined, snapshot)).toBe('codex');
  });
});
