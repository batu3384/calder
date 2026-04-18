import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { getFullPath } from '../pty-manager';
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
const PREREQ_ALIAS_PROBE_TIMEOUT_MS = 250;
const PREREQ_CACHE_TTL_MS = 10_000;

type PrereqCheckCacheEntry = {
  checkedAtMs: number;
};

const prereqCheckCache = new Map<string, PrereqCheckCacheEntry>();

function logBinaryProbeWarning(context: string, error: unknown): void {
  console.warn(`[resolve-binary] ${context}`, error);
}

function expandHomePath(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function findAliasLauncher(binaryName: string, timeoutMs = DEFAULT_BINARY_PROBE_TIMEOUT_MS): string | null {
  if (isWin) return null;

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
  try {
    const resolved = execSync(`${whichCmd} "${binaryName}"`, {
      env: { ...process.env, PATH: envPath },
      encoding: 'utf-8',
      timeout: DEFAULT_BINARY_PROBE_TIMEOUT_MS,
    }).trim();
    // 'where' on Windows may return multiple lines — take the first
    const firstLine = resolved.split(/\r?\n/)[0];
    return firstLine || null;
  } catch {
    return null;
  }
}

export function resolveBinary(binaryName: string, cache: { path: string | null }): string {
  if (cache.path) return cache.path;

  const aliasLauncher = findAliasLauncher(binaryName);
  if (aliasLauncher) {
    cache.path = aliasLauncher;
    return aliasLauncher;
  }

  const fullPath = getFullPath();

  for (const dir of COMMON_BIN_DIRS) {
    const found = findBinaryInDir(dir, binaryName);
    if (found) {
      cache.path = found;
      return found;
    }
  }

  const resolved = whichBinary(binaryName, fullPath);
  if (resolved) {
    cache.path = resolved;
    return resolved;
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

  if (cached && (nowMs - cached.checkedAtMs) < PREREQ_CACHE_TTL_MS) {
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

  let ok = false;
  for (const dir of COMMON_BIN_DIRS) {
    if (findBinaryInDir(dir, binaryName)) {
      ok = true;
      break;
    }
  }

  if (!ok && whichBinary(binaryName, envPath)) {
    ok = true;
  }

  // Alias probing is intentionally last and short-lived, since login shells
  // can be slow and this check runs for multiple providers during startup.
  if (!ok && findAliasLauncher(binaryName, PREREQ_ALIAS_PROBE_TIMEOUT_MS)) {
    ok = true;
  }

  if (ok) {
    prereqCheckCache.delete(cacheKey);
    return { ok: true, message: '' };
  }

  prereqCheckCache.set(cacheKey, { checkedAtMs: nowMs });

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
