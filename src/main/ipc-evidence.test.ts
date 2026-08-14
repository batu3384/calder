import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockReadMeta = vi.hoisted(() => vi.fn());
const mockReadEvents = vi.hoisted(() => vi.fn());
const mockReplayEvidenceTail = vi.hoisted(() => vi.fn());
const mockResolveEvidenceRunId = vi.hoisted(() => vi.fn());
const mockOnCrashRecover = vi.hoisted(() => vi.fn());
const mockSetEvidenceEventNotifier = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  dialog: {
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
  },
}));

vi.mock('./calder-evidence/coordinator.js', () => ({
  getActiveRunId: vi.fn(),
  getEvidenceSettings: vi.fn(),
  onCrashRecover: mockOnCrashRecover,
  setEvidenceEventNotifier: mockSetEvidenceEventNotifier,
  setEvidenceSettings: vi.fn(),
}));

vi.mock('./calder-evidence/evidence-replay.js', () => ({
  replayEvidenceTail: mockReplayEvidenceTail,
}));

vi.mock('./calder-evidence/export.js', () => ({
  exportEvidenceRun: vi.fn(),
}));

vi.mock('./calder-evidence/finalization.js', () => ({
  rebuildSummary: vi.fn(),
}));

vi.mock('./calder-evidence/health.js', () => ({
  evaluateEvidenceHealth: vi.fn(),
}));

vi.mock('./calder-evidence/index.js', () => ({
  countEvents: vi.fn(() => 0),
  deleteAllEvidence: vi.fn(),
  deleteRun: vi.fn(),
  getStorageUsageBytes: vi.fn(() => 0),
  readEvents: mockReadEvents,
  readMeta: mockReadMeta,
  readReview: vi.fn(),
  readSummary: vi.fn(),
  writeReview: vi.fn(),
}));

vi.mock('./calder-evidence/run-resolve.js', () => ({
  findRunIdByCalderSessionId: vi.fn(),
  resolveEvidenceRunId: mockResolveEvidenceRunId,
}));

import { _resetEvidenceIpcForTests, registerEvidenceIpcHandlers } from './ipc-evidence';

function getHandle(channel: string): (...args: unknown[]) => unknown {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`Missing ipcMain.handle for ${channel}`);
  return call[1] as (...args: unknown[]) => unknown;
}

function getOn(channel: string): (...args: unknown[]) => unknown {
  const call = mockIpcOn.mock.calls.find(([name]) => name === channel);
  if (!call) throw new Error(`Missing ipcMain.on for ${channel}`);
  return call[1] as (...args: unknown[]) => unknown;
}

function createSender(id: number) {
  const destroyedListeners: Array<() => void> = [];
  let destroyed = false;
  return {
    id,
    send: vi.fn(),
    isDestroyed: () => destroyed,
    once: (event: string, listener: () => void) => {
      if (event === 'destroyed') destroyedListeners.push(listener);
    },
    destroy() {
      destroyed = true;
      for (const listener of destroyedListeners) listener();
    },
  };
}

describe('ipc evidence handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetEvidenceIpcForTests();
    mockResolveEvidenceRunId.mockImplementation((id: string) => id);
    mockReadEvents.mockReturnValue([]);
    mockReplayEvidenceTail.mockReturnValue([]);
    registerEvidenceIpcHandlers();
  });

  it('redacts getMeta projectPath to the basename', () => {
    mockReadMeta.mockReturnValue({
      runId: 'run-1',
      projectPath: '/Users/me/secret-project',
      eventCount: 2,
    });

    const meta = getHandle('evidence:getMeta')({}, 'run-1') as {
      projectPath: string;
    };

    expect(meta.projectPath).toBe('secret-project');
  });

  it('replays subscribed run tails and ignores other run ids', () => {
    const events = [{ type: 'tool_started' }];
    mockReadMeta.mockReturnValue({ runId: 'run-1', eventCount: 40 });
    mockReplayEvidenceTail.mockReturnValue(events);
    const sender = createSender(11);
    const subscribe = getOn('evidence:subscribe');

    subscribe({ sender }, 'run-1');

    expect(mockReplayEvidenceTail).toHaveBeenCalledWith('run-1', 40, mockReadEvents);
    expect(sender.send).toHaveBeenCalledWith('evidence:event', 'run-1', events);

    const notifier = mockSetEvidenceEventNotifier.mock.calls[0]?.[0] as (
      runId: string,
      batch: unknown[],
    ) => void;
    sender.send.mockClear();
    notifier('run-1', events);
    notifier('run-other', events);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith('evidence:event', 'run-1', events);
  });

  it('drops subscribers on unsubscribe and sender destroy', () => {
    mockReadMeta.mockReturnValue({ runId: 'run-1', eventCount: 1 });
    mockReplayEvidenceTail.mockReturnValue([{ type: 'tool_started' }]);
    const sender = createSender(12);
    const subscribe = getOn('evidence:subscribe');
    const unsubscribe = getOn('evidence:unsubscribe');
    const notifier = mockSetEvidenceEventNotifier.mock.calls[0]?.[0] as (
      runId: string,
      batch: unknown[],
    ) => void;

    subscribe({ sender }, 'run-1');
    sender.send.mockClear();
    unsubscribe({ sender });
    notifier('run-1', [{ type: 'ignored' }]);
    expect(sender.send).not.toHaveBeenCalled();

    subscribe({ sender }, 'run-1');
    sender.send.mockClear();
    sender.destroy();
    notifier('run-1', [{ type: 'ignored' }]);
    expect(sender.send).not.toHaveBeenCalled();
  });
});
