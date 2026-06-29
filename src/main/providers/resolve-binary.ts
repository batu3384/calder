import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getFullPath } from '../full-path';
import { isWin, whichCmd } from '../platform';
const COMMON_BIN_DIRS = isWin
  ? [
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
      path.join(os.homedir(), '.local', 'bin'),
    ]
  : [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(os.homedir(), '.local', 'bin'),
      path.join(os.homedir(), '.npm-global', 'bin'),
    ];

// On Windows, CLI tools installed via npm are .cmd shims
const WIN_EXTENSIONS = ['.cmd', '.exe', '.ps1', ''];
const DEFAULT_BINARY_PROBE_TIMEOUT_MS = 3000;
const PREREQ_CACHE_TTL_MS = 10_000;
const LAUNCH_PROBE_TIMEOUT_MS = 2500;

type PrereqCheckCacheEntry = {
  checkedAtMs: number;
  ok: boolean;
};

const prereqCheckCache = new Map<string, PrereqCheckCacheEntry>();

/** Allowlist pattern for valid binary names — alphanumeric, dots, dashes, underscores only. */
const SAFE_BINARY_NAME_PATTERN = /^[a-zA-Z0-9_./-]+$/;

function logBinaryProbeWarning(context: string, error: unknown): void {
  console.warn(`[resolve-binary] ${context}`, error);
}

/**
 * Validates a binary name before it is used in shell commands.
 * Rejects names with shell metacharacters that could enable command injection.
 */
function validateBinaryName(binaryName: string): void {
  if (!SAFE_BINARY_NAME_PATTERN.test(binaryName)) {
    throw new Error(`[resolve-binary] unsafe binary name rejected: ${binaryName.slice(0, 80)}`);
  }
}

function expandHomePath(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function findAliasLauncher(
  binaryName: string,
  timeoutMs = DEFAULT_BINARY_PROBE_TIMEOUT_MS,
): string | null {
  if (isWin) return null;

  validateBinaryName(binaryName);

  const shell = process.env.SHELL || '/bin/zsh';

  try {
    const resolved = execSync(`${shell} -ilc 'command -v "${binaryName}"'`, {
      env: { ...process.env, HOME: os.homedir() },
      encoding: 'utf-8',
      timeout: timeoutMs,
    }).trim();

    const aliasMatch = resolved.match(/^alias\s+\S+=(['"])(.+)\1$/s);
    if (!aliasMatch) return null;

    const aliasValue = aliasMatch[2].trim();
    const executable = expandHomePath(aliasValue.split(/\s+/)[0] || '');
    if (!executable) return null;

    return fs.existsSync(executable) ? executable : null;
  } catch {
    return null;
  }
}

function findBinaryInDir(dir: string, binaryName: string): string | null {
  if (isWin) {
    for (const ext of WIN_EXTENSIONS) {
      const candidate = path.join(dir, binaryName + ext);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch (error) {
        logBinaryProbeWarning(`Failed to probe candidate path: ${candidate}`, error);
      }
    }
    return null;
  }
  const candidate = path.join(dir, binaryName);
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch (error) {
    logBinaryProbeWarning(`Failed to probe candidate path: ${candidate}`, error);
  }
  return null;
}

function whichBinary(binaryName: string, envPath: string): string | null {
  validateBinaryName(binaryName);
  try {
    const resolved = execSync(`${whichCmd} "${binaryName}"`, {
      env: { ...process.env, PATH: envPath },
      encoding: 'utf-8',
      timeout: DEFAULT_BINARY_PROBE_TIMEOUT_MS,
    }).trim();
    // 'where' on Windows may return multiple lines — take the first
    const firstLine = resolved.split(/\r?\n/)[0]?.trim();
    return firstLine || null;
  } catch {
    return null;
  }
}

function isAbsoluteBinaryPath(binaryPath: string): boolean {
  return path.isAbsolute(binaryPath) || path.win32.isAbsolute(binaryPath);
}

function probeBinaryLaunchable(binaryPath: string): boolean {
  if (!binaryPath || !isAbsoluteBinaryPath(binaryPath)) return false;
  try {
    if (!fs.existsSync(binaryPath)) return false;
  } catch (error) {
    logBinaryProbeWarning(`Failed to probe candidate path: ${binaryPath}`, error);
    return false;
  }

  try {
    const result = spawnSync(binaryPath, ['--help'], {
      env: { ...process.env, PATH: getFullPath() },
      timeout: LAUNCH_PROBE_TIMEOUT_MS,
      stdio: 'ignore',
      windowsHide: true,
    });
    return result.status === 0;
  } catch (error) {
    logBinaryProbeWarning(`Launch probe failed for ${binaryPath}`, error);
    return false;
  }
}

function listBinaryCandidates(binaryName: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  push(findAliasLauncher(binaryName));
  push(whichBinary(binaryName, getFullPath()));
  for (const dir of COMMON_BIN_DIRS) {
    push(findBinaryInDir(dir, binaryName));
  }
  return candidates;
}

function findLaunchableBinary(binaryName: string): string | null {
  for (const candidate of listBinaryCandidates(binaryName)) {
    if (probeBinaryLaunchable(candidate)) return candidate;
  }
  return null;
}

function findExistingBinary(binaryName: string): string | null {
  for (const candidate of listBinaryCandidates(binaryName)) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (error) {
      logBinaryProbeWarning(`Failed to probe candidate path: ${candidate}`, error);
    }
  }
  return null;
}

function findInstalledBinary(binaryName: string): string | null {
  return findLaunchableBinary(binaryName) ?? findExistingBinary(binaryName);
}

export function resolveBinary(binaryName: string, cache: { path: string | null }): string {
  if (cache.path) {
    if (probeBinaryLaunchable(cache.path)) return cache.path;
    cache.path = null;
  }

  const launchable = findLaunchableBinary(binaryName);
  if (launchable) {
    cache.path = launchable;
    return launchable;
  }

  cache.path = binaryName;
  return binaryName;
}

export function validateBinaryExists(
  binaryName: string,
  displayName: string,
  installCommand: string,
): { ok: boolean; message: string } {
  const envPath = getFullPath();
  const cacheKey = `${binaryName}::${envPath}`;
  const nowMs = Date.now();
  const cached = prereqCheckCache.get(cacheKey);

  if (cached && cached.ok && nowMs - cached.checkedAtMs < PREREQ_CACHE_TTL_MS) {
    return { ok: true, message: '' };
  }

  const installed = findInstalledBinary(binaryName);
  if (installed) {
    prereqCheckCache.set(cacheKey, { checkedAtMs: nowMs, ok: true });
    return { ok: true, message: '' };
  }

  prereqCheckCache.set(cacheKey, { checkedAtMs: nowMs, ok: false });

  return {
    ok: false,
    message:
      `${displayName} not found.\n\n` +
      `Calder can launch sessions with ${displayName} after it is installed.\n\n` +
      `Install it with:\n` +
      `  ${installCommand}\n\n` +
      `After installing, restart Calder.`,
  };
}

/** @internal Test-only helper for clearing prerequisite-result memoization. */
export function _resetPrereqCheckCache(): void {
  prereqCheckCache.clear();
}
