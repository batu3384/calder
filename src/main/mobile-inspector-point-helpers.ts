import { ensureLocalAppiumServerReady } from './mobile-inspector-appium-helpers';
import { inspectAndroidPoint } from './mobile-inspector-inspect-helpers';
import {
  cleanupIosTapSession,
  createIosTapSession,
  runIosTapAction,
} from './mobile-inspector-interaction-helpers';
import { runCommand } from './mobile-inspector-helpers';
import type {
  MobileInspectInteractionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectPointInspectionResult,
} from '../shared/types/mobile';

interface AndroidCommandSet {
  adbBinary: string;
  emulatorBinary: string;
}

interface PointFlowDependencies {
  resolveAndroidCommandSet: () => Promise<{ commands?: AndroidCommandSet; error?: string }>;
  ensureAndroidEmulatorReady: (commands?: AndroidCommandSet) => Promise<MobileInspectLaunchResult>;
  ensureIosSimulatorReady: () => Promise<MobileInspectLaunchResult>;
}

function normalizePoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };
}

export async function inspectMobilePointWithDependencies(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
  dependencies: PointFlowDependencies,
): Promise<MobileInspectPointInspectionResult> {
  const point = normalizePoint(x, y);

  if (platform === 'android') {
    const resolved = await dependencies.resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
        point,
      };
    }

    const ready = await dependencies.ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for inspection.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return inspectAndroidPoint({
      adbBinary: resolved.commands.adbBinary,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
      point,
    });
  }

  const ready = await dependencies.ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for inspection.',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  return {
    platform: 'ios',
    success: false,
    message: 'iOS native hierarchy inspection is not available yet. Point-based routing is still applied.',
    point,
    deviceId: ready.deviceId,
    deviceName: ready.deviceName,
  };
}

export async function interactMobileInspectPointWithDependencies(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
  dependencies: PointFlowDependencies,
): Promise<MobileInspectInteractionResult> {
  const point = normalizePoint(x, y);

  if (platform === 'android') {
    const resolved = await dependencies.resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
        action: 'tap',
        point,
      };
    }

    const ready = await dependencies.ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for interaction.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const tapResult = await runCommand(
      resolved.commands.adbBinary,
      ['-s', ready.deviceId, 'shell', 'input', 'tap', String(point.x), String(point.y)],
      15_000,
    );
    if (tapResult.code !== 0) {
      return {
        platform: 'android',
        success: false,
        message: tapResult.stderr || 'Android tap command failed.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'android',
      success: true,
      message: 'Tap dispatched to Android emulator.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const ready = await dependencies.ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for interaction.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const appiumReady = await ensureLocalAppiumServerReady();
  if (!appiumReady.success) {
    return {
      platform: 'ios',
      success: false,
      message: appiumReady.message || 'Appium server is not ready.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const session = await createIosTapSession(ready.deviceId, ready.deviceName);
  if (!session.success || !session.sessionId || session.basePath === undefined) {
    return {
      platform: 'ios',
      success: false,
      message: session.message || 'Failed to create iOS interaction session.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  try {
    const tapResult = await runIosTapAction(session.sessionId, point, session.basePath);
    if (!tapResult.success) {
      return {
        platform: 'ios',
        success: false,
        message: tapResult.message || 'iOS tap action failed.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'ios',
      success: true,
      message: 'Tap dispatched to iOS simulator.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  } finally {
    await cleanupIosTapSession(session.sessionId, session.basePath);
  }
}
