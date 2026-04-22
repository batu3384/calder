import { execFile, spawn } from 'child_process';
import { getFullPath } from './pty-manager';
import { whichCmd } from './platform';
import { getAndroidBinaryCandidates as getDependencyDoctorBinaryCandidates } from './mobile-dependency-doctor-binaries';

const COMMAND_TIMEOUT_MS = 20_000;
const IOS_DEVICE_SETTLE_TIMEOUT_MS = 20_000;
const IOS_DEVICE_SETTLE_POLL_MS = 1_000;
const ANDROID_BOOT_TIMEOUT_MS = 120_000;
const ANDROID_BOOT_POLL_MS = 2_000;

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BinaryCommandResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export interface SimctlDeviceRecord {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  runtimeId: string;
}

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

function buildCommandEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getFullPath() };
}

export function isLikelyCommandMissing(result: { stderr: string }): boolean {
  return /ENOENT|not found|No such file or directory/i.test(result.stderr);
}

export function firstNonEmptyLine(...chunks: Array<string | undefined>): string {
  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);
    if (line) return line;
  }
  return '';
}

export function isNoBootedIosDeviceOutput(message: string): boolean {
  const lowered = message.toLowerCase();
  return /no devices are booted|unable to find a booted|unable to locate .*booted|no booted/.test(lowered);
}

export function isIosScreenshotStdoutUnsupported(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    /you can.t save the file “-” because the volume/i.test(message)
    || /you can't save the file \"-\" because the volume/i.test(lowered)
    || /read only/.test(lowered)
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
  if (/unable to locate device set|coresimulator service|device set unavailable|failed to initialize simulator/.test(lowered)) {
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
  if (/dyld_shared_cache|shared cache/i.test(base) || /dyld_shared_cache|shared cache/.test(lowered)) {
    return `${base} Run \`xcrun simctl runtime dyld_shared_cache update --all\` and retry.`;
  }
  return base;
}

export function runCommand(command: string, args: string[], timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        env: buildCommandEnv(),
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }
        const err = error as NodeJS.ErrnoException & {
          code?: number | string;
          stdout?: string;
          stderr?: string;
        };
        const message = err.message || '';
        const mergedErr = [err.stderr ?? stderr ?? '', message].filter(Boolean).join('\n').trim();
        resolve({
          code: typeof err.code === 'number' ? err.code : 1,
          stdout: err.stdout ?? stdout ?? '',
          stderr: mergedErr,
        });
      },
    );
  });
}

export function runBinaryCommand(command: string, args: string[], timeoutMs: number = COMMAND_TIMEOUT_MS): Promise<BinaryCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: buildCommandEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 1000).unref();
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8'));
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderr = Buffer.concat([
        ...stderrChunks,
        Buffer.from((error.message || '').trim(), 'utf8'),
      ]).toString('utf8').trim();
      resolve({
        code: 1,
        stdout: Buffer.concat(stdoutChunks),
        stderr,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (timedOut) {
        resolve({
          code: 124,
          stdout: Buffer.concat(stdoutChunks),
          stderr: [stderr, `Command timed out after ${Math.round(timeoutMs / 1000)}s.`].filter(Boolean).join('\n'),
        });
        return;
      }
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks),
        stderr,
      });
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractAppiumErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const value = root.value && typeof root.value === 'object'
    ? (root.value as Record<string, unknown>)
    : null;
  const messageCandidates = [
    value?.message,
    root.message,
    value?.error,
  ];
  for (const candidate of messageCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function extractAppiumSessionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  if (typeof root.sessionId === 'string' && root.sessionId.trim().length > 0) {
    return root.sessionId;
  }
  const value = root.value && typeof root.value === 'object'
    ? (root.value as Record<string, unknown>)
    : null;
  if (value && typeof value.sessionId === 'string' && value.sessionId.trim().length > 0) {
    return value.sessionId;
  }
  return null;
}

export function getAndroidBinaryCandidates(
  binary: 'adb' | 'emulator',
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): string[] {
  return getDependencyDoctorBinaryCandidates(binary, env, hostPlatform);
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

  const bootedIPhone = devices.find((entry) => entry.state === 'Booted' && /iPhone/i.test(entry.name));
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
    /nscocoaerrordomain,\s*code=642/i.test(message)
    || /unable to boot in current state/.test(lowered)
    || /device is in transition/.test(lowered)
    || /failed to boot in allotted time/.test(lowered)
    || /operation timed out/.test(lowered)
  );
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
