import {
  normalizeAndroidScreencap,
  readPngSize,
  runBinaryCommand,
} from './mobile-inspector-helpers';
import type { MobileInspectScreenshotResult } from '../shared/types/mobile';

interface AndroidScreenshotInput {
  adbBinary: string;
  deviceId: string;
  deviceName?: string;
}

export async function captureAndroidScreenshot({
  adbBinary,
  deviceId,
  deviceName,
}: AndroidScreenshotInput): Promise<MobileInspectScreenshotResult> {
  const captureResult = await runBinaryCommand(adbBinary, ['-s', deviceId, 'exec-out', 'screencap', '-p']);
  if (captureResult.code !== 0) {
    return {
      platform: 'android',
      success: false,
      message: captureResult.stderr || 'Failed to capture Android emulator screenshot.',
      deviceId,
      deviceName,
    };
  }

  const normalized = normalizeAndroidScreencap(captureResult.stdout);
  const size = readPngSize(normalized);
  if (!size) {
    return {
      platform: 'android',
      success: false,
      message: 'Android screenshot payload is not a valid PNG image.',
      deviceId,
      deviceName,
    };
  }

  return {
    platform: 'android',
    success: true,
    message: 'Android screenshot captured.',
    deviceId,
    deviceName,
    dataUrl: `data:image/png;base64,${normalized.toString('base64')}`,
    width: size.width,
    height: size.height,
    capturedAt: new Date().toISOString(),
  };
}
