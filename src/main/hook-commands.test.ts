import { afterEach, describe, expect, it, vi } from 'vitest';

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const STATUS_DIR = '/tmp/calder-status';

async function loadHookCommands(options?: { isWin?: boolean; pythonBin?: string }) {
  vi.resetModules();
  mockFs.existsSync.mockReset();
  mockFs.mkdirSync.mockReset();
  mockFs.writeFileSync.mockReset();

  vi.doMock('fs', () => mockFs);
  vi.doMock('./hook-status', () => ({
    STATUS_DIR,
  }));
  vi.doMock('./platform', () => ({
    isWin: options?.isWin ?? false,
    pythonBin: options?.pythonBin ?? '/usr/bin/python3',
  }));

  return import('./hook-commands');
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('fs');
  vi.doUnmock('./hook-status');
  vi.doUnmock('./platform');
});

describe('hook-commands', () => {
  it('writes event helper scripts into the status directory', async () => {
    const module = await loadHookCommands();

    module.installEventScript('custom.py', 'print("ok")');

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(STATUS_DIR, { recursive: true });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(`${STATUS_DIR}/custom.py`, 'print("ok")');
  });

  it('installs shared hook scripts once and skips reinstall when already present', async () => {
    const module = await loadHookCommands();
    mockFs.existsSync.mockReturnValue(false);

    module.installHookScripts();
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3);

    mockFs.writeFileSync.mockClear();
    mockFs.existsSync.mockReturnValue(true);
    module.installHookScripts();
    expect(mockFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('builds a shell-based status command on POSIX', async () => {
    const module = await loadHookCommands();

    expect(module.statusCmd('pre_tool_use', 'pending', 'SESSION_ID', '# hook')).toBe(
      `sh -c 'mkdir -p ${STATUS_DIR} && echo pre_tool_use:pending > ${STATUS_DIR}/$SESSION_ID.status # hook'`,
    );
  });

  it('builds a python-based status command on Windows', async () => {
    const module = await loadHookCommands({ isWin: true, pythonBin: 'python' });

    expect(module.statusCmd('pre_tool_use', 'pending', 'SESSION_ID', '# hook')).toBe(
      `python "${STATUS_DIR}/status_writer.py" "pre_tool_use" "pending" "SESSION_ID" "${STATUS_DIR}" "# hook"`,
    );
  });

  it('generates capture commands using the configured python binary and status directory', async () => {
    const module = await loadHookCommands({ pythonBin: '/opt/python3' });

    expect(module.captureSessionIdCmd('SESSION_ID', '# hook')).toBe(
      `/opt/python3 "${STATUS_DIR}/session_id_capture.py" "SESSION_ID" "${STATUS_DIR}" "# hook"`,
    );
    expect(module.captureToolFailureCmd('SESSION_ID', '# hook')).toBe(
      `/opt/python3 "${STATUS_DIR}/tool_failure_capture.py" "SESSION_ID" "${STATUS_DIR}" "# hook"`,
    );
    expect(module.wrapPythonHookCmd('custom.py', 'ignored', '# hook')).toBe(
      `/opt/python3 "${STATUS_DIR}/custom.py" "# hook"`,
    );
  });
});
