import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectGovernanceState } from '../shared/types/governance';
import type { CalderIpcOps } from './ipc-calder';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockBrowserWindowFromWebContents = vi.hoisted(() => vi.fn());
const mockBrowserWindowGetAllWindows = vi.hoisted(() => vi.fn());
const mockBrowserWindowFromId = vi.hoisted(() => vi.fn());
const mockShowOpenDialog = vi.hoisted(() => vi.fn());

const mockDiscoverProjectContext = vi.hoisted(() => vi.fn());
const mockCreateProjectContextStarterFiles = vi.hoisted(() => vi.fn());
const mockCreateProjectContextRuleFile = vi.hoisted(() => vi.fn());
const mockDeleteProjectContextRuleFile = vi.hoisted(() => vi.fn());
const mockRenameProjectContextRuleFile = vi.hoisted(() => vi.fn());

const mockDiscoverProjectWorkflows = vi.hoisted(() => vi.fn());
const mockCreateProjectWorkflowStarterFiles = vi.hoisted(() => vi.fn());
const mockCreateProjectWorkflowFile = vi.hoisted(() => vi.fn());
const mockReadProjectWorkflowFile = vi.hoisted(() => vi.fn());

const mockDiscoverProjectTeamContext = vi.hoisted(() => vi.fn());
const mockCreateProjectTeamContextStarterFiles = vi.hoisted(() => vi.fn());
const mockCreateProjectTeamContextSpaceFile = vi.hoisted(() => vi.fn());

const mockDiscoverProjectReviews = vi.hoisted(() => vi.fn());
const mockCreateProjectReviewFile = vi.hoisted(() => vi.fn());
const mockReadProjectReviewFile = vi.hoisted(() => vi.fn());

const mockCreateProjectGovernanceStarterPolicy = vi.hoisted(() => vi.fn());

const mockDiscoverProjectBackgroundTasks = vi.hoisted(() => vi.fn());
const mockCreateProjectBackgroundTaskFile = vi.hoisted(() => vi.fn());
const mockReadProjectBackgroundTaskFile = vi.hoisted(() => vi.fn());

const mockDiscoverProjectCheckpoints = vi.hoisted(() => vi.fn());
const mockCreateProjectCheckpointFile = vi.hoisted(() => vi.fn());
const mockReadProjectCheckpointFile = vi.hoisted(() => vi.fn());

const mockStartProjectContextWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectContextWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectWorkflowWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectWorkflowWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectTeamContextWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectTeamContextWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectReviewWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectReviewWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectGovernanceWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectGovernanceWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectBackgroundTaskWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectBackgroundTaskWatcher = vi.hoisted(() => vi.fn());
const mockStartProjectCheckpointWatcher = vi.hoisted(() => vi.fn());
const mockStopProjectCheckpointWatcher = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    fromWebContents: mockBrowserWindowFromWebContents,
    getAllWindows: mockBrowserWindowGetAllWindows,
    fromId: mockBrowserWindowFromId,
  },
  dialog: {
    showOpenDialog: mockShowOpenDialog,
  },
}));

vi.mock('./calder-context/discovery', () => ({
  discoverProjectContext: mockDiscoverProjectContext,
}));

vi.mock('./calder-context/scaffold', () => ({
  createProjectContextStarterFiles: mockCreateProjectContextStarterFiles,
  createProjectContextRuleFile: mockCreateProjectContextRuleFile,
  deleteProjectContextRuleFile: mockDeleteProjectContextRuleFile,
  renameProjectContextRuleFile: mockRenameProjectContextRuleFile,
}));

vi.mock('./calder-context/watcher', () => ({
  startProjectContextWatcher: mockStartProjectContextWatcher,
  stopProjectContextWatcher: mockStopProjectContextWatcher,
}));

vi.mock('./calder-workflows/discovery', () => ({
  discoverProjectWorkflows: mockDiscoverProjectWorkflows,
}));

vi.mock('./calder-workflows/scaffold', () => ({
  createProjectWorkflowFile: mockCreateProjectWorkflowFile,
  createProjectWorkflowStarterFiles: mockCreateProjectWorkflowStarterFiles,
}));

vi.mock('./calder-workflows/read', () => ({
  readProjectWorkflowFile: mockReadProjectWorkflowFile,
}));

