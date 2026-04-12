import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('./platform', () => ({
  isWin: false,
}));

import { buildProviderBaseEnv, _resetLoginShellEnvCache } from './provider-env';

beforeEach(() => {
  vi.clearAllMocks();
  _resetLoginShellEnvCache();
  delete process.env.SHELL;
});

describe('buildProviderBaseEnv', () => {
  it('fills missing Claude auth env from the login shell', () => {
    mockExecFileSync.mockReturnValue(
      [
        'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic',
        'ANTHROPIC_AUTH_TOKEN=test-token',
        'UNRELATED=value',
      ].join('\n')
    );

    const env = buildProviderBaseEnv('claude', { PATH: '/usr/bin' });

    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-token');
    expect(env.UNRELATED).toBeUndefined();
  });

  it('does not overwrite explicitly provided env values', () => {
    mockExecFileSync.mockReturnValue(
      [
        'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic',
        'ANTHROPIC_AUTH_TOKEN=shell-token',
      ].join('\n')
    );

    const env = buildProviderBaseEnv('claude', {
      PATH: '/usr/bin',
      ANTHROPIC_AUTH_TOKEN: 'app-token',
    });

    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('app-token');
  });

  it('only imports keys relevant to the selected provider', () => {
    mockExecFileSync.mockReturnValue(
      [
        'OPENAI_API_KEY=openai-key',
        'OPENAI_BASE_URL=https://api.openai.com/v1',
        'ANTHROPIC_AUTH_TOKEN=anthropic-token',
      ].join('\n')
    );

    const env = buildProviderBaseEnv('codex', { PATH: '/usr/bin' });

    expect(env.OPENAI_API_KEY).toBe('openai-key');
    expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  it('imports MiniMax env keys from the login shell when needed', () => {
    mockExecFileSync.mockReturnValue(
      [
        'MINIMAX_API_KEY=minimax-key',
        'MINIMAX_REGION=global',
        'OPENAI_API_KEY=openai-key',
      ].join('\n')
    );

    const env = buildProviderBaseEnv('minimax' as any, { PATH: '/usr/bin' });

    expect(env.MINIMAX_API_KEY).toBe('minimax-key');
    expect(env.MINIMAX_REGION).toBe('global');
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('caches login shell reads across calls', () => {
    mockExecFileSync.mockReturnValue('ANTHROPIC_AUTH_TOKEN=test-token');

    buildProviderBaseEnv('claude', { PATH: '/usr/bin' });
    buildProviderBaseEnv('claude', { PATH: '/usr/bin' });

    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });
});
