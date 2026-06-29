import { spawn } from 'child_process';

import {
  firstNonEmptyLine,
  runCommand,
  sleep,
} from './mobile-inspector-helpers';
import { whichCmd } from './platform';
import { getFullPath } from './pty-manager';

const APPIUM_BASE_URL = 'http://127.0.0.1:4723';
const APPIUM_STARTUP_TIMEOUT_MS = 20_000;
const APPIUM_STARTUP_POLL_MS = 500;

let appiumStartupPromise: Promise<boolean> | null = null;

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

export async function ensureLocalAppiumServerReady(): Promise<{ success: boolean; message?: string }> {
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
