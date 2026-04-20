import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockIpcOn = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() => vi.fn());
const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetProviderMeta = vi.hoisted(() => vi.fn());
const mockGetAllProviderMetas = vi.hoisted(() => vi.fn());
const mockBuildHandoffPrompt = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
}));

vi.mock('./providers/registry', () => ({
  getProvider: mockGetProvider,
  getProviderMeta: mockGetProviderMeta,
  getAllProviderMetas: mockGetAllProviderMetas,
}));

vi.mock('./providers/resume-handoff', () => ({
  buildHandoffPrompt: mockBuildHandoffPrompt,
}));

import { registerProviderIpcHandlers } from './ipc-provider';

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

describe('ipc provider handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles provider:getConfig and claude:getConfig alias', async () => {
    const provider = {
      getConfig: vi.fn(async (projectPath: string) => ({ projectPath })),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
      meta: { displayName: 'Claude' },
    };
    mockGetProvider.mockReturnValue(provider);

    registerProviderIpcHandlers();

    const providerConfigHandler = getHandleHandler('provider:getConfig');
    const claudeConfigHandler = getHandleHandler('claude:getConfig');

    const providerResult = await providerConfigHandler({}, 'codex', '/repo-a');
    const claudeResult = await claudeConfigHandler({}, '/repo-b');

    expect(mockGetProvider).toHaveBeenCalledWith('codex');
    expect(mockGetProvider).toHaveBeenCalledWith('claude');
    expect(provider.getConfig).toHaveBeenCalledWith('/repo-a');
    expect(provider.getConfig).toHaveBeenCalledWith('/repo-b');
    expect(providerResult).toEqual({ projectPath: '/repo-a' });
    expect(claudeResult).toEqual({ projectPath: '/repo-b' });
  });

  it('starts config watcher only when a browser window exists', () => {
    const startConfigWatcher = vi.fn();
    const provider = {
      startConfigWatcher,
      getConfig: vi.fn(),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
      meta: { displayName: 'Codex' },
    };
    const win = { id: 1 };
    mockGetProvider.mockReturnValue(provider);
    mockGetAllWindows.mockReturnValue([win]);

    registerProviderIpcHandlers();

    const watchHandler = getOnHandler('config:watchProject');
    watchHandler({}, 'codex', '/repo');
    expect(startConfigWatcher).toHaveBeenCalledWith(win, '/repo');

    startConfigWatcher.mockClear();
    mockGetAllWindows.mockReturnValue([]);
    watchHandler({}, 'codex', '/repo');
    expect(startConfigWatcher).not.toHaveBeenCalled();
  });

  it('builds resume handoff prompt with transcript path when available', async () => {
    const provider = {
      meta: { displayName: 'Claude' },
      getTranscriptPath: vi.fn(() => '/repo/.calder/transcripts/s1.md'),
      getConfig: vi.fn(),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
    };
    mockGetProvider.mockReturnValue(provider);
    mockBuildHandoffPrompt.mockReturnValue('handoff prompt');

    registerProviderIpcHandlers();
    const handler = getHandleHandler('session:buildResumeWithPrompt');

    const result = await handler({}, 'claude', 'cli-s1', '/repo', 'Session One');

    expect(provider.getTranscriptPath).toHaveBeenCalledWith('cli-s1', '/repo');
    expect(mockBuildHandoffPrompt).toHaveBeenCalledWith({
      fromProviderLabel: 'Claude',
      sessionName: 'Session One',
      transcriptPath: '/repo/.calder/transcripts/s1.md',
    });
    expect(result).toBe('handoff prompt');
  });

  it('falls back to null transcript path when provider.getTranscriptPath throws', async () => {
    const provider = {
      meta: { displayName: 'Claude' },
      getTranscriptPath: vi.fn(() => {
        throw new Error('boom');
      }),
      getConfig: vi.fn(),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
    };
    mockGetProvider.mockReturnValue(provider);
    mockBuildHandoffPrompt.mockReturnValue('handoff prompt');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerProviderIpcHandlers();
    const handler = getHandleHandler('session:buildResumeWithPrompt');
    await handler({}, 'claude', 'cli-s2', '/repo', 'Session Two');

    expect(mockBuildHandoffPrompt).toHaveBeenCalledWith({
      fromProviderLabel: 'Claude',
      sessionName: 'Session Two',
      transcriptPath: null,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns provider meta/list and defaults binary checks to claude', async () => {
    const provider = {
      validatePrerequisites: vi.fn(() => ({ ok: true })),
      getConfig: vi.fn(),
      meta: { displayName: 'Claude' },
    };
    mockGetProvider.mockReturnValue(provider);
    mockGetProviderMeta.mockReturnValue({ id: 'claude', displayName: 'Claude' });
    mockGetAllProviderMetas.mockReturnValue([{ id: 'claude', displayName: 'Claude' }]);

    registerProviderIpcHandlers();

    const metaHandler = getHandleHandler('provider:getMeta');
    const listHandler = getHandleHandler('provider:listProviders');
    const checkBinaryHandler = getHandleHandler('provider:checkBinary');

    const meta = await metaHandler({}, 'claude');
    const list = await listHandler({});
    const check = await checkBinaryHandler({});

    expect(mockGetProviderMeta).toHaveBeenCalledWith('claude');
    expect(mockGetAllProviderMetas).toHaveBeenCalled();
    expect(mockGetProvider).toHaveBeenCalledWith('claude');
    expect(provider.validatePrerequisites).toHaveBeenCalled();
    expect(meta).toEqual({ id: 'claude', displayName: 'Claude' });
    expect(list).toEqual([{ id: 'claude', displayName: 'Claude' }]);
    expect(check).toEqual({ ok: true });
  });
});

