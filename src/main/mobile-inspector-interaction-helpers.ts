import {
  extractAppiumErrorMessage,
  extractAppiumSessionId,
  parseJson,
} from './mobile-inspector-helpers';

const APPIUM_BASE_URL = 'http://127.0.0.1:4723';

export async function createIosTapSession(
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
    message:
      'Failed to create iOS Appium session. Verify Appium XCUITest driver setup and simulator availability.',
  };
}

export async function runIosTapAction(
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

export async function cleanupIosTapSession(
  sessionId: string,
  basePath: '' | '/wd/hub',
): Promise<void> {
  try {
    await fetch(`${APPIUM_BASE_URL}${basePath}/session/${sessionId}`, { method: 'DELETE' });
  } catch {
    // no-op: session cleanup best effort
  }
}
