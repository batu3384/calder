import type { Mock } from 'vitest';

export function resetBinaryProbeMocks(
  mockExistsSync: Mock<(path: import('node:path').PathLike) => boolean>,
  mockExecSync: Mock<typeof import('child_process').execSync>,
): void {
  mockExistsSync.mockReset();
  mockExecSync.mockReset();
  mockExistsSync.mockReturnValue(false);
  mockExecSync.mockImplementation(() => {
    throw new Error('not found');
  });
}
