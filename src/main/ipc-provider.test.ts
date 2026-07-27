import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockGetProvider = vi.hoisted(() => vi.fn());
const mockGetProviderMeta = vi.hoisted(() => vi.fn());
const mockGetAllProviderMetas = vi.hoisted(() => vi.fn());
const mockBuildHandoffPrompt = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
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

function createOps() {
  return {
    requireKnownProjectPath: vi.fn((projectPath: string) => projectPath),
  };
}

describe('ipc provider handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds resume handoff prompt with transcript path when available', async () => {
    const ops = createOps();
    const provider = {
      meta: { displayName: 'Claude' },
      getTranscriptPath: vi.fn(() => '/repo/.calder/transcripts/s1.md'),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
    };
    mockGetProvider.mockReturnValue(provider);
    mockBuildHandoffPrompt.mockReturnValue('handoff prompt');

    registerProviderIpcHandlers(ops);
    const handler = getHandleHandler('session:buildResumeWithPrompt');

    const result = await handler({}, 'claude', 'cli-s1', '/repo', 'Session One');

    expect(provider.getTranscriptPath).toHaveBeenCalledWith('cli-s1', '/repo');
    expect(ops.requireKnownProjectPath).toHaveBeenCalledWith(
      '/repo',
      'Build session handoff prompt',
    );
    expect(mockBuildHandoffPrompt).toHaveBeenCalledWith({
      fromProviderLabel: 'Claude',
      sessionName: 'Session One',
      transcriptPath: '/repo/.calder/transcripts/s1.md',
    });
    expect(result).toBe('handoff prompt');
  });

  it('falls back to null transcript path when provider.getTranscriptPath throws', async () => {
    const ops = createOps();
    const provider = {
      meta: { displayName: 'Claude' },
      getTranscriptPath: vi.fn(() => {
        throw new Error('boom');
      }),
      validatePrerequisites: vi.fn(() => ({ ok: true })),
    };
    mockGetProvider.mockReturnValue(provider);
    mockBuildHandoffPrompt.mockReturnValue('handoff prompt');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    registerProviderIpcHandlers(ops);
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
    const ops = createOps();
    const provider = {
      clearBinaryCache: vi.fn(),
      checkBinaryInstalled: vi.fn(() => ({ ok: true, message: '' })),
      meta: { displayName: 'Claude' },
    };
    mockGetProvider.mockReturnValue(provider);
    mockGetProviderMeta.mockReturnValue({ id: 'claude', displayName: 'Claude' });
    mockGetAllProviderMetas.mockReturnValue([{ id: 'claude', displayName: 'Claude' }]);

    registerProviderIpcHandlers(ops);

    const metaHandler = getHandleHandler('provider:getMeta');
    const listHandler = getHandleHandler('provider:listProviders');
    const checkBinaryHandler = getHandleHandler('provider:checkBinary');

    const meta = await metaHandler({}, 'claude');
    const list = await listHandler({});
    const check = await checkBinaryHandler({});

    expect(mockGetProviderMeta).toHaveBeenCalledWith('claude');
    expect(mockGetAllProviderMetas).toHaveBeenCalled();
    expect(mockGetProvider).toHaveBeenCalledWith('claude');
    expect(provider.clearBinaryCache).toHaveBeenCalled();
    expect(provider.checkBinaryInstalled).toHaveBeenCalled();
    expect(meta).toEqual({ id: 'claude', displayName: 'Claude' });
    expect(list).toEqual([{ id: 'claude', displayName: 'Claude' }]);
    expect(check).toEqual({ ok: true, message: '' });
  });
});
