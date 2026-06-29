import { vi } from 'vitest';

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
}));

vi.mock('node-pty', () => ({
  default: { spawn: mockSpawn },
  spawn: mockSpawn,
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => {
    throw new Error('not found');
  }),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
  tmpdir: () => '/tmp',
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
  readdirSync: vi.fn(() => {
    throw new Error('ENOENT');
  }),
}));

vi.mock('./browser-bridge', () => ({
  buildBrowserBridgeEnv: vi.fn((cwd: string, env: Record<string, string>) => ({
    ...env,
    CALDER_BROWSER_BRIDGE_CWD: cwd,
  })),
}));

import { _resetLoginShellEnvCache } from './provider-env';
import { initProviders } from './providers/registry';
import { killAllPtys,spawnPty } from './pty-manager';

function createMockPtyProcess() {
  const proc = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  };
  return proc;
}

beforeEach(() => {
  killAllPtys();
  vi.clearAllMocks();
  _resetLoginShellEnvCache();
  initProviders();
});

describe('spawnPty initialPrompt integration', () => {
  it('spawns claude with spaced initialPrompt without sanitize failure', () => {
    const proc = createMockPtyProcess();
    mockSpawn.mockReturnValue(proc);

    spawnPty('session-1', '/project', null, false, '', 'claude', 'fix the bug', vi.fn(), vi.fn());

    expect(mockSpawn).toHaveBeenCalledWith(
      'claude',
      ['fix the bug'],
      expect.objectContaining({ cwd: '/project' }),
    );
  });

  it('rejects initialPrompt with shell metacharacters', () => {
    expect(() =>
      spawnPty('session-1', '/project', null, false, '', 'claude', 'fix; rm -rf /', vi.fn(), vi.fn()),
    ).toThrow(/Invalid initial prompt/i);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