vi.mock('./calder-workflows/watcher', () => ({
  startProjectWorkflowWatcher: mockStartProjectWorkflowWatcher,
  stopProjectWorkflowWatcher: mockStopProjectWorkflowWatcher,
}));

vi.mock('./calder-team-context/discovery', () => ({
  discoverProjectTeamContext: mockDiscoverProjectTeamContext,
}));

vi.mock('./calder-team-context/scaffold', () => ({
  createProjectTeamContextSpaceFile: mockCreateProjectTeamContextSpaceFile,
  createProjectTeamContextStarterFiles: mockCreateProjectTeamContextStarterFiles,
}));

vi.mock('./calder-team-context/watcher', () => ({
  startProjectTeamContextWatcher: mockStartProjectTeamContextWatcher,
  stopProjectTeamContextWatcher: mockStopProjectTeamContextWatcher,
}));

vi.mock('./calder-reviews/discovery', () => ({
  discoverProjectReviews: mockDiscoverProjectReviews,
}));

vi.mock('./calder-reviews/scaffold', () => ({
  createProjectReviewFile: mockCreateProjectReviewFile,
}));

vi.mock('./calder-reviews/read', () => ({
  readProjectReviewFile: mockReadProjectReviewFile,
}));

vi.mock('./calder-reviews/watcher', () => ({
  startProjectReviewWatcher: mockStartProjectReviewWatcher,
  stopProjectReviewWatcher: mockStopProjectReviewWatcher,
}));

vi.mock('./calder-governance/scaffold', () => ({
  createProjectGovernanceStarterPolicy: mockCreateProjectGovernanceStarterPolicy,
}));

vi.mock('./calder-governance/watcher', () => ({
  startProjectGovernanceWatcher: mockStartProjectGovernanceWatcher,
  stopProjectGovernanceWatcher: mockStopProjectGovernanceWatcher,
}));

vi.mock('./calder-tasks/discovery', () => ({
  discoverProjectBackgroundTasks: mockDiscoverProjectBackgroundTasks,
}));

vi.mock('./calder-tasks/scaffold', () => ({
  createProjectBackgroundTaskFile: mockCreateProjectBackgroundTaskFile,
}));

vi.mock('./calder-tasks/read', () => ({
  readProjectBackgroundTaskFile: mockReadProjectBackgroundTaskFile,
}));

vi.mock('./calder-tasks/watcher', () => ({
  startProjectBackgroundTaskWatcher: mockStartProjectBackgroundTaskWatcher,
  stopProjectBackgroundTaskWatcher: mockStopProjectBackgroundTaskWatcher,
}));

vi.mock('./calder-checkpoints/discovery', () => ({
  discoverProjectCheckpoints: mockDiscoverProjectCheckpoints,
}));

vi.mock('./calder-checkpoints/scaffold', () => ({
  createProjectCheckpointFile: mockCreateProjectCheckpointFile,
  readProjectCheckpointFile: mockReadProjectCheckpointFile,
}));

vi.mock('./calder-checkpoints/watcher', () => ({
  startProjectCheckpointWatcher: mockStartProjectCheckpointWatcher,
  stopProjectCheckpointWatcher: mockStopProjectCheckpointWatcher,
}));

import { registerCalderIpcHandlers, resetCalderProjectWatchers } from './ipc-calder';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  return call[1] as (...args: any[]) => any;
}

function getOnHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`Missing ipcMain.on registration for ${channel}`);
  return call[1] as (...args: any[]) => any;
}

function createWindow(id: number, supportsOff = true): any {
  const listeners = new Map<string, () => void>();
  const win: any = {
    id,
    webContents: {
      send: vi.fn(),
    },
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    }),
    removeListener: vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
    __listeners: listeners,
  };
  if (supportsOff) {
    win.off = vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    });
  }
  return win;
}

function isAutoApprovalMode(value: unknown): value is NonNullable<ProjectGovernanceState['autoApproval']>['effectiveMode'] {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe';
}

