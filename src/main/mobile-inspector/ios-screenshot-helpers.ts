import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  MobileInspectLaunchResult,
  MobileInspectScreenshotResult,
} from '../../shared/types/mobile';
import {
  isIosScreenshotStdoutUnsupported,
  isNoBootedIosDeviceOutput,
  readPngSize,
  runCommand,
  summarizeIosFailure,
} from '../mobile-inspector-helpers';

interface CaptureIosScreenshotOptions {
  ensureIosSimulatorReady: () => Promise<MobileInspectLaunchResult>;
}

export async function captureIosScreenshot(
  options: CaptureIosScreenshotOptions,
): Promise<MobileInspectScreenshotResult> {
  const ready = await options.ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for capture.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const targetDeviceId = ready.deviceId ?? 'booted';
  const tempScreenshotPath = path.join(
    os.tmpdir(),
    `calder-ios-inspect-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );

  let captureResult = await runCommand(
    'xcrun',
    ['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath],
    30_000,
  );
  const firstCaptureOutput = [captureResult.stderr, captureResult.stdout]
    .filter(Boolean)
    .join('\n');
  if (captureResult.code !== 0 && isNoBootedIosDeviceOutput(firstCaptureOutput)) {
    // Booted device sets can race briefly; perform one readiness refresh and retry once.
    const refreshed = await options.ensureIosSimulatorReady();
    if (refreshed.success && refreshed.deviceId) {
      captureResult = await runCommand(
        'xcrun',
        ['simctl', 'io', refreshed.deviceId, 'screenshot', tempScreenshotPath],
        30_000,
      );
    }
  }

  if (captureResult.code !== 0) {
    const output = [captureResult.stderr, captureResult.stdout].filter(Boolean).join('\n');
    const readOnlyDash = isIosScreenshotStdoutUnsupported(output);
    if (readOnlyDash) {
      // Recent Xcode/runtime combos can reject "-" stdout target; retry explicitly with file target once.
      captureResult = await runCommand(
        'xcrun',
        ['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath],
        30_000,
      );
    }
  }

  if (captureResult.code !== 0) {
    try {
      fs.unlinkSync(tempScreenshotPath);
    } catch {
      // noop
    }
    return {
      platform: 'ios',
      success: false,
      message: summarizeIosFailure(captureResult, 'Failed to capture iOS simulator screenshot.', {
        includeRecoveryHint: true,
      }),
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  let screenshotBuffer: Buffer;
  try {
    screenshotBuffer = fs.readFileSync(tempScreenshotPath);
  } catch {
    return {
      platform: 'ios',
      success: false,
      message: 'iOS screenshot file could not be read after capture.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  } finally {
    try {
      fs.unlinkSync(tempScreenshotPath);
    } catch {
      // noop
    }
  }

  const size = readPngSize(screenshotBuffer);
  if (!size) {
    return {
      platform: 'ios',
      success: false,
      message: 'iOS screenshot payload is not a valid PNG image.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  return {
    platform: 'ios',
    success: true,
    message: 'iOS screenshot captured.',
    deviceId: ready.deviceId,
    deviceName: ready.deviceName,
    dataUrl: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
    width: size.width,
    height: size.height,
    capturedAt: new Date().toISOString(),
  };
}
