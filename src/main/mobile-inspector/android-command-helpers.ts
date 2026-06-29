import {
  firstNonEmptyLine,
  getAndroidBinaryCandidates,
  runCommand,
} from '../mobile-inspector-helpers';
import { whichCmd } from '../platform';
import { getFullPath } from '../pty-manager';

export interface AndroidCommandSet {
  adbBinary: string;
  emulatorBinary: string;
}

function buildResolveEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getFullPath() };
}

async function resolveBinaryCommand(
  binary: 'adb' | 'emulator',
  fallbackPaths: string[],
  probeArgs: string[],
): Promise<string | null> {
  const whichResult = await runCommand(whichCmd, [binary], 4_000);
  if (whichResult.code === 0) {
    const first = firstNonEmptyLine(whichResult.stdout, whichResult.stderr);
    if (first) return first;
  }

  for (const candidate of fallbackPaths) {
    const probe = await runCommand(candidate, probeArgs, 8_000);
    if (probe.code === 0) return candidate;
  }

  return null;
}

export async function resolveAndroidCommandSet(): Promise<{
  commands?: AndroidCommandSet;
  error?: string;
}> {
  const env = buildResolveEnv();
  const adbFallbacks = getAndroidBinaryCandidates('adb', env, process.platform);
  const emulatorFallbacks = getAndroidBinaryCandidates('emulator', env, process.platform);

  const adbBinary = await resolveBinaryCommand('adb', adbFallbacks, ['version']);
  if (!adbBinary) {
    return {
      error:
        'adb was not found on PATH or known Android SDK locations. Install Android platform-tools first.',
    };
  }

  const emulatorBinary = await resolveBinaryCommand('emulator', emulatorFallbacks, ['-version']);
  if (!emulatorBinary) {
    return {
      error:
        'Android emulator binary was not found on PATH or known Android SDK locations. Install Android emulator tools first.',
    };
  }

  return { commands: { adbBinary, emulatorBinary } };
}
