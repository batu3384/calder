import type { Mock } from 'vitest';

type SpawnSyncResult = ReturnType<typeof import('child_process').spawnSync>;

export function resetBinaryProbeMocks(
  mockExistsSync: Mock<(path: import('node:path').PathLike) => boolean>,
  mockExecSync: Mock<typeof import('child_process').execSync>,
  mockSpawnSync?: Mock<typeof import('child_process').spawnSync>,
): void {
  mockExistsSync.mockReset();
  mockExecSync.mockReset();
  mockExistsSync.mockReturnValue(false);
  mockExecSync.mockImplementation(() => {
    throw new Error('not found');
  });

  if (!mockSpawnSync) return;
  mockSpawnSync.mockReset();
  mockSpawnSync.mockImplementation((binaryPath: unknown) => {
    if (mockExistsSync(binaryPath as import('node:path').PathLike)) {
      return { status: 0 } as SpawnSyncResult;
    }
    return { status: 1 } as SpawnSyncResult;
  });
}
