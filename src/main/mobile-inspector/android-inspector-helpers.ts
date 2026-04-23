import { getAndroidBinaryCandidates as getDependencyDoctorBinaryCandidates } from '../mobile-dependency-doctor-binaries';
import { runCommand, sleep } from './command-runtime-helpers';

const ANDROID_BOOT_TIMEOUT_MS = 120_000;
const ANDROID_BOOT_POLL_MS = 2_000;

export interface AdbDeviceRecord {
  id: string;
  state: string;
}

export interface AndroidHierarchyNode {
  className?: string;
  text?: string;
  resourceId?: string;
  contentDesc?: string;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export function getAndroidBinaryCandidates(
  binary: 'adb' | 'emulator',
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): string[] {
  return getDependencyDoctorBinaryCandidates(binary, env, hostPlatform);
}

export function parseAdbDevices(stdout: string): AdbDeviceRecord[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .filter((line) => !line.startsWith('List of devices attached'))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({ id: parts[0], state: parts[1] }));
}

export function resolveRunningAndroidEmulator(devices: AdbDeviceRecord[]): AdbDeviceRecord | null {
  return devices.find((entry) => entry.id.startsWith('emulator-') && entry.state === 'device') ?? null;
}

function isPngBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 24
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  );
}

export function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (!isPngBuffer(buffer)) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function normalizeAndroidScreencap(buffer: Buffer): Buffer {
  if (isPngBuffer(buffer)) return buffer;
  const normalized = Buffer.from(buffer.toString('binary').replace(/\r\n/g, '\n'), 'binary');
  return isPngBuffer(normalized) ? normalized : buffer;
}

function parseAndroidBounds(value: string | undefined): AndroidHierarchyNode['bounds'] | undefined {
  if (!value) return undefined;
  const match = value.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return undefined;
  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  if (![left, top, right, bottom].every((entry) => Number.isFinite(entry))) return undefined;
  if (right <= left || bottom <= top) return undefined;
  return { left, top, right, bottom };
}

export function parseAndroidHierarchyNodes(xml: string): AndroidHierarchyNode[] {
  const nodes: AndroidHierarchyNode[] = [];
  const tagMatches = xml.match(/<node\b[^>]*\/?>/g) ?? [];
  for (const tag of tagMatches) {
    const attrs: Record<string, string> = {};
    const attrRegex = /([\w:-]+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null = attrRegex.exec(tag);
    while (attrMatch) {
      attrs[attrMatch[1]] = attrMatch[2];
      attrMatch = attrRegex.exec(tag);
    }

    nodes.push({
      className: attrs.class || undefined,
      text: attrs.text || undefined,
      resourceId: attrs['resource-id'] || undefined,
      contentDesc: attrs['content-desc'] || undefined,
      bounds: parseAndroidBounds(attrs.bounds),
    });
  }
  return nodes;
}

export function resolveAndroidNodeAtPoint(nodes: AndroidHierarchyNode[], x: number, y: number): AndroidHierarchyNode | null {
  const candidates = nodes
    .filter((node) => node.bounds)
    .filter((node) => {
      const bounds = node.bounds!;
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    })
    .sort((left, right) => {
      const leftBounds = left.bounds!;
      const rightBounds = right.bounds!;
      const leftArea = (leftBounds.right - leftBounds.left) * (leftBounds.bottom - leftBounds.top);
      const rightArea = (rightBounds.right - rightBounds.left) * (rightBounds.bottom - rightBounds.top);
      return leftArea - rightArea;
    });

  return candidates[0] ?? null;
}

export async function waitForAndroidBootCompleted(adbBinary: string, deviceId: string): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ANDROID_BOOT_TIMEOUT_MS) {
    const bootCompleted = await runCommand(adbBinary, ['-s', deviceId, 'shell', 'getprop', 'sys.boot_completed'], 10_000);
    if (bootCompleted.code === 0 && /\b1\b/.test(bootCompleted.stdout.trim())) {
      return true;
    }
    await sleep(ANDROID_BOOT_POLL_MS);
  }
  return false;
}
