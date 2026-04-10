import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'child_process';
import { getTrackedFiles } from './utils';

const mockExecSync = vi.mocked(execSync);

describe('getTrackedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('silences git stderr when checking tracked files for non-repo paths', () => {
    mockExecSync.mockReturnValue('src/index.ts\nREADME.md\n' as any);

    const files = getTrackedFiles('/project');

    expect(files).toEqual(['src/index.ts', 'README.md']);
    expect(mockExecSync).toHaveBeenCalledWith('git ls-files', {
      cwd: '/project',
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  });

  it('returns an empty list when git ls-files fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });

    expect(getTrackedFiles('/not-a-repo')).toEqual([]);
  });
});
