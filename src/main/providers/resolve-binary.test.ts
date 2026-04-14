import { describe, expect, it, vi } from 'vitest';

async function loadResolveBinaryModule(isWindows: boolean) {
  vi.resetModules();

  vi.doMock('../platform', () => ({
    isWin: isWindows,
    whichCmd: isWindows ? 'where' : 'which',
  }));
  vi.doMock('os', () => ({
    homedir: () => '/mock/home',
  }));
  vi.doMock('../pty-manager', () => ({
    getFullPath: vi.fn(() => (isWindows ? 'C:\\Tools;C:\\Bin' : '/usr/local/bin:/usr/bin')),
  }));
  vi.doMock('fs', () => ({
    existsSync: vi.fn(() => false),
  }));
  vi.doMock('child_process', () => ({
    execSync: vi.fn(),
  }));

  const module = await import('./resolve-binary');
  const fsModule = await import('fs');
  const childProcessModule = await import('child_process');

  return {
    ...module,
    mockExistsSync: vi.mocked((fsModule as any).existsSync),
    mockExecSync: vi.mocked((childProcessModule as any).execSync),
  };
}

describe('resolve-binary', () => {
  it('prefers non-Windows alias launcher and expands ~ paths', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);

    mockExecSync.mockReturnValue(`alias codex='~/.local/bin/codex-wrapper --fast'\n` as any);
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === '/mock/home/.local/bin/codex-wrapper');

    const cache = { path: null as string | null };
    expect(resolveBinary('codex', cache)).toBe('/mock/home/.local/bin/codex-wrapper');

    // Cached resolution should bypass additional probing.
    mockExecSync.mockReset();
    expect(resolveBinary('codex', cache)).toBe('/mock/home/.local/bin/codex-wrapper');
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('falls back to common non-Windows bin directories when alias executable is missing', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);

    mockExecSync.mockReturnValue(`alias codex='/does/not/exist --flag'\n` as any);
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === '/usr/local/bin/codex');

    const resolved = resolveBinary('codex', { path: null });
    expect(resolved).toBe('/usr/local/bin/codex');
  });

  it('handles Windows extension probing and keeps first where() result line', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(true);

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('C:\\Users\\me\\AppData\\Roaming\\npm\\mmx.cmd\r\nC:\\alt\\mmx.cmd\r\n' as any);

    const resolved = resolveBinary('mmx', { path: null });
    expect(resolved).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\mmx.cmd');
    expect(mockExecSync).toHaveBeenCalledWith(
      'where "mmx"',
      expect.objectContaining({
        env: expect.objectContaining({ PATH: 'C:\\Tools;C:\\Bin' }),
        encoding: 'utf-8',
        timeout: 3000,
      }),
    );
  });

  it('returns binary name fallback when no alias/path/which resolution succeeds', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    expect(resolveBinary('qwen', { path: null })).toBe('qwen');
  });

  it('validateBinaryExists returns guidance when executable cannot be found', async () => {
    const { validateBinaryExists, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });

    expect(validateBinaryExists('codex', 'Codex CLI', 'npm install -g @openai/codex')).toEqual({
      ok: false,
      message:
        'Codex CLI not found.\n\n' +
        'Calder can launch sessions with Codex CLI after it is installed.\n\n' +
        'Install it with:\n' +
        '  npm install -g @openai/codex\n\n' +
        'After installing, restart Calder.',
    });
  });
});
