import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getFullPath } from './pty-manager';
import { whichCmd } from './platform';
import {
  choosePreferredIosDevice,
  extractAppiumErrorMessage,
  extractAppiumSessionId,
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
  parseJson,
  parseSimctlDevices,
  readPngSize,
  resolveAndroidNodeAtPoint,
  resolveRunningAndroidEmulator,
  runBinaryCommand,
  runCommand,
  sleep,
  summarizeIosFailure,
  waitForAndroidBootCompleted,
  waitForIosDeviceToSettle as waitForIosDeviceToSettleHelper,
} from './mobile-inspector-helpers';
import type { SimctlDeviceRecord } from './mobile-inspector-helpers';
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
const APPIUM_BASE_URL = 'http://127.0.0.1:4723';
const APPIUM_STARTUP_TIMEOUT_MS = 20_000;
const APPIUM_STARTUP_POLL_MS = 500;

let appiumStartupPromise: Promise<boolean> | null = null;

interface AndroidCommandSet {
  adbBinary: string;
  emulatorBinary: string;
}

function buildSpawnEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: getFullPath() };
}

async function isAppiumServerReachable(pathSuffix: '/status' | '/wd/hub/status' = '/status'): Promise<boolean> {
  try {
    const response = await fetch(`${APPIUM_BASE_URL}${pathSuffix}`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveAppiumBinaryPath(): Promise<string | null> {
  const whichResult = await runCommand(whichCmd, ['appium'], 4_000);
  if (whichResult.code !== 0) return null;
  return firstNonEmptyLine(whichResult.stdout, whichResult.stderr) || null;
}

async function waitForAppiumServerReady(timeoutMs: number = APPIUM_STARTUP_TIMEOUT_MS): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isAppiumServerReachable('/status') || await isAppiumServerReachable('/wd/hub/status')) {
      return true;
    }
    await sleep(APPIUM_STARTUP_POLL_MS);
  }
  return false;
}

