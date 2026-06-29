import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcHandle = vi.hoisted(() => vi.fn());
const mockCheckMobileDependencies = vi.hoisted(() => vi.fn());
const mockInstallMobileDependency = vi.hoisted(() => vi.fn());
const mockLaunchMobileInspectSurface = vi.hoisted(() => vi.fn());
const mockCaptureMobileInspectScreenshot = vi.hoisted(() => vi.fn());
const mockInspectMobilePoint = vi.hoisted(() => vi.fn());
const mockInteractMobileInspectPoint = vi.hoisted(() => vi.fn());
const mockResolveShareRtcConfigFromEnv = vi.hoisted(() => vi.fn());
const mockCreateMobileControlPairing = vi.hoisted(() => vi.fn());
const mockConsumeMobileControlPairingAnswer = vi.hoisted(() => vi.fn());
const mockRevokeMobileControlPairing = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcHandle,
  },
}));

vi.mock('./mobile-dependency-doctor', () => ({
  checkMobileDependencies: mockCheckMobileDependencies,
  installMobileDependency: mockInstallMobileDependency,
}));

vi.mock('./mobile-inspector', () => ({
  launchMobileInspectSurface: mockLaunchMobileInspectSurface,
  captureMobileInspectScreenshot: mockCaptureMobileInspectScreenshot,
  inspectMobilePoint: mockInspectMobilePoint,
  interactMobileInspectPoint: mockInteractMobileInspectPoint,
}));

vi.mock('./share-rtc-config', () => ({
  resolveShareRtcConfigFromEnv: mockResolveShareRtcConfigFromEnv,
}));

vi.mock('./mobile-control-bridge', () => ({
  createMobileControlPairing: mockCreateMobileControlPairing,
  consumeMobileControlPairingAnswer: mockConsumeMobileControlPairingAnswer,
  revokeMobileControlPairing: mockRevokeMobileControlPairing,
}));

import { registerMobileIpcHandlers } from './ipc-mobile';

function getHandleHandler(channel: string): (...args: any[]) => any {
  const call = mockIpcHandle.mock.calls.find(([name]) => name === channel);
  if (!call) {
    throw new Error(`Missing ipcMain.handle registration for ${channel}`);
  }
  return call[1] as (...args: any[]) => any;
}

describe('ipc mobile handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('checks dependencies and installs dependency while streaming progress', async () => {
    registerMobileIpcHandlers();
    const checkDependencies = getHandleHandler('mobileSetup:checkDependencies');
    const installDependency = getHandleHandler('mobileSetup:installDependency');
    const sender = { isDestroyed: () => false, send: vi.fn() };

    mockCheckMobileDependencies.mockResolvedValue({ ok: true });
    mockInstallMobileDependency.mockImplementation(
      (
        _dependencyId: string,
        { installId, onProgress }: { installId: string; onProgress: (event: unknown) => void },
      ) => {
        onProgress({ installId, step: 'download' });
        return Promise.resolve({ ok: true, installId });
      },
    );

    const checkResult = await checkDependencies({});
    const installResult = await installDependency({ sender }, 'xcode');

    expect(checkResult).toEqual({ ok: true });
    expect(mockInstallMobileDependency).toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(
      'mobileSetup:installProgress',
      expect.objectContaining({ step: 'download' }),
    );
    expect(installResult).toEqual(expect.objectContaining({ ok: true }));
  });

  it('normalizes inspect platform and finite coordinates for inspect/interact handlers', async () => {
    registerMobileIpcHandlers();
    const launch = getHandleHandler('mobileInspect:launch');
    const capture = getHandleHandler('mobileInspect:captureScreenshot');
    const inspect = getHandleHandler('mobileInspect:inspectPoint');
    const interact = getHandleHandler('mobileInspect:interact');

    await launch({}, 'android');
    await capture({}, 'web');
    await inspect({}, 'web', Number.NaN, 22);
    await interact({}, 'ios', 11, Number.POSITIVE_INFINITY);

    expect(mockLaunchMobileInspectSurface).toHaveBeenCalledWith('android');
    expect(mockCaptureMobileInspectScreenshot).toHaveBeenCalledWith('ios');
    expect(mockInspectMobilePoint).toHaveBeenCalledWith('ios', 0, 22);
    expect(mockInteractMobileInspectPoint).toHaveBeenCalledWith('ios', 11, 0);
  });

  it('delegates sharing and mobile control pairing handlers', async () => {
    registerMobileIpcHandlers();
    const getRtcConfig = getHandleHandler('sharing:getRtcConfig');
    const createPairing = getHandleHandler('mobile:createControlPairing');
    const consumePairing = getHandleHandler('mobile:consumeControlAnswer');
    const revokePairing = getHandleHandler('mobile:revokeControlPairing');

    mockResolveShareRtcConfigFromEnv.mockReturnValue({ iceServers: [] });
    mockCreateMobileControlPairing.mockResolvedValue({ pairingId: 'pair-1' });
    mockConsumeMobileControlPairingAnswer.mockResolvedValue({ answer: 'sdp-answer' });

    expect(getRtcConfig({})).toEqual({ iceServers: [] });
    expect(await createPairing({}, 'session-1', 'offer', 'secret', 'readonly', 'tr')).toEqual({
      pairingId: 'pair-1',
    });
    expect(await consumePairing({}, 'pair-1')).toEqual({ answer: 'sdp-answer' });
    expect(await revokePairing({}, 'pair-1')).toEqual({ ok: true });
    expect(mockRevokeMobileControlPairing).toHaveBeenCalledWith('pair-1');
  });
});
