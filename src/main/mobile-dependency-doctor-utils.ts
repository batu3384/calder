export interface DoctorCommandResultLike {
  code: number;
  stdout: string;
  stderr: string;
}

export interface DoctorInstallStepLike {
  command: string;
  args: string[];
}

const BYTE_UNITS = new Map<string, number>([
  ['B', 1],
  ['BYTE', 1],
  ['BYTES', 1],
  ['KB', 1024],
  ['KIB', 1024],
  ['MB', 1024 * 1024],
  ['MIB', 1024 * 1024],
  ['GB', 1024 * 1024 * 1024],
  ['GIB', 1024 * 1024 * 1024],
  ['TB', 1024 * 1024 * 1024 * 1024],
  ['TIB', 1024 * 1024 * 1024 * 1024],
]);

const ANSI_ESCAPE_RE = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ANSI_CSI_RE = /\u009B[0-?]*[ -/]*[@-~]/g;

function toBytes(value: number, unitRaw: string): number {
  const unit = unitRaw.toUpperCase();
  const multiplier = BYTE_UNITS.get(unit);
  if (!multiplier) return Math.round(value);
  return Math.round(value * multiplier);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function parsePercentFromLine(line: string): number | null {
  const matches = [...line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)];
  if (matches.length === 0) return null;
  const raw = Number(matches[matches.length - 1]?.[1] ?? '');
  if (!Number.isFinite(raw)) return null;
  return clampPercent(raw);
}

export function parseBytePairFromLine(
  line: string,
): { downloadedBytes: number; totalBytes: number; remainingBytes: number } | null {
  const match = line.match(
    /(\d+(?:\.\d+)?)\s*(B|bytes?|KiB|KB|MiB|MB|GiB|GB|TiB|TB)\s*\/\s*(\d+(?:\.\d+)?)\s*(B|bytes?|KiB|KB|MiB|MB|GiB|GB|TiB|TB)/i,
  );
  if (!match) return null;
  const downloadedRaw = Number(match[1]);
  const totalRaw = Number(match[3]);
  if (!Number.isFinite(downloadedRaw) || !Number.isFinite(totalRaw) || totalRaw <= 0) return null;
  const downloadedBytes = toBytes(downloadedRaw, match[2]);
  const totalBytes = toBytes(totalRaw, match[4]);
  if (!Number.isFinite(downloadedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0)
    return null;
  const remainingBytes = Math.max(0, totalBytes - downloadedBytes);
  return { downloadedBytes, totalBytes, remainingBytes };
}

export function stripAnsi(input: string): string {
  if (!input) return input;
  return input.replace(ANSI_ESCAPE_RE, '').replace(ANSI_CSI_RE, '');
}

export function firstNonEmptyLine(...chunks: Array<string | undefined>): string {
  for (const chunk of chunks) {
    if (!chunk) continue;
    const line = chunk
      .split(/\r?\n/)
      .map((entry) => stripAnsi(entry).trim())
      .find(Boolean);
    if (line) return line;
  }
  return '';
}

export function normalizeInstallFailureMessage(raw: string, command: string): string {
  const message = stripAnsi(raw).trim();
  if (!message) {
    return 'Install command failed.';
  }
  if (
    /ENOENT/i.test(message) ||
    /command not found/i.test(message) ||
    /not recognized as an internal or external command/i.test(message)
  ) {
    return `Command not found: ${command}. Install it and ensure PATH is configured.`;
  }
  return message;
}

export function sanitizeCommandResult<T extends DoctorCommandResultLike>(result: T): T {
  return {
    ...result,
    stdout: stripAnsi(result.stdout),
    stderr: stripAnsi(result.stderr),
  };
}

export function getAppiumDriverInstallTarget(step: DoctorInstallStepLike): string | null {
  if (step.args.length < 3) return null;
  if (step.args[0] !== 'driver' || step.args[1] !== 'install') return null;
  return step.args[2] || null;
}

export function isDriverAlreadyInstalledFailure(
  step: DoctorInstallStepLike,
  result: DoctorCommandResultLike,
): boolean {
  const target = getAppiumDriverInstallTarget(step);
  if (!target) return false;
  const message = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return message.includes('already installed');
}

export function normalizeVersionOutput(output: string): string | undefined {
  const line = firstNonEmptyLine(output);
  if (!line) return undefined;
  return line.replace(/^version\s+/i, '').trim();
}

export function parseJavaMajor(output: string): number | null {
  const line = firstNonEmptyLine(output);
  const match = line.match(/version\s+"([^"]+)"/i);
  if (!match) return null;
  const raw = match[1];
  const parts = raw.split('.');
  if (parts[0] === '1' && parts.length > 1) {
    const legacy = Number(parts[1]);
    return Number.isFinite(legacy) ? legacy : null;
  }
  const major = Number(parts[0]);
  return Number.isFinite(major) ? major : null;
}

