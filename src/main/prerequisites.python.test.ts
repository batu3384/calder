import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

async function loadPrerequisitesModule(isWindows: boolean) {
  vi.resetModules();

  vi.doMock('./platform', () => ({
    isWin: isWindows,
    pathSep: isWindows ? ';' : ':',
    whichCmd: isWindows ? 'where' : 'which',
  }));
  vi.doMock('os', () => ({
    homedir: () => '/mock/home',
  }));
  vi.doMock('fs', () => ({
    existsSync: vi.fn(() => false),
  }));
  vi.doMock('child_process', () => ({
    execSync: vi.fn(),
  }));

  const module = await import('./prerequisites');
  const fsModule = await import('fs');
  const childProcessModule = await import('child_process');

  return {
    ...module,
    mockExistsSync: vi.mocked((fsModule as any).existsSync),
    mockExecSync: vi.mocked((childProcessModule as any).execSync),
  };
}

describe('checkPythonAvailable (Windows-specific behavior)', () => {
  it('returns null when python is available on Windows', async () => {
    const { checkPythonAvailable, mockExecSync } = await loadPrerequisitesModule(true);
    mockExecSync.mockReturnValue('Python 3.12.0\n' as any);

    expect(checkPythonAvailable()).toBeNull();
    expect(mockExecSync).toHaveBeenCalledWith('python --version', {
      encoding: 'utf-8',
      timeout: 3000,
      stdio: 'pipe',
    });
  });

  it('returns actionable guidance when python is missing on Windows', async () => {
    const { checkPythonAvailable, mockExecSync } = await loadPrerequisitesModule(true);
    mockExecSync.mockImplementation(() => {
      throw new Error('python not found');
    });

    const warning = checkPythonAvailable();
    expect(warning).toContain('Python not found');
    expect(warning).toContain('winget install Python.Python.3');
  });
});

describe('validatePrerequisites (Windows candidate probing)', () => {
  it('detects claude.cmd in the Windows npm directory', async () => {
    const { validatePrerequisites, mockExistsSync } = await loadPrerequisitesModule(true);
    const expected = path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'claude.cmd');

    mockExistsSync.mockImplementation((candidate: unknown) => String(candidate) === expected);

    expect(validatePrerequisites()).toEqual({ ok: true, message: '' });
  });
});
