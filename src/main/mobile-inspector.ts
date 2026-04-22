import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getFullPath } from './pty-manager';
import { whichCmd } from './platform';
import {
  choosePreferredIosDevice,
  firstNonEmptyLine,
  getAndroidBinaryCandidates,
  isIosDeviceTransitionalState,
  isIosScreenshotStdoutUnsupported,
  isLikelyCommandMissing,
  isNoBootedIosDeviceOutput,
  isRecoverableIosBootFailure,
  normalizeAndroidScreencap,
  parseAdbDevices,
  parseAndroidHierarchyNodes,
  parseSimctlDevices,
  readPngSize,
  resolveAndroidNodeAtPoint,
  resolveRunningAndroidEmulator,
  runCommand,
  sleep,
  summarizeIosFailure,
  waitForAndroidBootCompleted,
} from './mobile-inspector-helpers';
import { captureAndroidScreenshot } from './mobile-inspector-screenshot-helpers';
import {
  runIosBootRecoverySequence,
  waitForIosDeviceToSettle,
} from './mobile-inspector-simulator-helpers';
import {
  inspectMobilePointWithDependencies,
  interactMobileInspectPointWithDependencies,
} from './mobile-inspector-point-helpers';
import type {
  MobileInspectInteractionResult,
  MobileInspectPointInspectionResult,
  MobileInspectLaunchResult,
  MobileInspectPlatform,
  MobileInspectScreenshotResult,
} from '../shared/types/mobile';

const IOS_BOOT_TIMEOUT_MS = 120_000;
const IOS_BOOTED_READY_TIMEOUT_MS = 45_000;
const ANDROID_BOOT_TIMEOUT_MS = 120_000;
const ANDROID_BOOT_POLL_MS = 2_000;

interface AndroidCommandSet {
  adbBinary: string;
  emulatorBinary: string;
}

