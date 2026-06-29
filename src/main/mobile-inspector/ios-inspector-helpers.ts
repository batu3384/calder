import { sleep } from './command-runtime-helpers';

const IOS_DEVICE_SETTLE_TIMEOUT_MS = 20_000;
const IOS_DEVICE_SETTLE_POLL_MS = 1_000;

export interface SimctlDeviceRecord {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  runtimeId: string;
}

export function isNoBootedIosDeviceOutput(message: string): boolean {
  const lowered = message.toLowerCase();
  return /no devices are booted|unable to find a booted|unable to locate .*booted|no booted/.test(
    lowered,
  );
}

export function isIosScreenshotStdoutUnsupported(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    /you can.t save the file “-” because the volume/i.test(message) ||
    /you can't save the file \"-\" because the volume/i.test(lowered) ||
    /read only/.test(lowered)
  );
}

export function getMeaningfulErrorLine(...chunks: Array<string | undefined>): string {
  const ignoredPrefixes = [
    /^note:\s*no display specified/i,
    /^detected file type from extension:/i,
    /^wrote screenshot to:/i,
  ];

  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => {
        if (!entry) return false;
        return !ignoredPrefixes.some((pattern) => pattern.test(entry));
      });
    if (line) return line;
  }
  return '';
}

export function summarizeIosFailure(
  output: { stderr?: string; stdout?: string },
  fallback: string,
  options?: { includeRecoveryHint?: boolean },
): string {
  const merged = [output.stderr, output.stdout].filter(Boolean).join('\n');
  const lowered = merged.toLowerCase();

  if (isNoBootedIosDeviceOutput(merged)) {
    return 'No booted iOS simulator detected. Launch iOS Simulator and retry.';
  }
  if (
    /unable to locate device set|coresimulator service|device set unavailable|failed to initialize simulator/.test(
      lowered,
    )
  ) {
    return 'iOS Simulator service is unavailable. Open Xcode and Simulator once, then retry.';
  }
  if (/dyld_shared_cache|shared cache/.test(lowered)) {
    return 'iOS runtime cache is out of date. Run `xcrun simctl runtime dyld_shared_cache update --all` and retry.';
  }
  if (/timed out|timeout/.test(lowered)) {
    return 'iOS simulator did not become ready in time. Keep Simulator open and retry.';
  }

  const base = getMeaningfulErrorLine(output.stderr, output.stdout) || fallback;
  if (!options?.includeRecoveryHint) return base;
  if (
    /dyld_shared_cache|shared cache/i.test(base) ||
    /dyld_shared_cache|shared cache/.test(lowered)
  ) {
    return `${base} Run \`xcrun simctl runtime dyld_shared_cache update --all\` and retry.`;
  }
  return base;
}

export function parseSimctlDevices(stdout: string): SimctlDeviceRecord[] {
  const raw = stdout.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const payload = parsed as { devices?: Record<string, Array<Record<string, unknown>>> };
  if (!payload.devices || typeof payload.devices !== 'object') return [];

  const devices: SimctlDeviceRecord[] = [];
  for (const [runtimeId, entries] of Object.entries(payload.devices)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const udid = typeof entry.udid === 'string' ? entry.udid : '';
      const name = typeof entry.name === 'string' ? entry.name : '';
      if (!udid || !name) continue;
      const state = typeof entry.state === 'string' ? entry.state : 'Unknown';
      const availability = typeof entry.availability === 'string' ? entry.availability : '';
      const isAvailable = entry.isAvailable === true || availability.includes('(available)');
      devices.push({
        udid,
        name,
        state,
        isAvailable,
        runtimeId,
      });
    }
  }
  return devices;
}

function parseRuntimeScore(runtimeId: string): number {
  const matches = runtimeId.match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  let score = 0;
  for (let index = 0; index < Math.min(matches.length, 3); index += 1) {
    const value = Number(matches[index]);
    if (!Number.isFinite(value)) continue;
    score += value * Math.pow(1000, 2 - index);
  }
  return score;
}

function sortIosDeviceCandidates(devices: SimctlDeviceRecord[]): SimctlDeviceRecord[] {
  return [...devices].sort((left, right) => {
    const rightIsIPhone = /iPhone/i.test(right.name) ? 1 : 0;
    const leftIsIPhone = /iPhone/i.test(left.name) ? 1 : 0;
    if (rightIsIPhone !== leftIsIPhone) return rightIsIPhone - leftIsIPhone;

    const stateScore = (state: string): number => {
      if (state === 'Booted') return 4;
      if (state === 'Shutdown') return 3;
      if (/Shutting Down|Booting|Creating/i.test(state)) return 2;
      return 1;
    };
    const stateDiff = stateScore(right.state) - stateScore(left.state);
    if (stateDiff !== 0) return stateDiff;

    const runtimeDiff = parseRuntimeScore(right.runtimeId) - parseRuntimeScore(left.runtimeId);
    if (runtimeDiff !== 0) return runtimeDiff;

    return left.name.localeCompare(right.name);
  });
}

export function choosePreferredIosDevice(devices: SimctlDeviceRecord[]): SimctlDeviceRecord | null {
  if (devices.length === 0) return null;

  const bootedIPhone = devices.find(
    (entry) => entry.state === 'Booted' && /iPhone/i.test(entry.name),
  );
  if (bootedIPhone) return bootedIPhone;

  const bootedAny = devices.find((entry) => entry.state === 'Booted');
  if (bootedAny) return bootedAny;

  const available = devices.filter((entry) => entry.isAvailable);
  return sortIosDeviceCandidates(available)[0] ?? null;
}

export function isIosDeviceTransitionalState(state: string): boolean {
  return /Shutting Down|Booting|Creating/i.test(state);
}

export function isRecoverableIosBootFailure(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    /nscocoaerrordomain,\s*code=642/i.test(message) ||
    /unable to boot in current state/.test(lowered) ||
    /device is in transition/.test(lowered) ||
    /failed to boot in allotted time/.test(lowered) ||
    /operation timed out/.test(lowered)
  );
}

export async function waitForIosDeviceToSettle(
  udid: string,
  getDevice: (deviceUdid: string) => Promise<SimctlDeviceRecord | null>,
): Promise<SimctlDeviceRecord | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < IOS_DEVICE_SETTLE_TIMEOUT_MS) {
    const current = await getDevice(udid);
    if (!current) return null;
    if (!isIosDeviceTransitionalState(current.state)) {
      return current;
    }
    await sleep(IOS_DEVICE_SETTLE_POLL_MS);
  }
  return await getDevice(udid);
}
