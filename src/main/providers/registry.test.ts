import { beforeEach, describe, expect, it } from 'vitest';

import type { CliProviderMeta } from '../../shared/types/provider';
import type { CliProvider } from './provider';
import {
  getAllProviderMetas,
  getAllProviders,
  getAvailableProviderIds,
  getProvider,
  getProviderMeta,
  initProviders,
  registerProvider,
} from './registry';

const fakeMeta: CliProviderMeta = {
  id: 'copilot',
  displayName: 'Copilot CLI',
  binaryName: 'copilot',
  capabilities: {
    sessionResume: false,
    costTracking: false,
    contextWindow: false,
    hookStatus: false,
    configReading: false,
    shiftEnterNewline: false,
    pendingPromptTrigger: 'session-start',
  },
  defaultContextWindowSize: 128_000,
};

function makeFakeProvider(meta: CliProviderMeta, prerequisitesOk = true): CliProvider {
  return {
    meta,
    resolveBinaryPath: () => '/usr/bin/fake',
    validatePrerequisites: () => ({
      ok: prerequisitesOk,
      message: prerequisitesOk ? '' : 'missing',
    }),
    buildEnv: (_sid, env) => env,
    buildArgs: () => [],
    installHooks: async () => {},
    installStatusScripts: () => {},
    cleanup: () => {},
    getConfig: async () => ({ mcpServers: [], agents: [], skills: [], commands: [] }),
    getShiftEnterSequence: () => null,
    validateSettings: () => ({ statusLine: 'calder', hooks: 'complete', hookDetails: {} }),
    reinstallSettings: () => {},
  };
}

beforeEach(() => {
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

  it('registers the Copilot provider', () => {
    const provider = getProvider('copilot');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('copilot');
  });
});

describe('getProvider', () => {
  it('registers the Gemini provider', () => {
    const provider = getProvider('antigravity');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('antigravity');
  });

  it('registers the Qwen provider', () => {
    const provider = getProvider('qwen');
    expect(provider).toBeDefined();
    expect(provider.meta.id).toBe('qwen');
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
    expect(getProvider('copilot')).toBe(fake);
  });
});

describe('getAllProviders', () => {
  it('returns all registered providers', () => {
    registerProvider(makeFakeProvider(fakeMeta));
    const all = getAllProviders();
    expect(all.length).toBe(5);
    const ids = all.map((p) => p.meta.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('copilot');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('qwen');
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
    expect(metas.length).toBe(5);
    expect(metas.map((m) => m.id)).toContain('codex');
    expect(metas.map((m) => m.id)).toContain('copilot');
    expect(metas.map((m) => m.id)).toContain('antigravity');
    expect(metas.map((m) => m.id)).toContain('qwen');
  });
});

describe('getAvailableProviderIds', () => {
  it('returns only providers whose prerequisites validate successfully', () => {
    const available = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'copilot',
        displayName: 'Copilot Available',
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
    expect(ids).toContain('copilot');
    expect(ids).not.toContain('antigravity');
  });

  it('skips providers whose prerequisite check throws unexpectedly', () => {
    const unstable = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'qwen',
        displayName: 'Qwen Unstable',
      },
      true,
    );
    unstable.validatePrerequisites = () => {
      throw new Error('shell probe failed');
    };

    const available = makeFakeProvider(
      {
        ...fakeMeta,
        id: 'copilot',
        displayName: 'Copilot Available',
      },
      true,
    );

    registerProvider(unstable);
    registerProvider(available);

    let ids: ReturnType<typeof getAvailableProviderIds> = [];
    expect(() => {
      ids = getAvailableProviderIds();
    }).not.toThrow();
    expect(ids).toContain('copilot');
    expect(ids).not.toContain('qwen');
  });
});