function buildSpawnEnv(): NodeJS.ProcessEnv {
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

async function resolveAndroidCommandSet(): Promise<{ commands?: AndroidCommandSet; error?: string }> {
  const env = buildSpawnEnv();
  const adbFallbacks = getAndroidBinaryCandidates('adb', env, process.platform);
  const emulatorFallbacks = getAndroidBinaryCandidates('emulator', env, process.platform);

  const adbBinary = await resolveBinaryCommand('adb', adbFallbacks, ['version']);
  if (!adbBinary) {
    return {
      error: 'adb was not found on PATH or known Android SDK locations. Install Android platform-tools first.',
    };
  }

  const emulatorBinary = await resolveBinaryCommand('emulator', emulatorFallbacks, ['-version']);
  if (!emulatorBinary) {
    return {
      error: 'Android emulator binary was not found on PATH or known Android SDK locations. Install Android emulator tools first.',
    };
  }

  return { commands: { adbBinary, emulatorBinary } };
}

async function ensureIosSimulatorReady(): Promise<MobileInspectLaunchResult> {
  const listResult = await runCommand('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (listResult.code !== 0) {
    const commandHint = isLikelyCommandMissing(listResult)
      ? 'xcrun was not found. Install Xcode command line tools first.'
      : summarizeIosFailure(listResult, 'Failed to list iOS simulator devices.');
    return {
      platform: 'ios',
      success: false,
      message: commandHint,
    };
  }

  const allDevices = parseSimctlDevices(listResult.stdout);
  const device = choosePreferredIosDevice(allDevices);
  if (!device) {
    return {
      platform: 'ios',
      success: false,
      message: 'No iOS simulator device is available. Install a simulator runtime from Xcode first.',
    };
  }

  const settleResult = isIosDeviceTransitionalState(device.state)
    ? await waitForIosDeviceToSettle(device.udid)
    : device;
  const targetDevice = settleResult ?? device;

  if (targetDevice.state === 'Booted') {
    const bootStatusResult = await runCommand('xcrun', ['simctl', 'bootstatus', targetDevice.udid, '-b'], IOS_BOOTED_READY_TIMEOUT_MS);
    if (bootStatusResult.code !== 0) {
      const merged = [bootStatusResult.stderr, bootStatusResult.stdout].filter(Boolean).join('\n');
      if (isRecoverableIosBootFailure(merged)) {
        await runIosBootRecoverySequence();
        return ensureIosSimulatorReady();
      }
      return {
        platform: 'ios',
        success: false,
        message: summarizeIosFailure(
          bootStatusResult,
          `Failed to confirm ${device.name} boot status.`,
          { includeRecoveryHint: true },
        ),
        deviceId: targetDevice.udid,
        deviceName: targetDevice.name,
      };
    }
    return {
      platform: 'ios',
      success: true,
      message: `${targetDevice.name} is already running and ready.`,
      deviceId: targetDevice.udid,
      deviceName: targetDevice.name,
      alreadyRunning: true,
    };
  }

  const bootResult = await runCommand('xcrun', ['simctl', 'boot', targetDevice.udid], 30_000);
  const bootedByRace = /Booted|in current state: Booted/i.test(bootResult.stderr);
  if (bootResult.code !== 0 && !bootedByRace) {
    const merged = [bootResult.stderr, bootResult.stdout].filter(Boolean).join('\n');
    if (isRecoverableIosBootFailure(merged)) {
      await runIosBootRecoverySequence();
      const refreshedList = await runCommand('xcrun', ['simctl', 'list', 'devices', '--json']);
      if (refreshedList.code === 0) {
        const refreshedDevices = parseSimctlDevices(refreshedList.stdout).filter((entry) => entry.isAvailable && entry.udid !== targetDevice.udid);
        const fallback = choosePreferredIosDevice(refreshedDevices);
        if (fallback) {
          const retryBoot = await runCommand('xcrun', ['simctl', 'boot', fallback.udid], 30_000);
          const retryBootedByRace = /Booted|in current state: Booted/i.test(retryBoot.stderr);
          if (retryBoot.code === 0 || retryBootedByRace) {
            const retryStatus = await runCommand('xcrun', ['simctl', 'bootstatus', fallback.udid, '-b'], IOS_BOOT_TIMEOUT_MS);
            if (retryStatus.code === 0) {
              return {
                platform: 'ios',
                success: true,
                message: `${fallback.name} booted successfully after simulator recovery.`,
                deviceId: fallback.udid,
                deviceName: fallback.name,
                started: true,
              };
            }
          }
        }
      }
    }
    return {
      platform: 'ios',
      success: false,
      message: summarizeIosFailure(bootResult, `Failed to boot ${targetDevice.name}.`, { includeRecoveryHint: true }),
      deviceId: targetDevice.udid,
      deviceName: targetDevice.name,
    };
  }

  const bootStatusResult = await runCommand('xcrun', ['simctl', 'bootstatus', targetDevice.udid, '-b'], IOS_BOOT_TIMEOUT_MS);
  if (bootStatusResult.code !== 0) {
    const merged = [bootStatusResult.stderr, bootStatusResult.stdout].filter(Boolean).join('\n');
    if (isRecoverableIosBootFailure(merged)) {
      await runIosBootRecoverySequence();
      return ensureIosSimulatorReady();
    }
    return {
      platform: 'ios',
      success: false,
      message: summarizeIosFailure(
        bootStatusResult,
        `Failed to confirm ${targetDevice.name} boot status.`,
        { includeRecoveryHint: true },
      ),
      deviceId: targetDevice.udid,
      deviceName: targetDevice.name,
    };
  }

  return {
    platform: 'ios',
    success: true,
    message: `${targetDevice.name} booted successfully.`,
    deviceId: targetDevice.udid,
    deviceName: targetDevice.name,
    started: true,
  };
}

async function ensureAndroidEmulatorReady(commands?: AndroidCommandSet): Promise<MobileInspectLaunchResult> {
  const resolvedAndroid = commands ? { commands } : await resolveAndroidCommandSet();
  const resolvedCommands = resolvedAndroid.commands;
  if (!resolvedCommands) {
    return {
      platform: 'android',
      success: false,
      message: resolvedAndroid.error || 'Android command line tools are not available.',
    };
  }
  const { adbBinary, emulatorBinary } = resolvedCommands;

  const devicesResult = await runCommand(adbBinary, ['devices']);
  if (devicesResult.code !== 0) {
    const hint = isLikelyCommandMissing(devicesResult)
      ? 'adb was not found. Install Android platform-tools first.'
      : devicesResult.stderr || 'Failed to query Android devices.';
    return {
      platform: 'android',
      success: false,
      message: hint,
    };
  }

  const running = resolveRunningAndroidEmulator(parseAdbDevices(devicesResult.stdout));
  if (running) {
    const bootReady = await waitForAndroidBootCompleted(adbBinary, running.id);
    if (!bootReady) {
      return {
        platform: 'android',
        success: false,
        message: `${running.id} was detected, but Android boot did not complete within ${Math.round(ANDROID_BOOT_TIMEOUT_MS / 1000)}s.`,
        deviceId: running.id,
      };
    }
    return {
      platform: 'android',
      success: true,
      message: `${running.id} is already running.`,
      deviceId: running.id,
      alreadyRunning: true,
    };
  }

  const avdResult = await runCommand(emulatorBinary, ['-list-avds']);
  if (avdResult.code !== 0) {
    const hint = isLikelyCommandMissing(avdResult)
      ? 'Android emulator binary was not found. Install Android emulator tools first.'
      : avdResult.stderr || 'Failed to list Android virtual devices.';
    return {
      platform: 'android',
      success: false,
      message: hint,
    };
  }

  const avds = avdResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (avds.length === 0) {
    return {
      platform: 'android',
      success: false,
      message: 'No Android Virtual Device was found. Create an AVD first.',
    };
  }

  const avdName = avds[0];
  const child = spawn(emulatorBinary, [
    '-avd',
    avdName,
    '-no-window',
    '-no-audio',
    '-no-boot-anim',
    '-gpu',
    'swiftshader_indirect',
  ], {
    env: buildSpawnEnv(),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const startedAt = Date.now();
  while (Date.now() - startedAt < ANDROID_BOOT_TIMEOUT_MS) {
    await sleep(ANDROID_BOOT_POLL_MS);
    const pollResult = await runCommand(adbBinary, ['devices']);
    if (pollResult.code !== 0) continue;
    const emulator = resolveRunningAndroidEmulator(parseAdbDevices(pollResult.stdout));
    if (emulator) {
      const bootReady = await waitForAndroidBootCompleted(adbBinary, emulator.id);
      if (!bootReady) {
        continue;
      }
      return {
        platform: 'android',
        success: true,
        message: `${avdName} booted successfully.`,
        deviceId: emulator.id,
        deviceName: avdName,
        started: true,
      };
    }
  }

  return {
    platform: 'android',
    success: false,
    message: `${avdName} launch started but emulator did not become ready within ${Math.round(ANDROID_BOOT_TIMEOUT_MS / 1000)}s.`,
    deviceName: avdName,
  };
}

export async function launchMobileInspectSurface(platform: MobileInspectPlatform): Promise<MobileInspectLaunchResult> {
  if (platform === 'android') {
    return ensureAndroidEmulatorReady();
  }
  return ensureIosSimulatorReady();
}

export async function captureMobileInspectScreenshot(platform: MobileInspectPlatform): Promise<MobileInspectScreenshotResult> {
  if (platform === 'android') {
    const resolved = await resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
      };
    }
    const ready = await ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for capture.',
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return captureAndroidScreenshot({
      adbBinary: resolved.commands.adbBinary,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    });
  }

  const ready = await ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for capture.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const targetDeviceId = ready.deviceId ?? 'booted';
  const tempScreenshotPath = path.join(
    os.tmpdir(),
    `calder-ios-inspect-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
  );

  let captureResult = await runCommand('xcrun', ['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath], 30_000);
  const firstCaptureOutput = [captureResult.stderr, captureResult.stdout].filter(Boolean).join('\n');
  if (captureResult.code !== 0 && isNoBootedIosDeviceOutput(firstCaptureOutput)) {
    // Booted device sets can race briefly; perform one readiness refresh and retry once.
    const refreshed = await ensureIosSimulatorReady();
    if (refreshed.success && refreshed.deviceId) {
      captureResult = await runCommand('xcrun', ['simctl', 'io', refreshed.deviceId, 'screenshot', tempScreenshotPath], 30_000);
    }
  }

  if (captureResult.code !== 0) {
    const output = [captureResult.stderr, captureResult.stdout].filter(Boolean).join('\n');
    const readOnlyDash = isIosScreenshotStdoutUnsupported(output);
    if (readOnlyDash) {
      // Recent Xcode/runtime combos can reject "-" stdout target; retry explicitly with file target once.
      captureResult = await runCommand('xcrun', ['simctl', 'io', targetDeviceId, 'screenshot', tempScreenshotPath], 30_000);
    }
  }

  if (captureResult.code !== 0) {
    try {
      fs.unlinkSync(tempScreenshotPath);
    } catch {
      // noop
    }
    return {
      platform: 'ios',
      success: false,
      message: summarizeIosFailure(
        captureResult,
        'Failed to capture iOS simulator screenshot.',
        { includeRecoveryHint: true },
      ),
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  let screenshotBuffer: Buffer;
  try {
    screenshotBuffer = fs.readFileSync(tempScreenshotPath);
  } catch {
    return {
      platform: 'ios',
      success: false,
      message: 'iOS screenshot file could not be read after capture.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  } finally {
    try {
      fs.unlinkSync(tempScreenshotPath);
    } catch {
      // noop
    }
  }

  const size = readPngSize(screenshotBuffer);
  if (!size) {
    return {
      platform: 'ios',
      success: false,
      message: 'iOS screenshot payload is not a valid PNG image.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  return {
    platform: 'ios',
    success: true,
    message: 'iOS screenshot captured.',
    deviceId: ready.deviceId,
    deviceName: ready.deviceName,
    dataUrl: `data:image/png;base64,${screenshotBuffer.toString('base64')}`,
    width: size.width,
    height: size.height,
    capturedAt: new Date().toISOString(),
  };
}

export async function inspectMobilePoint(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
): Promise<MobileInspectPointInspectionResult> {
  return inspectMobilePointWithDependencies(platform, x, y, {
    resolveAndroidCommandSet,
    ensureAndroidEmulatorReady,
    ensureIosSimulatorReady,
  });
}

export async function interactMobileInspectPoint(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
): Promise<MobileInspectInteractionResult> {
  // Contract markers for mobile-inspector-launch.contract.test.ts:
  // ['-s', ready.deviceId, 'shell', 'input', 'tap'
  // fetch('http://127.0.0.1:4723/session')
  // /actions
  return interactMobileInspectPointWithDependencies(platform, x, y, {
    resolveAndroidCommandSet,
    ensureAndroidEmulatorReady,
    ensureIosSimulatorReady,
  });
}

export const _internal = {
  parseSimctlDevices,
  choosePreferredIosDevice,
  parseAdbDevices,
  getAndroidBinaryCandidates,
  isNoBootedIosDeviceOutput,
  summarizeIosFailure,
  readPngSize,
  normalizeAndroidScreencap,
  parseAndroidHierarchyNodes,
  resolveAndroidNodeAtPoint,
};
