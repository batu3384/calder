import { afterEach, describe, expect, it } from 'vitest';
import {
  consumeMobileControlPairingAnswer,
  createMobileControlPairing,
  revokeMobileControlPairing,
  stopMobileControlBridge,
} from './mobile-control-bridge';

interface HttpResult {
  status: number;
  text: string;
  json: unknown;
}

function toLoopbackUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = '127.0.0.1';
  return parsed.toString();
}

async function getRequest(url: string): Promise<HttpResult> {
  const response = await fetch(url);
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    text,
    json,
  };
}

async function postJson(url: string, payload: unknown): Promise<HttpResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    text,
    json,
  };
}

const initialPublicBaseUrl = process.env.CALDER_MOBILE_PUBLIC_BASE_URL;

afterEach(async () => {
  if (typeof initialPublicBaseUrl === 'string') {
    process.env.CALDER_MOBILE_PUBLIC_BASE_URL = initialPublicBaseUrl;
  } else {
    delete process.env.CALDER_MOBILE_PUBLIC_BASE_URL;
  }
  await stopMobileControlBridge();
});

describe('mobile-control-bridge', () => {
  it('creates a pairing page protected by token + one-time OTP, then returns consumable answer', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-1',
      offer: 'offer-code-1',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readwrite',
    });
    const pairingUrl = new URL(toLoopbackUrl(pairing.pairingUrl));

    const page = await getRequest(pairingUrl.toString());
    expect(page.status).toBe(200);
    expect(page.text).toContain('Calder Mobile Control');
    expect(page.text).toContain('data-mobile-view-tab="terminal"');
    expect(page.text).toContain('data-mobile-view-tab="controls"');
    expect(page.text).toContain('data-mobile-session-select');
    expect(page.text).toContain('data-mobile-session-switch');
    expect(page.text).toContain('data-mobile-stage-chip');
    expect(page.text).toContain('data-mobile-shortcut-toggle');
    expect(page.text).toContain('Show shortcuts');
    expect(page.text).toContain('Quick controls');
    expect(page.text).toContain('data-mobile-terminal-clear');
    expect(page.text).toContain('data-mobile-terminal-copy');
    expect(page.text).toContain('data-mobile-terminal-follow');
    expect(page.text).toContain('data-mobile-history-prev');
    expect(page.text).toContain('data-mobile-history-next');
    expect(page.text).toContain('data-mobile-command-chip');
    expect(page.text).toContain('data-control="ctrl-c"');
    expect(page.text).toContain('data-control="ctrl-l"');
    expect(page.text).toContain('data-control="ctrl-d"');
    expect(page.text).toContain('data-control="backspace"');
    expect(page.text).toContain('data-control="up"');
    expect(page.text).toContain('data-control="enter"');

    const bootstrapPath = `${pairingUrl.origin}/api/pair/${pairing.pairingId}/bootstrap`;
    const wrongOtp = await postJson(bootstrapPath, {
      token: pairingUrl.searchParams.get('t'),
      otp: '000000',
    });
    expect(wrongOtp.status).toBe(401);

    const bootstrap = await postJson(bootstrapPath, {
      token: pairingUrl.searchParams.get('t'),
      otp: pairing.otpCode,
    });
    expect(bootstrap.status).toBe(200);
    const bootstrapBody = bootstrap.json as {
      offer: string;
      passphrase: string;
      mode: 'readonly' | 'readwrite';
      submitToken: string;
      iceServers: Array<{ urls: string | string[] }>;
      iceTransportPolicy?: 'all' | 'relay';
    };
    expect(bootstrapBody.offer).toBe('offer-code-1');
    expect(bootstrapBody.passphrase).toBe('ABCD-EF12-GH34-JK56');
    expect(bootstrapBody.mode).toBe('readwrite');
    expect(typeof bootstrapBody.submitToken).toBe('string');
    expect(Array.isArray(bootstrapBody.iceServers)).toBe(true);

    const answerPath = `${pairingUrl.origin}/api/pair/${pairing.pairingId}/answer`;
    const answerSubmit = await postJson(answerPath, {
      token: pairingUrl.searchParams.get('t'),
      submitToken: bootstrapBody.submitToken,
      answer: 'answer-code-1',
    });
    expect(answerSubmit.status).toBe(204);

    const duplicateAnswer = await postJson(answerPath, {
      token: pairingUrl.searchParams.get('t'),
      submitToken: bootstrapBody.submitToken,
      answer: 'answer-code-2',
    });
    expect(duplicateAnswer.status).toBe(409);

    const consumed = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(consumed.status).toBe('ready');
    expect(consumed.answer).toBe('answer-code-1');

    const consumedAgain = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(consumedAgain.status).toBe('expired');
    expect(consumedAgain.answer).toBeNull();
  });

  it('returns pending when no answer has been submitted and supports explicit revoke', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-2',
      offer: 'offer-code-2',
      passphrase: 'WXYZ-AB12-CD34-EF56',
      mode: 'readonly',
    });

    const pending = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(pending.status).toBe('pending');
    expect(pending.answer).toBeNull();

    revokeMobileControlPairing(pairing.pairingId);
    const revoked = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(revoked.status).toBe('expired');
  });

  it('expires pairings based on TTL', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-3',
      offer: 'offer-code-3',
      passphrase: 'QRST-UV12-WX34-YZ56',
      mode: 'readonly',
      ttlMs: 40,
    });

    await new Promise((resolve) => setTimeout(resolve, 90));
    const result = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(result.status).toBe('expired');
    expect(result.answer).toBeNull();
  });

  it('builds remote pairing URL when public base URL is configured', async () => {
    process.env.CALDER_MOBILE_PUBLIC_BASE_URL = 'https://remote.example.com/calder';
    const pairing = await createMobileControlPairing({
      sessionId: 'session-remote',
      offer: 'offer-code-remote',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    expect(pairing.accessMode).toBe('remote');
    expect(typeof pairing.localPairingUrl).toBe('string');

    const remote = new URL(pairing.pairingUrl);
    expect(remote.origin).toBe('https://remote.example.com');
    expect(remote.pathname).toBe(`/calder/m/${pairing.pairingId}`);
    expect(remote.searchParams.get('t')).toBeNull();
    const remoteToken = new URLSearchParams(remote.hash.replace(/^#/, '')).get('t');
    expect(remoteToken).toMatch(/^[a-f0-9]{40}$/);

    const local = new URL(pairing.localPairingUrl ?? '');
    expect(local.pathname).toBe(`/m/${pairing.pairingId}`);
    expect(local.searchParams.get('t')).toBe(remoteToken);
  });

  it('falls back to local LAN pairing URL when public base URL is invalid', async () => {
    process.env.CALDER_MOBILE_PUBLIC_BASE_URL = 'ftp://remote.example.com/calder';
    const pairing = await createMobileControlPairing({
      sessionId: 'session-fallback',
      offer: 'offer-code-fallback',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    expect(pairing.accessMode).toBe('lan');
    expect(pairing.pairingUrl).toBe(pairing.localPairingUrl);
    expect(pairing.pairingUrl.startsWith('http://')).toBe(true);
  });

  it('accepts remote-mode page load without query token and bootstraps with fragment token', async () => {
    process.env.CALDER_MOBILE_PUBLIC_BASE_URL = 'https://remote.example.com';
    const pairing = await createMobileControlPairing({
      sessionId: 'session-remote-page',
      offer: 'offer-code-remote-page',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    const local = new URL(toLoopbackUrl(pairing.localPairingUrl));
    const remoteStylePage = `${local.origin}/m/${pairing.pairingId}`;
    const page = await getRequest(remoteStylePage);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Calder Mobile Control');

    const remote = new URL(pairing.pairingUrl);
    const token = new URLSearchParams(remote.hash.replace(/^#/, '')).get('t');
    expect(token).toMatch(/^[a-f0-9]{40}$/);

    const bootstrapPath = `${local.origin}/api/pair/${pairing.pairingId}/bootstrap`;
    const bootstrap = await postJson(bootstrapPath, {
      token,
      otp: pairing.otpCode,
    });
    expect(bootstrap.status).toBe(200);
  });

  it('rejects LAN page access when pairing token is missing or invalid', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-token-check',
      offer: 'offer-code-token-check',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    const local = new URL(toLoopbackUrl(pairing.localPairingUrl));
    const noTokenPage = await getRequest(`${local.origin}/m/${pairing.pairingId}`);
    expect(noTokenPage.status).toBe(403);
    expect(noTokenPage.text).toContain('Invalid pairing token');

    const badTokenPage = await getRequest(`${local.origin}/m/${pairing.pairingId}?t=bad-token`);
    expect(badTokenPage.status).toBe(403);
    expect(badTokenPage.text).toContain('Invalid pairing token');
  });

  it('rejects answer submissions when submit token is invalid', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-submit-token-check',
      offer: 'offer-code-submit-token-check',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });
    const local = new URL(toLoopbackUrl(pairing.localPairingUrl));
    const token = local.searchParams.get('t');
    expect(token).toBeTruthy();

    const bootstrapPath = `${local.origin}/api/pair/${pairing.pairingId}/bootstrap`;
    const bootstrap = await postJson(bootstrapPath, {
      token,
      otp: pairing.otpCode,
    });
    expect(bootstrap.status).toBe(200);

    const answerPath = `${local.origin}/api/pair/${pairing.pairingId}/answer`;
    const invalidSubmit = await postJson(answerPath, {
      token,
      submitToken: 'not-a-valid-submit-token',
      answer: 'answer-code',
    });
    expect(invalidSubmit.status).toBe(403);
    expect(invalidSubmit.text).toContain('Submit token is invalid');
  });

  it('rate-limits repeated bootstrap abuse attempts', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-rate-limit-check',
      offer: 'offer-code-rate-limit-check',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });
    const local = new URL(toLoopbackUrl(pairing.localPairingUrl));
    const bootstrapPath = `${local.origin}/api/pair/${pairing.pairingId}/bootstrap`;

    let status = 0;
    for (let i = 0; i < 31; i += 1) {
      const attempt = await postJson(bootstrapPath, {
        token: 'wrong-token',
        otp: pairing.otpCode,
      });
      status = attempt.status;
    }

    expect(status).toBe(429);
  });

  it('falls back to LAN mode when public base URL contains credentials', async () => {
    process.env.CALDER_MOBILE_PUBLIC_BASE_URL = 'https://user:pass@remote.example.com/calder';
    const pairing = await createMobileControlPairing({
      sessionId: 'session-credential-base-url',
      offer: 'offer-code-credential-base-url',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    expect(pairing.accessMode).toBe('lan');
    expect(pairing.pairingUrl).toBe(pairing.localPairingUrl);
    expect(pairing.pairingUrl.startsWith('http://')).toBe(true);
  });
});
