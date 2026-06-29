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
    spawnSync: vi.fn(),
  }));

  const module = await import('./resolve-binary');
  const fsModule = await import('fs');
  const childProcessModule = await import('child_process');

  const mockSpawnSync = vi.mocked((childProcessModule as any).spawnSync);

  return {
    ...module,
    mockExistsSync: vi.mocked((fsModule as any).existsSync),
    mockExecSync: vi.mocked((childProcessModule as any).execSync),
    mockSpawnSync,
  };
}

describe('resolve-binary', () => {
  function wireLaunchProbes(
    mockExistsSync: ReturnType<typeof loadResolveBinaryModule> extends Promise<infer T>
      ? T extends { mockExistsSync: infer M }
        ? M
        : never
      : never,
    mockSpawnSync: ReturnType<typeof loadResolveBinaryModule> extends Promise<infer T>
      ? T extends { mockSpawnSync: infer M }
        ? M
        : never
      : never,
  ): void {
    mockSpawnSync.mockImplementation((binaryPath: unknown) => {
      if (mockExistsSync(binaryPath as string)) {
        return { status: 0 };
      }
      return { status: 1 };
    });
  }

  it('prefers non-Windows alias launcher and expands ~ paths', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);
    const aliasPath = path.join('/mock/home', '.local', 'bin', 'codex-wrapper');

    mockExecSync.mockReturnValue(`alias codex='~/.local/bin/codex-wrapper --fast'\n` as any);
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === aliasPath);
    wireLaunchProbes(mockExistsSync, mockSpawnSync);

    const cache = { path: null as string | null };
    expect(resolveBinary('codex', cache)).toBe(aliasPath);

    // Cached resolution should bypass additional probing.
    mockExecSync.mockReset();
    expect(resolveBinary('codex', cache)).toBe(aliasPath);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('falls back to common non-Windows bin directories when alias executable is missing', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);
    const fallbackPath = path.join('/usr/local/bin', 'codex');

    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "codex"')) {
        return `alias codex='/does/not/exist --flag'\n` as any;
      }
      throw new Error('not found in PATH');
    });
    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === fallbackPath);
    wireLaunchProbes(mockExistsSync, mockSpawnSync);

    const resolved = resolveBinary('codex', { path: null });
    expect(resolved).toBe(fallbackPath);
  });

  it('prefers the login-shell PATH result before fixed common directories', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);
    const homebrewPath = '/opt/homebrew/bin/gemini';
    const shellPath = '/mock/home/.npm-global/bin/gemini';

    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === shellPath);
    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "antigravity"')) return `${shellPath}\n` as any;
      if (String(command).startsWith('which "antigravity"')) return `${shellPath}\n` as any;
      throw new Error(`unexpected command: ${String(command)}`);
    });
    wireLaunchProbes(mockExistsSync, mockSpawnSync);

    expect(resolveBinary('antigravity', { path: null })).toBe(shellPath);
  });

  it('skips broken wrappers and prefers the next launchable candidate', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);
    const brokenPath = path.join('/mock/home', '.local', 'bin', 'copilot');
    const goodPath = path.join('/mock/home', '.npm-global', 'bin', 'copilot');

    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).startsWith('which "copilot"')) return `${brokenPath}\n` as any;
      throw new Error(`unexpected command: ${String(command)}`);
    });
    mockExistsSync.mockImplementation((candidate: unknown) => {
      const value = String(candidate);
      return value === brokenPath || value === goodPath;
    });
    mockSpawnSync.mockImplementation((binaryPath: unknown) => {
      if (String(binaryPath) === goodPath) return { status: 0 };
      return { status: 1 };
    });

    expect(resolveBinary('copilot', { path: null })).toBe(goodPath);
  });

  it('handles Windows extension probing and keeps first where() result line', async () => {
    const { resolveBinary, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(true);
    const resolvedPath = 'C:\\Users\\me\\AppData\\Roaming\\npm\\qwen.cmd';

    mockExistsSync.mockImplementation((candidate) => String(candidate) === resolvedPath);
    mockExecSync.mockReturnValue(`${resolvedPath}\r\nC:\\alt\\qwen.cmd\r\n` as any);
    wireLaunchProbes(mockExistsSync, mockSpawnSync);

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
    const { validateBinaryExists, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);

    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockSpawnSync.mockReturnValue({ status: 1 });

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
    const { validateBinaryExists, _resetPrereqCheckCache, mockExecSync, mockExistsSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);

    _resetPrereqCheckCache();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
    mockSpawnSync.mockReturnValue({ status: 1 });
    const first = validateBinaryExists(
      'claude',
      'Claude Code CLI',
      'npm install -g @anthropic-ai/claude-code',
    );
    expect(first.ok).toBe(false);

    // Simulate installation finishing immediately after first check.
    mockExistsSync.mockImplementation((candidate: unknown) =>
      String(candidate).includes('/usr/local/bin/claude'),
    );
    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('command -v "claude"')) return '/usr/local/bin/claude\n';
      if (String(command).includes('which "claude"')) return '/usr/local/bin/claude\n';
      throw new Error('unexpected command');
    });
    mockSpawnSync.mockImplementation((binaryPath: unknown) => {
      if (String(binaryPath).includes('/usr/local/bin/claude')) return { status: 0 };
      return { status: 1 };
    });

    const second = validateBinaryExists(
      'claude',
      'Claude Code CLI',
      'npm install -g @anthropic-ai/claude-code',
    );
    expect(second.ok).toBe(true);
    expect(second.message).toBe('');
    expect(mockExecSync).toHaveBeenCalled();
  });

  it('treats an on-disk binary as installed when launch probe fails', async () => {
    const { validateBinaryExists, mockExistsSync, mockExecSync, mockSpawnSync } =
      await loadResolveBinaryModule(false);
    const claudePath = '/usr/local/bin/claude';

    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === claudePath);
    mockExecSync.mockImplementation((command: unknown) => {
      if (String(command).includes('which "claude"')) return `${claudePath}\n`;
      throw new Error('not found');
    });
    mockSpawnSync.mockReturnValue({ status: 127 });

    expect(
      validateBinaryExists('claude', 'Claude Code CLI', 'npm install -g @anthropic-ai/claude-code'),
    ).toEqual({ ok: true, message: '' });
  });
});
