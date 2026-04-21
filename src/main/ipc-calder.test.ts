import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectGovernanceState } from '../shared/types/governance';
import type { CalderIpcOps } from './ipc-calder';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());

const stopProjectContextWatcher = vi.hoisted(() => vi.fn());
const stopProjectWorkflowWatcher = vi.hoisted(() => vi.fn());
const stopProjectTeamContextWatcher = vi.hoisted(() => vi.fn());
const stopProjectReviewWatcher = vi.hoisted(() => vi.fn());
const stopProjectGovernanceWatcher = vi.hoisted(() => vi.fn());
const stopProjectBackgroundTaskWatcher = vi.hoisted(() => vi.fn());
const stopProjectCheckpointWatcher = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
    fromId: vi.fn(() => null),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

vi.mock('./calder-context/watcher', () => ({
  startProjectContextWatcher: vi.fn(() => vi.fn()),
  stopProjectContextWatcher,
}));

vi.mock('./calder-workflows/watcher', () => ({
  startProjectWorkflowWatcher: vi.fn(() => vi.fn()),
  stopProjectWorkflowWatcher,
}));

vi.mock('./calder-team-context/watcher', () => ({
  startProjectTeamContextWatcher: vi.fn(() => vi.fn()),
  stopProjectTeamContextWatcher,
}));

vi.mock('./calder-reviews/watcher', () => ({
  startProjectReviewWatcher: vi.fn(() => vi.fn()),
  stopProjectReviewWatcher,
}));

vi.mock('./calder-governance/watcher', () => ({
  startProjectGovernanceWatcher: vi.fn(() => vi.fn()),
  stopProjectGovernanceWatcher,
}));

vi.mock('./calder-tasks/watcher', () => ({
  startProjectBackgroundTaskWatcher: vi.fn(() => vi.fn()),
  stopProjectBackgroundTaskWatcher,
}));

vi.mock('./calder-checkpoints/watcher', () => ({
  startProjectCheckpointWatcher: vi.fn(() => vi.fn()),
  stopProjectCheckpointWatcher,
}));

import { registerCalderIpcHandlers, resetCalderProjectWatchers } from './ipc-calder';

function createGovernanceState(): ProjectGovernanceState {
  return {
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
}

function isAutoApprovalMode(value: unknown): value is NonNullable<ProjectGovernanceState['autoApproval']>['effectiveMode'] {
  return value === 'off'
    || value === 'edit_only'
    || value === 'edit_plus_safe_tools'
    || value === 'full_auto'
    || value === 'full_auto_unsafe';
}

describe('ipc calder lifecycle + governance handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stops all calder watchers in reset flow', () => {
    resetCalderProjectWatchers();

    expect(stopProjectContextWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectWorkflowWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectTeamContextWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectReviewWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectGovernanceWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectBackgroundTaskWatcher).toHaveBeenCalledTimes(1);
    expect(stopProjectCheckpointWatcher).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid governance auto-approval payloads and accepts project null mode', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn((projectPath: string, _contextLabel: string) => projectPath),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
      getGovernanceState: vi.fn(async () => createGovernanceState()),
      isAutoApprovalMode,
      updateAutoApprovalMode: vi.fn(),
      setSessionAutoApprovalOverride: vi.fn(),
    } satisfies CalderIpcOps;

    registerCalderIpcHandlers(ops);

    const autoApprovalHandlerEntry = mockIpcHandle.mock.calls.find(
      ([channel]) => channel === 'governance:setAutoApprovalMode',
    );
    expect(autoApprovalHandlerEntry).toBeDefined();
    const autoApprovalHandler = autoApprovalHandlerEntry?.[1] as (
      event: unknown,
      projectPath: string,
      scope: 'global' | 'project',
      mode: unknown,
      sessionId?: string,
    ) => Promise<unknown>;

    await expect(autoApprovalHandler({}, '/repo', 'global', null)).rejects.toThrow(
      'Invalid auto-approval update payload.',
    );

    await autoApprovalHandler({}, '/repo', 'project', null, 'session-1');
    expect(ops.updateAutoApprovalMode).toHaveBeenCalledWith('/repo', 'project', null);
    expect(ops.getGovernanceState).toHaveBeenCalledWith('/repo', 'session-1');
  });

  it('rejects invalid governance session override modes', async () => {
    const ops = {
      requireKnownProjectPath: vi.fn((projectPath: string, _contextLabel: string) => projectPath),
      assertProjectGovernanceAllows: vi.fn(async () => {}),
      getGovernanceState: vi.fn(async () => createGovernanceState()),
      isAutoApprovalMode,
      updateAutoApprovalMode: vi.fn(),
      setSessionAutoApprovalOverride: vi.fn(),
    } satisfies CalderIpcOps;

    registerCalderIpcHandlers(ops);

    const sessionOverrideHandlerEntry = mockIpcHandle.mock.calls.find(
      ([channel]) => channel === 'governance:setSessionAutoApprovalOverride',
    );
    expect(sessionOverrideHandlerEntry).toBeDefined();
    const sessionOverrideHandler = sessionOverrideHandlerEntry?.[1] as (
      event: unknown,
      sessionId: string,
      mode: unknown,
    ) => Promise<unknown>;

    await expect(sessionOverrideHandler({}, 'session-2', 'invalid')).rejects.toThrow(
      'Invalid session auto-approval override mode.',
    );
  });
});