function createOps() {
  const governanceState: ProjectGovernanceState = {
    autoApproval: {
      globalMode: 'off',
      projectMode: undefined,
      sessionMode: undefined,
      effectiveMode: 'off',
      policySource: 'global',
      safeToolProfile: 'default-read-only',
      recentDecisions: [],
    },
  };

  const ops = {
    requireKnownProjectPath: vi.fn((projectPath: string, _contextLabel: string) => projectPath),
    assertProjectGovernanceAllows: vi.fn(async () => {}),
    getGovernanceState: vi.fn(async () => governanceState),
    isAutoApprovalMode,
    updateAutoApprovalMode: vi.fn(),
    setSessionAutoApprovalOverride: vi.fn(),
  } satisfies CalderIpcOps;

  return ops;
}

describe('ipc calder runtime handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCalderProjectWatchers();

    mockDiscoverProjectContext.mockResolvedValue({ rootRules: [] });
    mockCreateProjectContextStarterFiles.mockResolvedValue({ created: ['context'] });
    mockCreateProjectContextRuleFile.mockResolvedValue({ path: '.calder/rules/rule.md' });
    mockDeleteProjectContextRuleFile.mockResolvedValue({ deleted: true });
    mockRenameProjectContextRuleFile.mockResolvedValue({ renamed: true });

    mockDiscoverProjectWorkflows.mockResolvedValue({ workflows: [] });
    mockCreateProjectWorkflowStarterFiles.mockResolvedValue({ created: ['workflow'] });
    mockCreateProjectWorkflowFile.mockResolvedValue({ path: '.calder/workflows/wf.md' });
    mockReadProjectWorkflowFile.mockResolvedValue({ content: '# Workflow' });

    mockDiscoverProjectTeamContext.mockResolvedValue({ spaces: [] });
    mockCreateProjectTeamContextStarterFiles.mockResolvedValue({ created: ['team-context'] });
    mockCreateProjectTeamContextSpaceFile.mockResolvedValue({ path: '.calder/team-context/space.md' });

    mockDiscoverProjectReviews.mockResolvedValue({ reviews: [] });
    mockCreateProjectReviewFile.mockResolvedValue({ path: '.calder/reviews/review.md' });
    mockReadProjectReviewFile.mockResolvedValue({ content: '# Review' });

    mockCreateProjectGovernanceStarterPolicy.mockResolvedValue({ path: '.calder/governance/policy.md' });

    mockDiscoverProjectBackgroundTasks.mockResolvedValue({ tasks: [] });
    mockCreateProjectBackgroundTaskFile.mockResolvedValue({ path: '.calder/tasks/task.md' });
    mockReadProjectBackgroundTaskFile.mockResolvedValue({ content: '# Task' });

    mockDiscoverProjectCheckpoints.mockResolvedValue({ checkpoints: [] });
    mockCreateProjectCheckpointFile.mockResolvedValue({ path: '.calder/checkpoints/cp.md' });
    mockReadProjectCheckpointFile.mockResolvedValue({ content: '# Checkpoint' });

    mockStartProjectContextWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectWorkflowWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectTeamContextWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectReviewWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectGovernanceWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectBackgroundTaskWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());
    mockStartProjectCheckpointWatcher.mockImplementation((_projectPath, _onChange) => vi.fn());

    mockBrowserWindowFromWebContents.mockReturnValue(null);
    mockBrowserWindowGetAllWindows.mockReturnValue([]);
    mockBrowserWindowFromId.mockReturnValue(null);
    mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  });

  it('routes calder handle channels through discovery/scaffold/read and governance ops', async () => {
    const ops = createOps();
    registerCalderIpcHandlers(ops);

    await expect(getHandleHandler('context:getProjectState')({}, '/repo')).resolves.toEqual({ rootRules: [] });
    await getHandleHandler('context:createStarterFiles')({}, '/repo');
    await getHandleHandler('context:createSharedRule')({}, '/repo', 'Rule One', 'hard');
    await getHandleHandler('context:renameSharedRule')({}, '/repo', 'rules/rule.md', 'Rule Two', 'soft');
    await getHandleHandler('context:deleteSharedRule')({}, '/repo', 'rules/rule.md');

    await expect(getHandleHandler('workflow:getProjectState')({}, '/repo')).resolves.toEqual({ workflows: [] });
    await getHandleHandler('workflow:createStarterFiles')({}, '/repo');
    await getHandleHandler('workflow:createFile')({}, '/repo', 'WF');
    await expect(getHandleHandler('workflow:readFile')({}, '/repo', 'wf.md')).resolves.toEqual({ content: '# Workflow' });

    await expect(getHandleHandler('teamContext:getProjectState')({}, '/repo')).resolves.toEqual({ spaces: [] });
    await getHandleHandler('teamContext:createStarterFiles')({}, '/repo');
    await getHandleHandler('teamContext:createSpace')({}, '/repo', 'Team');

    await expect(getHandleHandler('review:getProjectState')({}, '/repo')).resolves.toEqual({ reviews: [] });
    await getHandleHandler('review:createFile')({}, '/repo', 'Review');
    await expect(getHandleHandler('review:readFile')({}, '/repo', 'review.md')).resolves.toEqual({ content: '# Review' });

    await getHandleHandler('governance:getProjectState')({}, '/repo', 'session-1');
    await getHandleHandler('governance:createStarterPolicy')({}, '/repo');
    await getHandleHandler('governance:setAutoApprovalMode')({}, '/repo', 'global', 'off', 'session-2');
    await expect(getHandleHandler('governance:setSessionAutoApprovalOverride')({}, 'session-3', 'off')).resolves.toEqual({ ok: true });

    await expect(getHandleHandler('task:getProjectState')({}, '/repo')).resolves.toEqual({ tasks: [] });
    await getHandleHandler('task:create')({}, '/repo', 'Task Title', 'Task Prompt');
    await expect(getHandleHandler('task:read')({}, '/repo', 'task.md')).resolves.toEqual({ content: '# Task' });

    await expect(getHandleHandler('checkpoint:getProjectState')({}, '/repo')).resolves.toEqual({ checkpoints: [] });
    await getHandleHandler('checkpoint:create')({}, '/repo', { snapshot: true });
    await expect(getHandleHandler('checkpoint:read')({}, '/repo', 'checkpoint.md')).resolves.toEqual({ content: '# Checkpoint' });

    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', {
      kind: 'write',
      label: 'Create context starter files',
    });
    expect(ops.requireKnownProjectPath).toHaveBeenCalledWith('/repo', 'Create context starter files');
    expect(ops.assertProjectGovernanceAllows).toHaveBeenCalledWith('/repo', {
      kind: 'write',
      label: 'Create workflow file',
    });
    expect(ops.updateAutoApprovalMode).toHaveBeenCalledWith('/repo', 'global', 'off');
    expect(ops.setSessionAutoApprovalOverride).toHaveBeenCalledWith('session-3', 'off');
  });

  it('rejects mutating handlers when project path is unknown', async () => {
    const ops = createOps();
    ops.requireKnownProjectPath.mockImplementation((_: string, label: string) => {
      throw new Error(`${label} requires a known project path`);
    });
    registerCalderIpcHandlers(ops);

    await expect(getHandleHandler('workflow:createFile')({}, '/outside', 'WF')).rejects.toThrow(
      'Create workflow file requires a known project path',
    );
    expect(ops.assertProjectGovernanceAllows).not.toHaveBeenCalled();
    expect(mockCreateProjectWorkflowFile).not.toHaveBeenCalled();
  });

  it('binds watchers, emits changed events, handles rebind/close, and resets bindings', () => {
    const ops = createOps();
    registerCalderIpcHandlers(ops);

    const winWithOff = createWindow(7, true);
    const winWithoutOff = createWindow(11, false);

    let contextOnChange: ((state: unknown) => void) | undefined;
    const firstContextDispose = vi.fn();
    const secondContextDispose = vi.fn();
    mockStartProjectContextWatcher
      .mockImplementationOnce((_projectPath: string, onChange: (state: unknown) => void) => {
        contextOnChange = onChange;
        return firstContextDispose;
      })
      .mockImplementationOnce((_projectPath: string, _onChange: (state: unknown) => void) => secondContextDispose);

    const firstWorkflowDispose = vi.fn();
    const secondWorkflowDispose = vi.fn();
    mockStartProjectWorkflowWatcher
      .mockImplementationOnce((_projectPath: string, _onChange: (state: unknown) => void) => firstWorkflowDispose)
      .mockImplementationOnce((_projectPath: string, _onChange: (state: unknown) => void) => secondWorkflowDispose);

    mockBrowserWindowFromWebContents.mockReturnValue(winWithOff);
    mockBrowserWindowFromId.mockImplementation((id: number) => (id === winWithOff.id ? winWithOff : null));

    const onContextWatch = getOnHandler('context:watchProject');
    onContextWatch({ sender: { id: 'sender' } }, '/repo-a');
    expect(mockStartProjectContextWatcher).toHaveBeenCalledTimes(1);

    contextOnChange?.({ changed: true });
    expect(winWithOff.webContents.send).toHaveBeenCalledWith('context:changed', '/repo-a', { changed: true });

    onContextWatch({ sender: { id: 'sender' } }, '/repo-a');
    expect(mockStartProjectContextWatcher).toHaveBeenCalledTimes(1);

    const staleClosedListener = winWithOff.__listeners.get('closed') as (() => void) | undefined;
    onContextWatch({ sender: { id: 'sender' } }, '/repo-b');
    expect(winWithOff.off).toHaveBeenCalled();
    expect(firstContextDispose).toHaveBeenCalledTimes(1);

    staleClosedListener?.();
    expect(secondContextDispose).toHaveBeenCalledTimes(0);

    const activeClosedListener = winWithOff.__listeners.get('closed') as (() => void) | undefined;
    activeClosedListener?.();
    expect(secondContextDispose).toHaveBeenCalledTimes(1);

    mockBrowserWindowFromWebContents.mockReturnValue(winWithoutOff);
    mockBrowserWindowFromId.mockImplementation((id: number) => (id === winWithoutOff.id ? winWithoutOff : null));

    const onWorkflowWatch = getOnHandler('workflow:watchProject');
    onWorkflowWatch({ sender: { id: 'workflow-sender' } }, '/repo-workflow-a');
    onWorkflowWatch({ sender: { id: 'workflow-sender' } }, '/repo-workflow-b');
    expect(winWithoutOff.removeListener).toHaveBeenCalled();
    expect(firstWorkflowDispose).toHaveBeenCalledTimes(1);

    mockBrowserWindowFromWebContents.mockReturnValue(null);
    mockBrowserWindowGetAllWindows.mockReturnValue([winWithOff]);
    mockBrowserWindowFromId.mockImplementation((id: number) => (id === winWithOff.id ? winWithOff : null));

    getOnHandler('teamContext:watchProject')({ sender: {} }, '/repo-team');
    getOnHandler('review:watchProject')({ sender: {} }, '/repo-review');
    getOnHandler('governance:watchProject')({ sender: {} }, '/repo-gov');
    getOnHandler('task:watchProject')({ sender: {} }, '/repo-task');
    getOnHandler('checkpoint:watchProject')({ sender: {} }, '/repo-checkpoint');

    mockBrowserWindowGetAllWindows.mockReturnValue([]);
    getOnHandler('context:watchProject')({ sender: {} }, '/repo-none');
    expect(mockStartProjectContextWatcher).toHaveBeenCalledTimes(2);

    resetCalderProjectWatchers();
    expect(mockStopProjectContextWatcher).toHaveBeenCalled();
    expect(mockStopProjectWorkflowWatcher).toHaveBeenCalled();
    expect(mockStopProjectTeamContextWatcher).toHaveBeenCalled();
    expect(mockStopProjectReviewWatcher).toHaveBeenCalled();
    expect(mockStopProjectGovernanceWatcher).toHaveBeenCalled();
    expect(mockStopProjectBackgroundTaskWatcher).toHaveBeenCalled();
    expect(mockStopProjectCheckpointWatcher).toHaveBeenCalled();
  });

  it('returns expected values for fs:browseDirectory with missing window, canceled, and success', async () => {
    const ops = createOps();
    registerCalderIpcHandlers(ops);

    const browseDirectory = getHandleHandler('fs:browseDirectory');
    mockBrowserWindowGetAllWindows.mockReturnValue([]);
    await expect(browseDirectory({})).resolves.toBeNull();

    const win = createWindow(31, true);
    mockBrowserWindowGetAllWindows.mockReturnValue([win]);

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(browseDirectory({})).resolves.toBeNull();

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(browseDirectory({})).resolves.toBeNull();

    mockShowOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/projects/browser'] });
    await expect(browseDirectory({})).resolves.toBe('/projects/browser');
    expect(mockShowOpenDialog).toHaveBeenCalledWith(win, { properties: ['openDirectory'] });
  });
});
