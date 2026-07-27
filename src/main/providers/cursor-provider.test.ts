import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWin } from '../platform';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../full-path', () => ({
  getFullPath: vi.fn(() => (isWin ? '/usr/local/bin;/usr/bin' : '/usr/local/bin:/usr/bin')),
}));

import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';

import { resetBinaryProbeMocks } from '../../test-support/reset-binary-probe-mocks';
import { _resetCachedPath, CursorProvider } from './cursor-provider';
import { _resetPrereqCheckCache } from './resolve-binary';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockExecSync = vi.mocked(execSync);
const mockSpawnSync = vi.mocked(spawnSync);

let provider: CursorProvider;

beforeEach(() => {
  vi.clearAllMocks();
  resetBinaryProbeMocks(mockExistsSync, mockExecSync, mockSpawnSync);
  _resetCachedPath();
  _resetPrereqCheckCache();
  provider = new CursorProvider();
});

describe('CursorProvider', () => {
  it('resolves agent binary path', () => {
    const candidate = isWin
      ? path.join('/mock/home', 'AppData', 'Roaming', 'npm', 'agent.cmd')
      : '/usr/local/bin/agent';
    mockExistsSync.mockImplementation((value) => value === candidate);

    expect(provider.resolveBinaryPath()).toBe(candidate);
  });

  it('builds resume arguments with session id', () => {
    expect(
      provider.buildArgs({ cliSessionId: 'session-1', isResume: true, extraArgs: '' }),
    ).toEqual(['--resume', 'session-1']);
  });

  it('passes initial prompt as trailing argument', () => {
    expect(
      provider.buildArgs({
        cliSessionId: null,
        isResume: false,
        extraArgs: '',
        initialPrompt: 'Fix the bug',
      }),
    ).toEqual(['Fix the bug']);
  });

  it('validates that agent binary exists', () => {
    mockExistsSync.mockImplementation((value) => String(value) === '/resolved/agent');
    mockExecSync.mockReturnValue('/resolved/agent\n' as never);

    expect(provider.validatePrerequisites()).toEqual({ ok: true, message: '' });
  });
});
