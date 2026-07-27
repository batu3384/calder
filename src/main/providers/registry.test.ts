import { beforeEach, describe, expect, it } from 'vitest';

import type { CliProviderMeta } from '../../shared/types/provider';
import { _resetCachedPath as resetAntigravityCache } from './antigravity-provider';
import { _resetCachedPath as resetClaudeCache } from './claude-provider';
import { _resetCachedPath as resetCodexCache } from './codex-provider';
import { _resetCachedPath as resetCursorCache } from './cursor-provider';
import type { CliProvider } from './provider';
import {
  getAllProviderMetas,
  getAllProviders,
  getAvailableProviderIds,
  getProvider,
  getProviderMeta,
  initProviders,
  registerProvider,
  SUPPORTED_PROVIDER_IDS,
  unregisterProvider,
} from './registry';
import { _resetPrereqCheckCache } from './resolve-binary';

const fakeMeta: CliProviderMeta = {
  id: 'cursor',
  displayName: 'Cursor CLI',
  binaryName: 'agent',
  capabilities: {
    sessionResume: false,
    costTracking: false,
    contextWindow: false,
    hookStatus: false,
    shiftEnterNewline: false,
    pendingPromptTrigger: 'session-start',
  },
  defaultContextWindowSize: 128_000,
};

function makeFakeProvider(meta: CliProviderMeta, prerequisitesOk = true): CliProvider {
  return {
    meta,
    resolveBinaryPath: () => '/usr/bin/fake',
    getInstallCommand: () => 'fake-install',
    clearBinaryCache: () => {},
    checkBinaryInstalled: () => ({
      ok: prerequisitesOk,
      message: prerequisitesOk ? '' : 'missing',
    }),
    validatePrerequisites: () => ({
      ok: prerequisitesOk,
      message: prerequisitesOk ? '' : 'missing',
    }),
    buildEnv: (_sid, env) => env,
    buildArgs: () => [],
    cleanup: () => {},
    getShiftEnterSequence: () => null,
  };
}

beforeEach(() => {
  resetClaudeCache();
  resetCodexCache();
  resetCursorCache();
  resetAntigravityCache();
  _resetPrereqCheckCache();
  // Re-init to reset registry to only the Claude provider
  initProviders();
});

describe('initProviders', () => {
  it('registers the Claude provider', () => {
    const provider = getProvider('claude');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('claude');
  });

  it('registers the Codex provider', () => {
    const provider = getProvider('codex');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('codex');
  });

  it('registers the Cursor provider', () => {
    const provider = getProvider('cursor');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('cursor');
  });
});

describe('getProvider', () => {
  it('registers the Gemini provider', () => {
    const provider = getProvider('antigravity');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('antigravity');
  });

  it('registers the Cursor provider', () => {
    const provider = getProvider('cursor');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('cursor');
  });

  it('throws for unknown provider ID', () => {
    expect(() => getProvider('unknown-provider' as any)).toThrow(
      'Unknown CLI provider: unknown-provider',
    );
  });
});

describe('registerProvider', () => {
  it('makes a custom provider retrievable', () => {
    const fake = makeFakeProvider(fakeMeta);
    registerProvider(fake);
    expect(getProvider('cursor')).toBe(fake);
  });
});

describe('getAllProviders', () => {
  it('returns all registered providers', () => {
    registerProvider(makeFakeProvider(fakeMeta));
    const all = getAllProviders();
    expect(all.length).toBe(4);
    const ids = all.map((p) => p.meta.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('cursor');
  });
});

describe('getProviderMeta', () => {
  it('returns meta for a given provider ID', () => {
    const meta = getProviderMeta('claude');
    expect(meta.id).toBe('claude');
    expect(meta.displayName).toBe('Claude Code');
  });
});

describe('getAllProviderMetas', () => {
  it('returns meta array for all providers', () => {
    registerProvider(makeFakeProvider(fakeMeta));
    const metas = getAllProviderMetas();
    expect(metas.length).toBe(4);
    expect(metas.map((m) => m.id)).toContain('codex');
    expect(metas.map((m) => m.id)).toContain('antigravity');
    expect(metas.map((m) => m.id)).toContain('cursor');
  });
});

describe('getAvailableProviderIds', () => {
  it('returns only providers whose prerequisites validate successfully', () => {
    for (const id of SUPPORTED_PROVIDER_IDS) {
      unregisterProvider(id);
    }

    const available = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'cursor',
        displayName: 'Cursor Available',
      },
      true,
    );
    const unavailable = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'antigravity',
        displayName: 'Gemini Missing',
      },
      false,
    );

    registerProvider(available);
    registerProvider(unavailable);

    const ids = getAvailableProviderIds();
    expect(ids).toContain('cursor');
    expect(ids).not.toContain('antigravity');
  });

  it('skips providers whose prerequisite check throws unexpectedly', () => {
    for (const id of SUPPORTED_PROVIDER_IDS) {
      unregisterProvider(id);
    }

    const unstable = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'cursor',
        displayName: 'Cursor Unstable',
      },
      true,
    );
    unstable.validatePrerequisites = () => {
      throw new Error('shell probe failed');
    };

    const available = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'codex',
        displayName: 'Codex Available',
      },
      true,
    );

    registerProvider(unstable);
    registerProvider(available);

    let ids: ReturnType<typeof getAvailableProviderIds> = [];
    expect(() => {
      ids = getAvailableProviderIds();
    }).not.toThrow();
    expect(ids).toContain('codex');
    expect(ids).not.toContain('cursor');
  });
});
