import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockOpenPath = vi.hoisted(() => vi.fn());

const mockCheckoutGitBranch = vi.hoisted(() => vi.fn());
const mockCreateGitBranch = vi.hoisted(() => vi.fn());
const mockGetGitDiff = vi.hoisted(() => vi.fn());
const mockGetGitFiles = vi.hoisted(() => vi.fn());
const mockGetGitRemoteUrl = vi.hoisted(() => vi.fn());
const mockGetGitStatus = vi.hoisted(() => vi.fn());
const mockGetGitWorktrees = vi.hoisted(() => vi.fn());
const mockGitDiscardFile = vi.hoisted(() => vi.fn());
const mockGitStageFile = vi.hoisted(() => vi.fn());
const mockGitUnstageFile = vi.hoisted(() => vi.fn());
const mockListGitBranches = vi.hoisted(() => vi.fn());

const mockNotifyGitChanged = vi.hoisted(() => vi.fn());
const mockStartGitWatcher = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  shell: {
    openPath: mockOpenPath,
  },
}));

vi.mock('./git-status', () => ({
  checkoutGitBranch: mockCheckoutGitBranch,
  createGitBranch: mockCreateGitBranch,
  getGitDiff: mockGetGitDiff,
  getGitFiles: mockGetGitFiles,
  getGitRemoteUrl: mockGetGitRemoteUrl,
  getGitStatus: mockGetGitStatus,
  getGitWorktrees: mockGetGitWorktrees,
  gitDiscardFile: mockGitDiscardFile,
  gitStageFile: mockGitStageFile,
  gitUnstageFile: mockGitUnstageFile,
  listGitBranches: mockListGitBranches,
}));

vi.mock('./git-watcher', () => ({
  notifyGitChanged: mockNotifyGitChanged,
  startGitWatcher: mockStartGitWatcher,
}));

import { registerGitIpcHandlers } from './ipc-git';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

function getOnHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.on registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

describe('ipc git handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates read-only git handlers and openInEditor path resolution', async () => {
    const ops = { assertProjectGovernanceAllows: vi.fn(async () => {}) };
    mockGetGitStatus.mockReturnValue({ branch: 'main' });
    mockGetGitRemoteUrl.mockReturnValue('git@github.com:owner/repo.git');
    mockGetGitFiles.mockReturnValue([{ filePath: 'src/app.ts' }]);
    mockGetGitDiff.mockReturnValue('diff --git a b');
    mockGetGitWorktrees.mockReturnValue([{ path: '/repo' }]);
    mockListGitBranches.mockReturnValue(['main', 'feature/x']);
    mockOpenPath.mockResolvedValue('');

    registerGitIpcHandlers(ops);

    const getStatus = getHandleHandler('git:getStatus');
    const getRemoteUrl = getHandleHandler('git:getRemoteUrl');
    const getFiles = getHandleHandler('git:getFiles');
    const getDiff = getHandleHandler('git:getDiff');
    const getWorktrees = getHandleHandler('git:getWorktrees');
    const listBranches = getHandleHandler('git:listBranches');
    const openInEditor = getHandleHandler('git:openInEditor');

    expect(await getStatus({}, '/repo')).toEqual({ branch: 'main' });
    expect(await getRemoteUrl({}, '/repo')).toBe('git@github.com:owner/repo.git');
    expect(await getFiles({}, '/repo')).toEqual([{ filePath: 'src/app.ts' }]);
    expect(await getDiff({}, '/repo', 'src/app.ts', 'working')).toBe('diff --git a b');
    expect(await getWorktrees({}, '/repo')).toEqual([{ path: '/repo' }]);
    expect(await listBranches({}, '/repo')).toEqual(['main', 'feature/x']);
    await openInEditor({}, '/repo', 'src/app.ts');

    expect(mockGetGitStatus).toHaveBeenCalledWith('/repo');
    expect(mockGetGitRemoteUrl).toHaveBeenCalledWith('/repo');
    expect(mockGetGitFiles).toHaveBeenCalledWith('/repo');
    expect(mockGetGitDiff).toHaveBeenCalledWith('/repo', 'src/app.ts', 'working');
    expect(mockGetGitWorktrees).toHaveBeenCalledWith('/repo');
    expect(mockListGitBranches).toHaveBeenCalledWith('/repo');
    expect(mockOpenPath).toHaveBeenCalledWith(path.join('/repo', 'src/app.ts'));
  });

  it('enforces governance on mutating git operations and notifies after changes', async () => {
    const ops = { assertProjectGovernanceAllows: vi.fn(async () => {}) };
    registerGitIpcHandlers(ops);

    const stageFile = getHandleHandler('git:stageFile');
    const unstageFile = getHandleHandler('git:unstageFile');
    const discardFile = getHandleHandler('git:discardFile');
    const checkoutBranch = getHandleHandler('git:checkoutBranch');
    const createBranch = getHandleHandler('git:createBranch');

    await stageFile({}, '/repo', 'src/a.ts');
    await unstageFile({}, '/repo', 'src/a.ts');
    await discardFile({}, '/repo', 'src/a.ts', 'working');
    await checkoutBranch({}, '/repo', 'feature/x');
    await createBranch({}, '/repo', 'feature/y');

    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', { kind: 'write', label: 'Stage git file' });
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', { kind: 'write', label: 'Unstage git file' });
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', { kind: 'write', label: 'Discard git file changes' });
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', { kind: 'write', label: 'Checkout git branch' });
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', { kind: 'write', label: 'Create git branch' });
    expect(mockGitStageFile).toHaveBeenCalledWith('/repo', 'src/a.ts');
    expect(mockGitUnstageFile).toHaveBeenCalledWith('/repo', 'src/a.ts');
    expect(mockGitDiscardFile).toHaveBeenCalledWith('/repo', 'src/a.ts', 'working');
    expect(mockCheckoutGitBranch).toHaveBeenCalledWith('/repo', 'feature/x');
    expect(mockCreateGitBranch).toHaveBeenCalledWith('/repo', 'feature/y');
    expect(mockNotifyGitChanged).toHaveBeenCalledTimes(5);
  });

  it('starts git project watcher only when a window exists', () => {
    const ops = { assertProjectGovernanceAllows: vi.fn(async () => {}) };
    registerGitIpcHandlers(ops);

    const watchProject = getOnHandler('git:watchProject');
    const win = { id: 1 };

    mockGetAllWindows.mockReturnValue([win]);
    watchProject({}, '/repo');
    expect(mockStartGitWatcher).toHaveBeenCalledWith(win, '/repo');

    mockStartGitWatcher.mockClear();
    mockGetAllWindows.mockReturnValue([]);
    watchProject({}, '/repo');
    expect(mockStartGitWatcher).not.toHaveBeenCalled();
  });
});

