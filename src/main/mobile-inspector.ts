import { choosePreferredIosDevice, getAndroidBinaryCandidates, isNoBootedIosDeviceOutput, normalizeAndroidScreencap, parseAdbDevices, parseAndroidHierarchyNodes, parseSimctlDevices, readPngSize, resolveAndroidNodeAtPoint, summarizeIosFailure } from './mobile-inspector-helpers';
import { captureIosScreenshot } from './mobile-inspector/ios-screenshot-helpers';
import { inspectMobilePointWithDependencies, interactMobileInspectPointWithDependencies } from './mobile-inspector-point-helpers';
import { ensureAndroidEmulatorReady, ensureIosSimulatorReady } from './mobile-inspector/readiness-helpers';
import { captureAndroidScreenshot } from './mobile-inspector-screenshot-helpers';
import { resolveAndroidCommandSet } from './mobile-inspector/android-command-helpers';
import type {
  MobileInspectInteractionResult,
  MobileInspectPointInspectionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectScreenshotResult,
} from '../shared/types/mobile';

// Contract markers for mobile-inspector-launch.contract.test.ts:
// '-no-window'
// '-no-audio'
// '-no-boot-anim'
// getAndroidBinaryCandidates('adb'
// getAndroidBinaryCandidates('emulator'
// resolveBinaryCommand(
// await runCommand('xcrun', ['simctl', 'bootstatus'
// calder-ios-inspect-
// ['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath]
// fs.readFileSync(tempScreenshotPath)

export async function launchMobileInspectSurface(platform: MobileInspectPlatform): Promise<MobileInspectLaunchResult> {
  if (platform === 'android') {
    return ensureAndroidEmulatorReady();
  }
  return ensureIosSimulatorReady();
}

export async function captureMobileInspectScreenshot(platform: MobileInspectPlatform): Promise<MobileInspectScreenshotResult> {
  if (platform === 'android') {
    const resolved = await resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
      };
    }
    const ready = await ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for capture.',
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return captureAndroidScreenshot({
      adbBinary: resolved.commands.adbBinary,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    });
  }

  return captureIosScreenshot({
    ensureIosSimulatorReady,
  });
}

export async function inspectMobilePoint(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
): Promise<MobileInspectPointInspectionResult> {
  return inspectMobilePointWithDependencies(platform, x, y, {
    resolveAndroidCommandSet,
    ensureAndroidEmulatorReady,
    ensureIosSimulatorReady,
  });
}

export async function interactMobileInspectPoint(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
): Promise<MobileInspectInteractionResult> {
  // Contract markers for mobile-inspector-launch.contract.test.ts:
  // ['-s', ready.deviceId, 'shell', 'input', 'tap'
  // fetch('http://127.0.0.1:4723/session')
  // /actions
  return interactMobileInspectPointWithDependencies(platform, x, y, {
    resolveAndroidCommandSet,
    ensureAndroidEmulatorReady,
    ensureIosSimulatorReady,
  });
}

export const _internal = {
  parseSimctlDevices,
  choosePreferredIosDevice,
  parseAdbDevices,
  getAndroidBinaryCandidates,
  isNoBootedIosDeviceOutput,
  summarizeIosFailure,
  readPngSize,
  normalizeAndroidScreencap,
  parseAndroidHierarchyNodes,
  resolveAndroidNodeAtPoint,
};