export function isMissingJavaRuntimeOutput(output: string): boolean {
  const lowered = output.toLowerCase();
  return (
    lowered.includes('unable to locate a java runtime') ||
    lowered.includes('no java runtime present') ||
    lowered.includes('could not find java')
  );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveDriverAliases(driverName: 'xcuitest' | 'uiautomator2'): string[] {
  if (driverName === 'xcuitest') {
    return ['xcuitest', 'appium-xcuitest-driver'];
  }
  return ['uiautomator2', 'appium-uiautomator2-driver'];
}

export function parseInstalledDriverVersion(
  stdout: string,
  driverName: 'xcuitest' | 'uiautomator2',
): string | undefined {
  const cleaned = stripAnsi(stdout);
  const aliases = resolveDriverAliases(driverName)
    .map((alias) => escapeRegExp(alias))
    .join('|');
  const pattern = new RegExp(`\\b(?:${aliases})\\b\\s*(?:@|\\s)\\s*([0-9A-Za-z._-]+)\\b`, 'i');
  const match = cleaned.match(pattern);
  return match?.[1];
}

export function parseInstalledDriverFromJson(
  output: string,
  driverName: 'xcuitest' | 'uiautomator2',
): { installed: boolean; version?: string } | undefined {
  const cleaned = stripAnsi(output).trim();
  if (!cleaned) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return undefined;
  }

  const aliases = new Set(resolveDriverAliases(driverName).map((alias) => alias.toLowerCase()));
  const normalizeVersion = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  };
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const evaluateMatch = (
    entryName: string,
    meta: unknown,
  ): { installed: boolean; version?: string } | null => {
    const metaRecord = asRecord(meta);
    const normalizedName = entryName.toLowerCase();
    const pkgName = typeof metaRecord?.pkgName === 'string' ? metaRecord.pkgName.toLowerCase() : '';
    const installSpec =
      typeof metaRecord?.installSpec === 'string' ? metaRecord.installSpec.toLowerCase() : '';
    if (!aliases.has(normalizedName) && !aliases.has(pkgName) && !aliases.has(installSpec)) {
      return null;
    }

    const installed = typeof metaRecord?.installed === 'boolean' ? metaRecord.installed : true;
    const version = normalizeVersion(metaRecord?.version ?? meta);
    return { installed, version };
  };

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const record = asRecord(entry);
      if (!record) continue;
      const nameCandidate =
        typeof record.name === 'string'
          ? record.name
          : typeof record.driver === 'string'
            ? record.driver
            : '';
      const matched = evaluateMatch(nameCandidate, record);
      if (matched) return matched;
    }
    return { installed: false };
  }

  const root = asRecord(parsed);
  if (!root) return undefined;
  for (const [entryName, meta] of Object.entries(root)) {
    const matched = evaluateMatch(entryName, meta);
    if (matched) return matched;
  }

  return { installed: false };
}
