import {
  parseAndroidHierarchyNodes,
  resolveAndroidNodeAtPoint,
  runCommand,
} from './mobile-inspector-helpers';
import type { MobileInspectPointInspectionResult } from '../shared/types/mobile';

interface AndroidInspectInput {
  adbBinary: string;
  deviceId: string;
  deviceName?: string;
  point: { x: number; y: number };
}

export async function inspectAndroidPoint({
  adbBinary,
  deviceId,
  deviceName,
  point,
}: AndroidInspectInput): Promise<MobileInspectPointInspectionResult> {
  const dumpPath = '/sdcard/calder-window-dump.xml';
  const dumpResult = await runCommand(adbBinary, ['-s', deviceId, 'shell', 'uiautomator', 'dump', dumpPath], 30_000);
  if (dumpResult.code !== 0) {
    return {
      platform: 'android',
      success: false,
      message: dumpResult.stderr || 'Failed to dump Android UI hierarchy.',
      point,
      deviceId,
      deviceName,
    };
  }

  const readResult = await runCommand(adbBinary, ['-s', deviceId, 'shell', 'cat', dumpPath], 30_000);
  if (readResult.code !== 0 || !readResult.stdout.trim()) {
    return {
      platform: 'android',
      success: false,
      message: readResult.stderr || 'Failed to read Android UI hierarchy dump.',
      point,
      deviceId,
      deviceName,
    };
  }

  const nodes = parseAndroidHierarchyNodes(readResult.stdout);
  if (nodes.length === 0) {
    return {
      platform: 'android',
      success: false,
      message: 'Android UI hierarchy is empty.',
      point,
      deviceId,
      deviceName,
    };
  }

  const match = resolveAndroidNodeAtPoint(nodes, point.x, point.y);
  if (!match) {
    return {
      platform: 'android',
      success: false,
      message: 'No Android UI element matched this point.',
      point,
      deviceId,
      deviceName,
    };
  }

  return {
    platform: 'android',
    success: true,
    message: 'Matched Android UI element at selected point.',
    point,
    deviceId,
    deviceName,
    element: {
      className: match.className,
      text: match.text,
      resourceId: match.resourceId,
      contentDesc: match.contentDesc,
      bounds: match.bounds,
    },
  };
}
