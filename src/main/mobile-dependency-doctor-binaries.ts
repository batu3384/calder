import * as os from 'os';
import * as path from 'path';
import { whichCmd } from './platform';
import { firstNonEmptyLine } from './mobile-dependency-doctor-utils';

interface BinaryProbeResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface BinaryCommandRunner {
  run(
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ): Promise<BinaryProbeResult>;
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of paths) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/[\\/]+$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function getAndroidSdkRoots(env: NodeJS.ProcessEnv): string[] {
  const roots: string[] = [];
  if (env.ANDROID_HOME) roots.push(env.ANDROID_HOME);
  if (env.ANDROID_SDK_ROOT) roots.push(env.ANDROID_SDK_ROOT);

  const home = env.HOME || os.homedir();
  if (home) {
    roots.push(path.join(home, 'Library', 'Android', 'sdk'));
    roots.push(path.join(home, 'Android', 'Sdk'));
    roots.push(path.join(home, 'AppData', 'Local', 'Android', 'Sdk'));
  }

  if (env.LOCALAPPDATA) {
    roots.push(path.join(env.LOCALAPPDATA, 'Android', 'Sdk'));
  }

  return uniquePaths(roots);
}

export function getAndroidBinaryCandidates(
  binary: 'sdkmanager' | 'avdmanager' | 'adb' | 'emulator',
  env: NodeJS.ProcessEnv,
  hostPlatform: NodeJS.Platform,
): string[] {
  const sdkRoots = getAndroidSdkRoots(env);
  const isWindowsHost = hostPlatform === 'win32';
  const commandName = isWindowsHost
    ? binary === 'adb' || binary === 'emulator'
      ? `${binary}.exe`
      : `${binary}.bat`
    : binary;

  if (binary === 'sdkmanager' || binary === 'avdmanager') {
    const suffixes = [
      path.join('cmdline-tools', 'latest', 'bin', commandName),
      path.join('cmdline-tools', 'bin', commandName),
      path.join('tools', 'bin', commandName),
    ];
    return uniquePaths(
      sdkRoots.flatMap((sdkRoot) => suffixes.map((suffix) => path.join(sdkRoot, suffix))),
    );
  }

  if (binary === 'adb') {
    return uniquePaths(sdkRoots.map((sdkRoot) => path.join(sdkRoot, 'platform-tools', commandName)));
  }

  return uniquePaths(sdkRoots.map((sdkRoot) => path.join(sdkRoot, 'emulator', commandName)));
}

export async function resolveBinary(
  runner: BinaryCommandRunner,
  binary: string,
  options?: { fallbackPaths?: string[]; probeArgs?: string[] },
): Promise<string | null> {
  const check = await runner.run(whichCmd, [binary], { timeoutMs: 4_000 });
  if (check.code === 0) {
    const first = firstNonEmptyLine(check.stdout, check.stderr);
    if (first) return first;
  }

  const fallbackPaths = options?.fallbackPaths ?? [];
  if (fallbackPaths.length === 0) return null;

  const probeArgs = options?.probeArgs ?? ['--version'];
  for (const fallbackPath of fallbackPaths) {
    const probe = await runner.run(fallbackPath, probeArgs, { timeoutMs: 8_000 });
    if (probe.code === 0) {
      return fallbackPath;
    }
  }

  return null;
}
