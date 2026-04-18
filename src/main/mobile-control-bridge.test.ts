import { afterEach, describe, expect, it } from 'vitest';
import { decodeConnectionCode } from '../renderer/sharing/webrtc-utils';
import {
  _internal,
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
    expect(page.text).toContain('Use the 6-digit OTP shown under the desktop QR. Do not enter the manual passphrase here.');
    expect(page.text).not.toContain('Wrong passphrase or invalid connection code.');
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
    expect(page.text).toContain('data-mobile-browser-session-select');
    expect(page.text).toContain('data-mobile-browser-control');
    expect(page.text).toContain('data-mobile-browser-viewport');
    expect(page.text).toContain('data-mobile-browser-status');
    expect(page.text).toContain('data-mobile-inspect-selection');
    expect(page.text).toContain('data-mobile-browser-inspect-input');
    expect(page.text).toContain('data-mobile-browser-inspect-send');
    expect(page.text).toContain('/challenge');
    expect(page.text).toContain('answerDescription');
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
      offerDescription?: { type: 'offer' | 'answer'; sdp: string } | null;
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
      answerDescription: { type: 'answer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' },
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
    expect(typeof consumed.answer).toBe('string');
    expect((consumed.answer ?? '').length).toBeGreaterThan(20);

    const consumedAgain = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(consumedAgain.status).toBe('expired');
    expect(consumedAgain.answer).toBeNull();
  });

  it('accepts plaintext answer descriptions for mobile browsers without WebCrypto subtle', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-answer-description',
      offer: 'offer-code-answer-description',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readwrite',
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
    const bootstrapBody = bootstrap.json as { submitToken: string };

    const answerPath = `${local.origin}/api/pair/${pairing.pairingId}/answer`;
    const submit = await postJson(answerPath, {
      token,
      submitToken: bootstrapBody.submitToken,
      answerDescription: { type: 'answer', sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1\r\n' },
    });
    expect(submit.status).toBe(204);

    const consumed = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(consumed.status).toBe('ready');
    expect(typeof consumed.answer).toBe('string');
    expect((consumed.answer ?? '').length).toBeGreaterThan(24);
    expect(consumed.answer).not.toContain('v=0');
    const decoded = await decodeConnectionCode(consumed.answer ?? '', 'answer', 'ABCD-EF12-GH34-JK56');
    expect(decoded.type).toBe('answer');
    expect(decoded.sdp).toContain('v=0');
  });

  it('returns challenge signatures for non-WebCrypto auth fallback and validates challenge payloads', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-challenge-signature',
      offer: 'offer-code-challenge-signature',
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

    const challengePath = `${local.origin}/api/pair/${pairing.pairingId}/challenge`;
    const challengeHex = 'ab'.repeat(32);
    const signature = await postJson(challengePath, {
      token,
      challenge: challengeHex,
    });
    expect(signature.status).toBe(200);
    expect((signature.json as { response: string }).response).toMatch(/^[a-f0-9]{64}$/);

    const invalidChallenge = await postJson(challengePath, {
      token,
      challenge: 'not-hex',
    });
    expect(invalidChallenge.status).toBe(400);
    expect(invalidChallenge.text).toContain('challenge');
  });

  it('keeps challenge endpoint access after answer is consumed for mobile auth fallback', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-consume-challenge-probe',
      offer: 'offer-code-consume-challenge-probe',
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
    const bootstrapBody = bootstrap.json as { submitToken: string };

    const answerPath = `${local.origin}/api/pair/${pairing.pairingId}/answer`;
    const answerSubmit = await postJson(answerPath, {
      token,
      submitToken: bootstrapBody.submitToken,
      answerDescription: { type: 'answer', sdp: 'v=0\r\no=- 43 2 IN IP4 127.0.0.1\r\n' },
    });
    expect(answerSubmit.status).toBe(204);

    const consumed = consumeMobileControlPairingAnswer(pairing.pairingId);
    expect(consumed.status).toBe('ready');

    const challengePath = `${local.origin}/api/pair/${pairing.pairingId}/challenge`;
    const challengeAfterConsume = await postJson(challengePath, {
      token,
      challenge: 'ab'.repeat(32),
    });
    expect(challengeAfterConsume.status).toBe(200);
    expect((challengeAfterConsume.json as { response: string }).response).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns provided offer description in bootstrap payload for resilient mobile handshake', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-offer-desc',
      offer: 'opaque-offer-code',
      offerDescription: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' },
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });
    const pairingUrl = new URL(toLoopbackUrl(pairing.pairingUrl));
    const bootstrapPath = `${pairingUrl.origin}/api/pair/${pairing.pairingId}/bootstrap`;

    const bootstrap = await postJson(bootstrapPath, {
      token: pairingUrl.searchParams.get('t'),
      otp: pairing.otpCode,
    });
    expect(bootstrap.status).toBe(200);
    const bootstrapBody = bootstrap.json as {
      offer: string;
      offerDescription?: { type: 'offer' | 'answer'; sdp: string } | null;
    };
    expect(bootstrapBody.offer).toBe('opaque-offer-code');
    expect(bootstrapBody.offerDescription).toEqual({ type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' });
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

  it('renders Turkish mobile page copy when pairing language is set to Turkish', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-tr',
      offer: 'offer-code-tr',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
      language: 'tr',
    });

    const pairingUrl = new URL(toLoopbackUrl(pairing.pairingUrl));
    expect(pairingUrl.searchParams.get('lang')).toBe('tr');

    const page = await getRequest(pairingUrl.toString());
    expect(page.status).toBe(200);
    expect(page.text).toContain('<html lang="tr">');
    expect(page.text).toContain('Calder Mobil Kontrol');
    expect(page.text).toContain('Doğrula ve Bağlan');
    expect(page.text).toContain('Masaüstünde QR altında görünen 6 haneli OTP\'yi girin. Buraya manuel parola girmeyin.');
    expect(page.text).not.toContain('Parola hatalı veya bağlantı kodu geçersiz.');
    expect(page.text).toContain('Kontroller');
  });

  it('localizes missing pairing page and unknown route by request language', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-lang-fallbacks',
      offer: 'offer-code-lang-fallbacks',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });
    const local = new URL(toLoopbackUrl(pairing.localPairingUrl));

    const missingPairingPageTr = await getRequest(`${local.origin}/m/aaaaaaaaaaaaaaaaaaaaaaaa?lang=tr`);
    expect(missingPairingPageTr.status).toBe(404);
    expect(missingPairingPageTr.text).toContain('Eşleştirme bulunamadı.');

    const missingPairingPageEn = await getRequest(`${local.origin}/m/aaaaaaaaaaaaaaaaaaaaaaaa`);
    expect(missingPairingPageEn.status).toBe(404);
    expect(missingPairingPageEn.text).toContain('Pairing not found.');

    const unknownRouteTr = await getRequest(`${local.origin}/unknown?lang=tr`);
    expect(unknownRouteTr.status).toBe(404);
    expect(unknownRouteTr.text).toContain('Rota bulunamadı.');

    const unknownRouteEn = await getRequest(`${local.origin}/unknown`);
    expect(unknownRouteEn.status).toBe(404);
    expect(unknownRouteEn.text).toContain('Route not found.');
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
    expect(remote.searchParams.get('t')).toMatch(/^[a-f0-9]{40}$/);
    const remoteToken = new URLSearchParams(remote.hash.replace(/^#/, '')).get('t');
    expect(remoteToken).toMatch(/^[a-f0-9]{40}$/);
    expect(remote.searchParams.get('t')).toBe(remoteToken);

    const local = new URL(pairing.localPairingUrl ?? '');
    expect(local.pathname).toBe(`/m/${pairing.pairingId}`);
    expect(local.searchParams.get('t')).toBe(remoteToken);
  });

  it('returns LAN fallback pairing urls including the primary local url', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-lan-fallbacks',
      offer: 'offer-code-lan-fallbacks',
      passphrase: 'ABCD-EF12-GH34-JK56',
      mode: 'readonly',
    });

    expect(Array.isArray(pairing.localPairingUrls)).toBe(true);
    expect((pairing.localPairingUrls ?? []).length).toBeGreaterThan(0);
    expect(pairing.localPairingUrls).toContain(pairing.localPairingUrl);
  });

  it('filters unusable tunnel and network-address LAN candidates from pairing links', async () => {
    const hosts = _internal.listLanHosts({
      lo0: [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          internal: true,
          mac: '00:00:00:00:00:00',
          cidr: '127.0.0.1/8',
        },
      ],
      en0: [
        {
          address: '10.20.45.84',
          netmask: '255.255.0.0',
          family: 'IPv4',
          internal: false,
          mac: '00:00:00:00:00:00',
          cidr: '10.20.45.84/16',
        },
      ],
      utun5: [
        {
          address: '172.16.0.2',
          netmask: '255.255.255.255',
          family: 'IPv4',
          internal: false,
          mac: '00:00:00:00:00:00',
          cidr: '172.16.0.2/32',
        },
      ],
      bridge101: [
        {
          address: '192.168.97.0',
          netmask: '255.255.255.0',
          family: 'IPv4',
          internal: false,
          mac: '00:00:00:00:00:00',
          cidr: '192.168.97.0/24',
        },
      ],
    } as NodeJS.Dict<any[]>);

    expect(hosts).toContain('10.20.45.84');
    expect(hosts).not.toContain('172.16.0.2');
    expect(hosts).not.toContain('192.168.97.0');
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

  it('rejects malformed encrypted answer payloads before desktop consume path', async () => {
    const pairing = await createMobileControlPairing({
      sessionId: 'session-invalid-answer-payload',
      offer: 'offer-code-invalid-answer-payload',
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
    const bootstrapBody = bootstrap.json as { submitToken: string };

    const answerPath = `${local.origin}/api/pair/${pairing.pairingId}/answer`;
    const invalidAnswer = await postJson(answerPath, {
      token,
      submitToken: bootstrapBody.submitToken,
      answer: 'totally-not-an-encrypted-answer',
    });
    expect(invalidAnswer.status).toBe(400);
    expect(invalidAnswer.text).toContain('invalid');
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
