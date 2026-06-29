import path from 'node:path';

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
  vi.doMock('../full-path', () => ({
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
    const aliasPath = path.join('/mock/home', '.local', 'bin', 'codex-wrapper');

    mockExecSync.mockReturnValue(`alias codex='~/.local/bin/codex-wrapper --fast'\n` as any);
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === aliasPath);

    const cache = { path: null as string | null };
    expect(resolveBinary('codex', cache)).toBe(aliasPath);

    // Cached resolution should bypass additional probing.
    mockExecSync.mockReset();
    expect(resolveBinary('codex', cache)).toBe(aliasPath);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('falls back to common non-Windows bin directories when alias executable is missing', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);
    const fallbackPath = path.join('/usr/local/bin', 'codex');

    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "codex"')) {
        return `alias codex='/does/not/exist --flag'\n` as any;
      }
      throw new Error('not found in PATH');
    });
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === fallbackPath);

    const resolved = resolveBinary('codex', { path: null });
    expect(resolved).toBe(fallbackPath);
  });

  it('prefers the login-shell PATH result before fixed common directories', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(false);
    const homebrewPath = '/opt/homebrew/bin/gemini';
    const shellPath = '/mock/home/.npm-global/bin/gemini';

    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === homebrewPath);
    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "antigravity"')) return `${shellPath}\n` as any;
      if (String(command).startsWith('which "antigravity"')) return `${shellPath}\n` as any;
      throw new Error(`unexpected command: ${String(command)}`);
    });

    expect(resolveBinary('antigravity', { path: null })).toBe(shellPath);
  });

  it('handles Windows extension probing and keeps first where() result line', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync } = await loadResolveBinaryModule(true);

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockReturnValue('C:\\Users\\me\\AppData\\Roaming\\npm\\qwen.cmd\r\nC:\\alt\\qwen.cmd\r\n' as any);

    const resolved = resolveBinary('qwen', { path: null });
    expect(resolved).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\qwen.cmd');
    expect(mockExecSync).toHaveBeenCalledWith(
      'where "qwen"',
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

  it('re-checks binary detection when cached result is stale and binary becomes available', async () => {
    const { validateBinaryExists, _resetPrereqCheckCache, mockExecSync, mockExistsSync } = await loadResolveBinaryModule(false);

    _resetPrereqCheckCache();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    const first = validateBinaryExists('claude', 'Claude Code CLI', 'npm install -g @anthropic-ai/claude-code');
    expect(first.ok).toBe(false);

    // Simulate installation finishing immediately after first check.
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate).includes('/usr/local/bin/claude'));
    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "claude"')) return '/usr/local/bin/claude\n';
      if (String(command).includes('which "claude"')) return '/usr/local/bin/claude\n';
      throw new Error('unexpected command');
    });

    const second = validateBinaryExists('claude', 'Claude Code CLI', 'npm install -g @anthropic-ai/claude-code');
    expect(second.ok).toBe(true);
    expect(second.message).toBe('');
    expect(mockExecSync).toHaveBeenCalled();
  });
});