async function ensureLocalAppiumServerReady(): Promise<{ success: boolean; message?: string }> {
  if (await isAppiumServerReachable('/status') || await isAppiumServerReachable('/wd/hub/status')) {
    return { success: true };
  }

  if (appiumStartupPromise) {
    const ready = await appiumStartupPromise;
    return ready
      ? { success: true }
      : { success: false, message: 'Appium server is not reachable. Start Appium (`appium`) and retry.' };
  }

  appiumStartupPromise = (async () => {
    const appiumBinary = await resolveAppiumBinaryPath();
    if (!appiumBinary) return false;

    const child = spawn(
      appiumBinary,
      ['--address', '127.0.0.1', '--port', '4723', '--base-path', '/'],
      {
        env: buildSpawnEnv(),
        detached: true,
        stdio: 'ignore',
      },
    );
    child.unref();

    return waitForAppiumServerReady();
  })();

  try {
    const ready = await appiumStartupPromise;
    return ready
      ? { success: true }
      : { success: false, message: 'Appium server did not become ready. Start Appium manually and retry.' };
  } finally {
    appiumStartupPromise = null;
  }
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

async function getIosDeviceByUdid(udid: string): Promise<SimctlDeviceRecord | null> {
  const listResult = await runCommand('xcrun', ['simctl', 'list', 'devices', '--json']);
  if (listResult.code !== 0) return null;
  return parseSimctlDevices(listResult.stdout).find((entry) => entry.udid === udid) ?? null;
}

async function waitForIosDeviceToSettle(udid: string): Promise<SimctlDeviceRecord | null> {
  return waitForIosDeviceToSettleHelper(udid, getIosDeviceByUdid);
}

async function runIosBootRecoverySequence(): Promise<void> {
  await runCommand('xcrun', ['simctl', 'shutdown', 'all'], 20_000);
  await runCommand('killall', ['-9', 'Simulator'], 8_000);
  await runCommand('killall', ['-9', 'com.apple.CoreSimulator.CoreSimulatorService'], 8_000);
  await sleep(1_500);
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

    const captureResult = await runBinaryCommand(resolved.commands.adbBinary, ['-s', ready.deviceId, 'exec-out', 'screencap', '-p']);
    if (captureResult.code !== 0) {
      return {
        platform: 'android',
        success: false,
        message: captureResult.stderr || 'Failed to capture Android emulator screenshot.',
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const normalized = normalizeAndroidScreencap(captureResult.stdout);
    const size = readPngSize(normalized);
    if (!size) {
      return {
        platform: 'android',
        success: false,
        message: 'Android screenshot payload is not a valid PNG image.',
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'android',
      success: true,
      message: 'Android screenshot captured.',
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
      dataUrl: `data:image/png;base64,${normalized.toString('base64')}`,
      width: size.width,
      height: size.height,
      capturedAt: new Date().toISOString(),
    };
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
  const point = {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };

  if (platform === 'android') {
    const resolved = await resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
        point,
      };
    }

    const ready = await ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for inspection.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const dumpPath = '/sdcard/calder-window-dump.xml';
    const dumpResult = await runCommand(resolved.commands.adbBinary, ['-s', ready.deviceId, 'shell', 'uiautomator', 'dump', dumpPath], 30_000);
    if (dumpResult.code !== 0) {
      return {
        platform: 'android',
        success: false,
        message: dumpResult.stderr || 'Failed to dump Android UI hierarchy.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const readResult = await runCommand(resolved.commands.adbBinary, ['-s', ready.deviceId, 'shell', 'cat', dumpPath], 30_000);
    if (readResult.code !== 0 || !readResult.stdout.trim()) {
      return {
        platform: 'android',
        success: false,
        message: readResult.stderr || 'Failed to read Android UI hierarchy dump.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const nodes = parseAndroidHierarchyNodes(readResult.stdout);
    if (nodes.length === 0) {
      return {
        platform: 'android',
        success: false,
        message: 'Android UI hierarchy is empty.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const match = resolveAndroidNodeAtPoint(nodes, point.x, point.y);
    if (!match) {
      return {
        platform: 'android',
        success: false,
        message: 'No Android UI element matched this point.',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'android',
      success: true,
      message: 'Matched Android UI element at selected point.',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
      element: {
        className: match.className,
        text: match.text,
        resourceId: match.resourceId,
        contentDesc: match.contentDesc,
        bounds: match.bounds,
      },
    };
  }

  const ready = await ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for inspection.',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  return {
    platform: 'ios',
    success: false,
    message: 'iOS native hierarchy inspection is not available yet. Point-based routing is still applied.',
    point,
    deviceId: ready.deviceId,
    deviceName: ready.deviceName,
  };
}

async function createIosTapSession(
  deviceId: string | undefined,
  deviceName: string | undefined,
): Promise<{ success: boolean; sessionId?: string; basePath?: '' | '/wd/hub'; message?: string }> {
  const payload = {
    capabilities: {
      alwaysMatch: {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        ...(deviceId ? { 'appium:udid': deviceId } : {}),
        ...(deviceName ? { 'appium:deviceName': deviceName } : {}),
        'appium:newCommandTimeout': 30,
      },
      firstMatch: [{}],
    },
  };

  try {
    const response = await fetch('http://127.0.0.1:4723/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    const parsed = parseJson(raw);
    const sessionId = extractAppiumSessionId(parsed);
    if (response.ok && sessionId) {
      return { success: true, sessionId, basePath: '' };
    }
    const appiumMessage = extractAppiumErrorMessage(parsed);
    if (appiumMessage) {
      return { success: false, message: appiumMessage };
    }
  } catch {
    // fall through to wd/hub fallback
  }

  try {
    const fallbackResponse = await fetch('http://127.0.0.1:4723/wd/hub/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await fallbackResponse.text();
    const parsed = parseJson(raw);
    const sessionId = extractAppiumSessionId(parsed);
    if (fallbackResponse.ok && sessionId) {
      return { success: true, sessionId, basePath: '/wd/hub' };
    }
    const appiumMessage = extractAppiumErrorMessage(parsed);
    if (appiumMessage) {
      return { success: false, message: appiumMessage };
    }
  } catch {
    return {
      success: false,
      message: 'Appium session request failed before server response.',
    };
  }

  return {
    success: false,
    message: 'Failed to create iOS Appium session. Verify Appium XCUITest driver setup and simulator availability.',
  };
}

async function runIosTapAction(
  sessionId: string,
  point: { x: number; y: number },
  basePath: '' | '/wd/hub',
): Promise<{ success: boolean; message?: string }> {
  const actionsUrl = `${APPIUM_BASE_URL}${basePath}/session/${sessionId}/actions`;
  const actionPayload = {
    actions: [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: point.x, y: point.y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 75 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  };

  try {
    const response = await fetch(actionsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(actionPayload),
    });
    const raw = await response.text();
    const parsed = parseJson(raw);
    if (response.ok) {
      return { success: true };
    }
    const appiumMessage = extractAppiumErrorMessage(parsed);
    if (appiumMessage) {
      return { success: false, message: appiumMessage };
    }
  } catch {
    // fall through to the legacy endpoint below
  }

  // Fallback for some XCUITest driver combinations.
  const wdaTapUrl = `${APPIUM_BASE_URL}${basePath}/session/${sessionId}/wda/tap/0`;
  try {
    const fallbackResponse = await fetch(wdaTapUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: point.x, y: point.y }),
    });
    const raw = await fallbackResponse.text();
    const parsed = parseJson(raw);
    if (fallbackResponse.ok) {
      return { success: true };
    }
    const appiumMessage = extractAppiumErrorMessage(parsed);
    if (appiumMessage) {
      return { success: false, message: appiumMessage };
    }
  } catch {
    return { success: false, message: 'iOS tap request failed before Appium returned a response.' };
  }

  return { success: false, message: 'iOS tap request was rejected by Appium.' };
}

async function cleanupIosTapSession(sessionId: string, basePath: '' | '/wd/hub'): Promise<void> {
  try {
    await fetch(`${APPIUM_BASE_URL}${basePath}/session/${sessionId}`, { method: 'DELETE' });
  } catch {
    // no-op: session cleanup best effort
  }
}

export async function interactMobileInspectPoint(
  platform: MobileInspectPlatform,
  x: number,
  y: number,
): Promise<MobileInspectInteractionResult> {
  const point = {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
  };

  if (platform === 'android') {
    const resolved = await resolveAndroidCommandSet();
    if (!resolved.commands) {
      return {
        platform: 'android',
        success: false,
        message: resolved.error || 'Android command line tools are not available.',
        action: 'tap',
        point,
      };
    }

    const ready = await ensureAndroidEmulatorReady(resolved.commands);
    if (!ready.success || !ready.deviceId) {
      return {
        platform: 'android',
        success: false,
        message: ready.message || 'Android emulator is not ready for interaction.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    const tapResult = await runCommand(
      resolved.commands.adbBinary,
      ['-s', ready.deviceId, 'shell', 'input', 'tap', String(point.x), String(point.y)],
      15_000,
    );
    if (tapResult.code !== 0) {
      return {
        platform: 'android',
        success: false,
        message: tapResult.stderr || 'Android tap command failed.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'android',
      success: true,
      message: 'Tap dispatched to Android emulator.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const ready = await ensureIosSimulatorReady();
  if (!ready.success) {
    return {
      platform: 'ios',
      success: false,
      message: ready.message || 'iOS simulator is not ready for interaction.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const appiumReady = await ensureLocalAppiumServerReady();
  if (!appiumReady.success) {
    return {
      platform: 'ios',
      success: false,
      message: appiumReady.message || 'Appium server is not ready.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  const session = await createIosTapSession(ready.deviceId, ready.deviceName);
  if (!session.success || !session.sessionId || session.basePath === undefined) {
    return {
      platform: 'ios',
      success: false,
      message: session.message || 'Failed to create iOS interaction session.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  }

  try {
    const tapResult = await runIosTapAction(session.sessionId, point, session.basePath);
    if (!tapResult.success) {
      return {
        platform: 'ios',
        success: false,
        message: tapResult.message || 'iOS tap action failed.',
        action: 'tap',
        point,
        deviceId: ready.deviceId,
        deviceName: ready.deviceName,
      };
    }

    return {
      platform: 'ios',
      success: true,
      message: 'Tap dispatched to iOS simulator.',
      action: 'tap',
      point,
      deviceId: ready.deviceId,
      deviceName: ready.deviceName,
    };
  } finally {
    await cleanupIosTapSession(session.sessionId, session.basePath);
  }
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
