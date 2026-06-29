import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadPolicyModule(options?: { isMac?: boolean; isWin?: boolean; home?: string }) {
  vi.resetModules();

  const home = options?.home ?? '/home/test';
  const isMac = options?.isMac ?? false;
  const isWin = options?.isWin ?? false;

  vi.doMock('./store', () => ({
    loadState: () => ({
      activeProjectId: 'p1',
      projects: [{ id: 'p1', path: '/repo/main' }],
    }),
  }));
  vi.doMock('os', () => ({
    homedir: () => home,
  }));
  vi.doMock('./platform', () => ({
    isMac,
    isWin,
  }));

  return import('./ipc-path-policy');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ipc-path-policy platform guards', () => {
  it('allows only the ClaudeCode support directory prefix on macOS', async () => {
    const policy = await loadPolicyModule({ isMac: true, isWin: false, home: '/Users/test' });

    expect(policy.isAllowedReadPath('/Library/Application Support/ClaudeCode/settings.json')).toBe(
      true,
    );
    expect(
      policy.isAllowedReadPath('/Library/Application Support/ClaudeCode/plugins/cache.json'),
    ).toBe(true);
    expect(
      policy.isAllowedReadPath('/Library/Application Support/ClaudeCode Backup/settings.json'),
    ).toBe(false);
  });
});
