import { spawn } from 'child_process';

import type { MobileInspectLaunchResult } from '../../shared/types/mobile';
import {
  choosePreferredIosDevice,
  isIosDeviceTransitionalState,
  isLikelyCommandMissing,
  isRecoverableIosBootFailure,
  parseAdbDevices,
  parseSimctlDevices,
  resolveRunningAndroidEmulator,
  runCommand,
  sleep,
  summarizeIosFailure,
  waitForAndroidBootCompleted,
} from '../mobile-inspector-helpers';
import {
  runIosBootRecoverySequence,
  waitForIosDeviceToSettle,
} from '../mobile-inspector-simulator-helpers';
import { getFullPath } from '../pty-manager';
import { type AndroidCommandSet, resolveAndroidCommandSet } from './android-command-helpers';

const IOS_BOOT_TIMEOUT_MS = 120_000;
const IOS_BOOTED_READY_TIMEOUT_MS = 45_000;
const ANDROID_BOOT_TIMEOUT_MS = 120_000;
const ANDROID_BOOT_POLL_MS = 2_000;

function buildSpawnEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getFullPath() };
}

export async function ensureIosSimulatorReady(): Promise<MobileInspectLaunchResult> {
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
      message:
        'No iOS simulator device is available. Install a simulator runtime from Xcode first.',
    };
  }

  const settleResult = isIosDeviceTransitionalState(device.state)
    ? await waitForIosDeviceToSettle(device.udid)
    : device;
  const targetDevice = settleResult ?? device;

  if (targetDevice.state === 'Booted') {
    const bootStatusResult = await runCommand(
      'xcrun',
      ['simctl', 'bootstatus', targetDevice.udid, '-b'],
      IOS_BOOTED_READY_TIMEOUT_MS,
    );
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
        const refreshedDevices = parseSimctlDevices(refreshedList.stdout).filter(
          (entry: { isAvailable: boolean; udid: string }) =>
            entry.isAvailable && entry.udid !== targetDevice.udid,
        );
        const fallback = choosePreferredIosDevice(refreshedDevices);
        if (fallback) {
          const retryBoot = await runCommand('xcrun', ['simctl', 'boot', fallback.udid], 30_000);
          const retryBootedByRace = /Booted|in current state: Booted/i.test(retryBoot.stderr);
          if (retryBoot.code === 0 || retryBootedByRace) {
            const retryStatus = await runCommand(
              'xcrun',
              ['simctl', 'bootstatus', fallback.udid, '-b'],
              IOS_BOOT_TIMEOUT_MS,
            );
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
      message: summarizeIosFailure(bootResult, `Failed to boot ${targetDevice.name}.`, {
        includeRecoveryHint: true,
      }),
      deviceId: targetDevice.udid,
      deviceName: targetDevice.name,
    };
  }

  const bootStatusResult = await runCommand(
    'xcrun',
    ['simctl', 'bootstatus', targetDevice.udid, '-b'],
    IOS_BOOT_TIMEOUT_MS,
  );
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

export async function ensureAndroidEmulatorReady(
  commands?: AndroidCommandSet,
): Promise<MobileInspectLaunchResult> {
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
    .map((line: string) => line.trim())
    .filter(Boolean);
  if (avds.length === 0) {
    return {
      platform: 'android',
      success: false,
      message: 'No Android Virtual Device was found. Create an AVD first.',
    };
  }

  const avdName = avds[0];
  const child = spawn(
    emulatorBinary,
    ['-avd', avdName, '-no-window', '-no-audio', '-no-boot-anim', '-gpu', 'swiftshader_indirect'],
    {
      env: buildSpawnEnv(),
      detached: true,
      stdio: 'ignore',
    },
  );
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
