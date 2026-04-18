import * as http from 'node:http';
import * as os from 'node:os';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { ShareMode, ShareRtcConfig } from '../shared/sharing-types';
import { resolveShareRtcConfigFromEnv } from './share-rtc-config';

type PairingStatus = 'pending' | 'ready' | 'expired';

interface PairingRecord {
  id: string;
  sessionId: string;
  offer: string;
  passphrase: string;
  mode: ShareMode;
  accessMode: 'lan' | 'remote';
  token: string;
  otpCode: string;
  attempts: number;
  otpVerified: boolean;
  submitToken: string | null;
  answer: string | null;
  rtcConfig: Pick<ShareRtcConfig, 'iceServers' | 'iceTransportPolicy'>;
  createdAtMs: number;
  expiresAtMs: number;
}

interface MobileBridgeState {
  server: http.Server;
  port: number;
  host: string;
  cleanupTimer: NodeJS.Timeout;
}

export interface MobileControlPairingOptions {
  sessionId: string;
  offer: string;
  passphrase: string;
  mode: ShareMode;
  ttlMs?: number;
}

export interface MobileControlPairingResult {
  pairingId: string;
  pairingUrl: string;
  localPairingUrl: string;
  accessMode: 'lan' | 'remote';
  otpCode: string;
  expiresAt: string;
}

export interface MobileControlAnswerResult {
  answer: string | null;
  status: PairingStatus;
}

const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_BODY_BYTES = 32 * 1024;
const CLEANUP_INTERVAL_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_BLOCK_MS = 20_000;

let bridgeState: MobileBridgeState | null = null;
const pairings = new Map<string, PairingRecord>();
const requestRateLimits = new Map<string, { windowStartMs: number; count: number; blockedUntilMs: number }>();

function clearRateLimitEntriesForPairing(pairingId: string): void {
  const token = `:${pairingId}:`;
  for (const key of requestRateLimits.keys()) {
    if (key.includes(token)) {
      requestRateLimits.delete(key);
    }
  }
}

function isExpired(record: PairingRecord): boolean {
  return Date.now() > record.expiresAtMs;
}

function cleanupExpiredPairings(): void {
  for (const [pairingId, record] of pairings) {
    if (isExpired(record)) {
      pairings.delete(pairingId);
      clearRateLimitEntriesForPairing(pairingId);
    }
  }

  const now = Date.now();
  for (const [key, value] of requestRateLimits) {
    if (value.blockedUntilMs < now && now - value.windowStartMs > RATE_LIMIT_WINDOW_MS * 2) {
      requestRateLimits.delete(key);
    }
  }
}

function isPrivateIpv4(address: string): boolean {
  return (
    /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function pickLanHost(): string {
  const nets = os.networkInterfaces();
  const preferred: string[] = [];
  const fallback: string[] = [];

  for (const values of Object.values(nets)) {
    if (!values) continue;
    for (const entry of values) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (isPrivateIpv4(entry.address)) {
        preferred.push(entry.address);
      } else {
        fallback.push(entry.address);
      }
    }
  }

  if (preferred.length > 0) return preferred[0];
  if (fallback.length > 0) return fallback[0];
  return '127.0.0.1';
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendText(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(message);
}

function readBody(req: http.IncomingMessage, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('request_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getPairingFromPath(pathname: string, suffix: '/bootstrap' | '/answer'): PairingRecord | null {
  const match = pathname.match(new RegExp(`^/api/pair/([a-f0-9]{24})${suffix}$`));
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

function getPagePairing(pathname: string): PairingRecord | null {
  const match = pathname.match(/^\/m\/([a-f0-9]{24})$/);
  if (!match) return null;
  return pairings.get(match[1]) ?? null;
}

function verifyPairingToken(record: PairingRecord, token: unknown): boolean {
  return safeCompareToken(record.token, token);
}

function safeCompareToken(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function getRequestClientAddress(req: http.IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimited(
  req: http.IncomingMessage,
  pairingId: string,
  scope: 'bootstrap' | 'answer',
): boolean {
  const now = Date.now();
  const key = `${scope}:${pairingId}:${getRequestClientAddress(req)}`;
  const existing = requestRateLimits.get(key);
  if (!existing) {
    requestRateLimits.set(key, { windowStartMs: now, count: 1, blockedUntilMs: 0 });
    return false;
  }

  if (existing.blockedUntilMs > now) {
    return true;
  }

  if (now - existing.windowStartMs > RATE_LIMIT_WINDOW_MS) {
    existing.windowStartMs = now;
    existing.count = 1;
    return false;
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    existing.blockedUntilMs = now + RATE_LIMIT_BLOCK_MS;
    return true;
  }
  return false;
}

function createOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveMobilePublicBaseUrl(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.CALDER_MOBILE_PUBLIC_BASE_URL;
  if (!isNonEmptyString(raw)) return null;

  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because protocol is not http/https.');
      return null;
    }
    if (parsed.username || parsed.password) {
      console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because credentials are not allowed.');
      return null;
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed;
  } catch {
    console.warn('Ignoring CALDER_MOBILE_PUBLIC_BASE_URL because value is not a valid URL.');
    return null;
  }
}

function buildPairingUrl(
  baseUrl: URL,
  pairingId: string,
  token: string,
  tokenTransport: 'query' | 'fragment' = 'query',
): string {
  const normalizedBaseUrl = new URL(baseUrl.toString());
  if (!normalizedBaseUrl.pathname.endsWith('/')) {
    normalizedBaseUrl.pathname = `${normalizedBaseUrl.pathname}/`;
  }
  const pairingPageUrl = new URL(`m/${pairingId}`, normalizedBaseUrl);
  if (tokenTransport === 'query') {
    pairingPageUrl.searchParams.set('t', token);
  } else {
    const hashParams = new URLSearchParams();
    hashParams.set('t', token);
    pairingPageUrl.hash = hashParams.toString();
  }
  return pairingPageUrl.toString();
}

function renderMobilePage(pairingId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>Calder Mobile Control</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #060a14;
      --bg-alt: #0a1326;
      --panel: rgba(11, 20, 38, 0.78);
      --panel-strong: rgba(14, 25, 46, 0.9);
      --border: rgba(120, 163, 255, 0.28);
      --border-strong: rgba(146, 182, 255, 0.48);
      --text: #e9f1ff;
      --muted: #9fb0d6;
      --accent: #4d8dff;
      --accent-strong: #2f73ff;
      --accent-soft: rgba(77, 141, 255, 0.2);
      --danger: #ff7d88;
      --ok: #54cf9c;
      --shadow: 0 24px 48px rgba(1, 5, 14, 0.5);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at 14% 18%, rgba(42, 109, 255, 0.44) 0%, rgba(42, 109, 255, 0) 42%),
        radial-gradient(circle at 86% 4%, rgba(74, 203, 255, 0.24) 0%, rgba(74, 203, 255, 0) 34%),
        linear-gradient(165deg, var(--bg-alt) 0%, var(--bg) 52%, #050913 100%);
      color: var(--text);
      min-height: 100vh;
      padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      position: relative;
      overflow-x: hidden;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      width: 52vmax;
      height: 52vmax;
      border-radius: 999px;
      filter: blur(34px);
      opacity: 0.2;
      pointer-events: none;
      z-index: 0;
      animation: aurora-drift 22s ease-in-out infinite alternate;
    }
    body::before {
      top: -22vmax;
      right: -18vmax;
      background: radial-gradient(circle at 32% 40%, rgba(86, 165, 255, 0.95) 0%, rgba(86, 165, 255, 0) 65%);
    }
    body::after {
      bottom: -24vmax;
      left: -16vmax;
      background: radial-gradient(circle at 56% 52%, rgba(70, 236, 187, 0.68) 0%, rgba(70, 236, 187, 0) 70%);
      animation-delay: 1.2s;
    }
    @keyframes aurora-drift {
      0% { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(3vmax, -2vmax, 0) scale(1.06); }
    }
    .shell {
      position: relative;
      z-index: 1;
      max-width: 760px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .panel {
      background:
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 35%, rgba(255,255,255,0) 100%),
        var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 15px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .hero-panel {
      background:
        radial-gradient(circle at 8% 10%, rgba(91, 157, 255, 0.22) 0%, rgba(91, 157, 255, 0) 44%),
        linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015) 40%, rgba(255,255,255,0) 100%),
        var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 21px;
      line-height: 1.15;
      letter-spacing: -0.015em;
      font-weight: 700;
    }
    p { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .hero-kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #bfd0ff;
    }
    .hero-kicker::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(180deg, #78adff, #4b8aff);
      box-shadow: 0 0 0 4px rgba(92, 142, 255, 0.15);
    }
    .otp-row {
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .otp-meta {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      opacity: 0.9;
    }
    .otp {
      width: 100%;
      min-width: 0;
      padding: 11px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      letter-spacing: 0.24em;
      font-size: 20px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .btn {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 10px 14px;
      background: linear-gradient(180deg, #5a99ff, var(--accent-strong));
      color: #f7fbff;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease, background 160ms ease;
      box-shadow: 0 10px 20px rgba(40, 91, 203, 0.34);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active { transform: translateY(1px); }
    .btn[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
    }
    .btn.secondary {
      background: linear-gradient(180deg, rgba(22, 34, 60, 0.94), rgba(12, 24, 44, 0.88));
      border-color: var(--border);
      color: var(--text);
      box-shadow: none;
    }
    .btn.ghost {
      background: rgba(10, 20, 36, 0.72);
      border-color: rgba(131, 168, 246, 0.34);
      box-shadow: none;
      color: #d9e6ff;
    }
    .btn.slim {
      padding: 8px 10px;
      font-size: 12px;
      border-radius: 10px;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      color: var(--muted);
      min-height: 18px;
      border-left: 2px solid transparent;
      padding-left: 8px;
    }
    .status.error { color: var(--danger); }
    .status.ok { color: var(--ok); }
    .status.error { border-left-color: rgba(255, 125, 136, 0.6); }
    .status.ok { border-left-color: rgba(84, 207, 156, 0.64); }
    .status-grid {
      display: grid;
      gap: 8px;
    }
    .session-switch-row {
      margin-top: 12px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
    }
    .session-select {
      width: 100%;
      min-width: 0;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: #060d1c;
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    .session-switch-note {
      margin-top: 7px;
      font-size: 11px;
      color: var(--muted);
      min-height: 16px;
    }
    .mobile-view-tabs {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .mobile-view-tab {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 9px 10px;
      background: linear-gradient(180deg, rgba(10, 18, 35, 0.94), rgba(8, 17, 33, 0.9));
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
    }
    .mobile-view-tab.active {
      color: var(--text);
      background: linear-gradient(180deg, rgba(18, 33, 59, 0.95), rgba(13, 26, 49, 0.92));
      border-color: var(--border-strong);
    }
    .mobile-view-tab:disabled {
      opacity: 0.45;
    }
    .mobile-view-pane {
      display: none;
      margin-top: 12px;
    }
    .mobile-view-pane.active {
      display: block;
    }
    .terminal-toolbar {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .terminal-toolbar .btn.slim.active {
      border-color: var(--border-strong);
      color: #ffffff;
      background: linear-gradient(180deg, rgba(22, 46, 85, 0.95), rgba(15, 32, 59, 0.9));
    }
    .terminal {
      width: 100%;
      min-height: 320px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background:
        linear-gradient(180deg, rgba(7, 12, 24, 0.9), rgba(4, 8, 16, 0.93)),
        repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 26px);
      padding: 12px 12px 14px;
      margin-top: 0;
      font-family: "SFMono-Regular", "Menlo", "Monaco", "Cascadia Mono", "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      overflow-y: auto;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .composer {
      display: none;
      margin-top: 10px;
      gap: 8px;
      align-items: center;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      grid-template-areas: "prev input next send";
    }
    .composer.visible { display: grid; }
    .composer input {
      grid-area: input;
      min-width: 0;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(7, 15, 30, 0.95), rgba(6, 13, 28, 0.9));
      color: var(--text);
      padding: 10px 12px;
      font-size: 13px;
    }
    .composer .btn[data-mobile-history-prev] { grid-area: prev; }
    .composer .btn[data-mobile-history-next] { grid-area: next; }
    .composer #send { grid-area: send; }
    .command-chip-list {
      display: none;
      margin-top: 8px;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .command-chip-list.visible {
      display: grid;
    }
    .command-chip {
      text-align: left;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .quick-controls {
      display: none;
      margin-top: 10px;
      gap: 10px;
    }
    .quick-controls.visible {
      display: grid;
    }
    .quick-controls-title {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .quick-controls-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }
    .quick-controls-grid .btn {
      width: 100%;
      min-height: 38px;
      padding: 9px 8px;
      font-size: 12px;
    }
    .quick-controls-grid .btn[data-control="up"],
    .quick-controls-grid .btn[data-control="left"],
    .quick-controls-grid .btn[data-control="down"],
    .quick-controls-grid .btn[data-control="right"] {
      font-size: 14px;
      font-weight: 700;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 999px;
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      background: rgba(9, 18, 34, 0.78);
    }
    @media (max-width: 520px) {
      .panel {
        padding: 13px;
        border-radius: 16px;
      }
      .otp-row {
        grid-template-columns: 1fr;
      }
      .session-switch-row {
        grid-template-columns: 1fr;
      }
      .mobile-view-tabs {
        grid-template-columns: 1fr 1fr;
      }
      .command-chip-list {
        grid-template-columns: 1fr;
      }
      .composer.visible {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          "prev input next"
          "send send send";
      }
      .composer #send {
        width: 100%;
      }
      .terminal {
        min-height: 268px;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel hero-panel">
      <div class="hero-kicker">Secure Mobile Bridge</div>
      <h1>Calder Mobile Control</h1>
      <p>Enter the one-time code from desktop to unlock your live terminal stream and controls.</p>
      <div class="otp-row">
        <input id="otp" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
        <button id="connect" class="btn">Verify & Connect</button>
      </div>
      <div class="otp-meta">Pairing expires automatically and can be used only once.</div>
      <div id="status" class="status">Waiting for OTP…</div>
    </section>

    <section class="panel">
      <div class="status-grid">
        <div class="row">
          <span id="modeBadge" class="badge">Mode: pending</span>
          <span id="connBadge" class="badge">State: idle</span>
        </div>
        <div class="session-switch-row">
          <select id="sessionSelect" class="session-select" data-mobile-session-select aria-label="Session selector" disabled>
            <option value="">Waiting for sessions…</option>
          </select>
          <button id="sessionSwitchButton" type="button" class="btn secondary" data-mobile-session-switch disabled>Switch</button>
        </div>
        <div id="sessionSwitchNote" class="session-switch-note">Session routing is unavailable until secure connection is ready.</div>
      </div>
      <div class="mobile-view-tabs" role="tablist" aria-label="Mobile views">
        <button type="button" class="mobile-view-tab active" data-mobile-view-tab="terminal" aria-selected="true">Terminal</button>
        <button type="button" class="mobile-view-tab" data-mobile-view-tab="controls" aria-selected="false" disabled>Controls</button>
      </div>
      <div id="terminalView" class="mobile-view-pane active" data-mobile-view="terminal">
        <div class="terminal-toolbar">
          <button id="terminalClearButton" type="button" class="btn ghost slim" data-mobile-terminal-clear>Clear</button>
          <button id="terminalCopyButton" type="button" class="btn ghost slim" data-mobile-terminal-copy>Copy</button>
          <button id="terminalFollowButton" type="button" class="btn ghost slim active" data-mobile-terminal-follow>Follow On</button>
        </div>
        <pre id="terminal" class="terminal" aria-live="polite"></pre>
      </div>
      <div id="controlsView" class="mobile-view-pane" data-mobile-view="controls">
        <form id="composer" class="composer" autocomplete="off">
          <button id="historyPrevButton" class="btn secondary slim" type="button" data-mobile-history-prev>Prev</button>
          <input id="commandInput" placeholder="Type a command and press Enter" />
          <button id="historyNextButton" class="btn secondary slim" type="button" data-mobile-history-next>Next</button>
          <button id="send" class="btn secondary" type="submit">Send</button>
        </form>
        <div id="commandChipList" class="command-chip-list" aria-label="Suggested commands">
          <button type="button" class="btn ghost slim command-chip" data-command-chip="pwd" data-mobile-command-chip>pwd</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="ls -la" data-mobile-command-chip>ls -la</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="git status" data-mobile-command-chip>git status</button>
          <button type="button" class="btn ghost slim command-chip" data-command-chip="npm test" data-mobile-command-chip>npm test</button>
        </div>
        <div id="quickControls" class="quick-controls" aria-label="Quick controls">
          <div class="quick-controls-title">Quick controls</div>
          <div class="quick-controls-grid">
            <button type="button" class="btn secondary" data-control="ctrl-c">Ctrl+C</button>
            <button type="button" class="btn secondary" data-control="ctrl-l">Ctrl+L</button>
            <button type="button" class="btn secondary" data-control="ctrl-d">Ctrl+D</button>
            <button type="button" class="btn secondary" data-control="tab">Tab</button>
            <button type="button" class="btn secondary" data-control="esc">Esc</button>
            <button type="button" class="btn secondary" data-control="backspace" data-repeatable="true">⌫</button>
            <button type="button" class="btn secondary" data-control="enter">Enter</button>
            <button type="button" class="btn secondary" data-control="up" data-repeatable="true">↑</button>
            <button type="button" class="btn secondary" data-control="left" data-repeatable="true">←</button>
            <button type="button" class="btn secondary" data-control="down" data-repeatable="true">↓</button>
            <button type="button" class="btn secondary" data-control="right" data-repeatable="true">→</button>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      const pairingId = ${JSON.stringify(pairingId)};
      const PBKDF2_ITERATIONS = 100000;
      const SALT_LENGTH = 16;
      const IV_LENGTH = 12;
      const CHALLENGE_SALT = new TextEncoder().encode('calder-challenge-v1');

      const otpInput = document.getElementById('otp');
      const connectButton = document.getElementById('connect');
      const statusEl = document.getElementById('status');
      const terminalEl = document.getElementById('terminal');
      const modeBadge = document.getElementById('modeBadge');
      const connBadge = document.getElementById('connBadge');
      const terminalView = document.getElementById('terminalView');
      const controlsView = document.getElementById('controlsView');
      const composer = document.getElementById('composer');
      const commandInput = document.getElementById('commandInput');
      const sendButton = document.getElementById('send');
      const historyPrevButton = document.getElementById('historyPrevButton');
      const historyNextButton = document.getElementById('historyNextButton');
      const commandChipList = document.getElementById('commandChipList');
      const quickControls = document.getElementById('quickControls');
      const terminalClearButton = document.getElementById('terminalClearButton');
      const terminalCopyButton = document.getElementById('terminalCopyButton');
      const terminalFollowButton = document.getElementById('terminalFollowButton');
      const sessionSelect = document.getElementById('sessionSelect');
      const sessionSwitchButton = document.getElementById('sessionSwitchButton');
      const sessionSwitchNote = document.getElementById('sessionSwitchNote');
      const viewTabs = Array.from(document.querySelectorAll('[data-mobile-view-tab]'));
      const terminalViewTab = document.querySelector('[data-mobile-view-tab="terminal"]');
      const controlsViewTab = document.querySelector('[data-mobile-view-tab="controls"]');

      let dataChannel = null;
      let currentMode = 'readonly';
      let authenticated = false;
      let passphrase = '';
      let quickControlRepeatTimer = null;
      let quickControlRepeatInterval = null;
      let quickControlRepeatControl = null;
      let suppressQuickControlClickUntilMs = 0;
      let activeView = 'terminal';
      let availableSessions = [];
      let activeSessionId = '';
      let switchInFlight = false;
      let followTerminal = true;
      let commandHistory = [];
      let commandHistoryIndex = -1;
      const MAX_COMMAND_HISTORY = 40;

      function setStatus(message, kind) {
        statusEl.textContent = message;
        statusEl.classList.remove('error', 'ok');
        if (kind === 'error') statusEl.classList.add('error');
        if (kind === 'ok') statusEl.classList.add('ok');
      }

      function setConnState(label) {
        connBadge.textContent = 'State: ' + label;
      }

      function updateFollowButton() {
        terminalFollowButton.textContent = followTerminal ? 'Follow On' : 'Follow Off';
        terminalFollowButton.classList.toggle('active', followTerminal);
      }

      function setFollowTerminal(enabled) {
        followTerminal = Boolean(enabled);
        updateFollowButton();
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function setActiveView(view) {
        activeView = view === 'controls' ? 'controls' : 'terminal';
        if (activeView === 'terminal') {
          stopQuickControlRepeat();
        }
        terminalView.classList.toggle('active', activeView === 'terminal');
        controlsView.classList.toggle('active', activeView === 'controls');
        terminalViewTab.classList.toggle('active', activeView === 'terminal');
        controlsViewTab.classList.toggle('active', activeView === 'controls');
        terminalViewTab.setAttribute('aria-selected', activeView === 'terminal' ? 'true' : 'false');
        controlsViewTab.setAttribute('aria-selected', activeView === 'controls' ? 'true' : 'false');
      }

      function setControlsViewEnabled(enabled) {
        controlsViewTab.disabled = !enabled;
        controlsViewTab.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        if (!enabled && activeView === 'controls') {
          setActiveView('terminal');
        }
      }

      function canSendInteractiveInput() {
        return Boolean(
          authenticated
          && dataChannel
          && dataChannel.readyState === 'open'
          && currentMode === 'readwrite'
        );
      }

      function updateHistoryNavigationState() {
        const interactive = canSendInteractiveInput();
        if (!interactive || commandHistory.length === 0) {
          historyPrevButton.disabled = true;
          historyNextButton.disabled = true;
          return;
        }

        if (commandHistoryIndex < 0) {
          historyPrevButton.disabled = false;
          historyNextButton.disabled = true;
          return;
        }

        historyPrevButton.disabled = commandHistoryIndex >= commandHistory.length - 1;
        historyNextButton.disabled = commandHistoryIndex <= 0;
      }

      function setCommandChipInteractivity(enabled) {
        const chips = commandChipList.querySelectorAll('[data-command-chip]');
        for (const chip of chips) {
          chip.disabled = !enabled;
        }
      }

      function setInteractiveControlsVisible() {
        const visible = canSendInteractiveInput();
        if (visible) {
          composer.classList.add('visible');
          commandChipList.classList.add('visible');
          quickControls.classList.add('visible');
        } else {
          composer.classList.remove('visible');
          commandChipList.classList.remove('visible');
          quickControls.classList.remove('visible');
        }
        sendButton.disabled = !visible;
        setCommandChipInteractivity(visible);
        updateHistoryNavigationState();
        setControlsViewEnabled(visible);
      }

      function sendInputPayload(payload) {
        if (!canSendInteractiveInput()) return false;
        sendMessage({ type: 'input', payload });
        return true;
      }

      function rememberCommand(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return;
        const existingIndex = commandHistory.indexOf(trimmed);
        if (existingIndex >= 0) {
          commandHistory.splice(existingIndex, 1);
        }
        commandHistory.unshift(trimmed);
        if (commandHistory.length > MAX_COMMAND_HISTORY) {
          commandHistory = commandHistory.slice(0, MAX_COMMAND_HISTORY);
        }
        commandHistoryIndex = -1;
        updateHistoryNavigationState();
      }

      function sendCommandValue(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) return false;
        if (!sendInputPayload(value + '\\n')) return false;
        rememberCommand(value);
        return true;
      }

      function recallCommand(direction) {
        if (commandHistory.length === 0) return;

        if (commandHistoryIndex < 0) {
          if (direction <= 0) return;
          commandHistoryIndex = 0;
        } else {
          commandHistoryIndex += direction;
          if (commandHistoryIndex < 0) {
            commandHistoryIndex = -1;
            commandInput.value = '';
            updateHistoryNavigationState();
            return;
          }
          if (commandHistoryIndex >= commandHistory.length) {
            commandHistoryIndex = commandHistory.length - 1;
          }
        }

        if (commandHistoryIndex >= 0 && commandHistoryIndex < commandHistory.length) {
          commandInput.value = commandHistory[commandHistoryIndex];
          commandInput.focus();
        }
        updateHistoryNavigationState();
      }

      function quickControlToPayload(control) {
        switch (control) {
          case 'ctrl-c': return '\\u0003';
          case 'ctrl-l': return '\\u000c';
          case 'ctrl-d': return '\\u0004';
          case 'tab': return '\\t';
          case 'esc': return '\\u001b';
          case 'backspace': return '\\u007f';
          case 'enter': return '\\n';
          case 'up': return '\\u001b[A';
          case 'down': return '\\u001b[B';
          case 'right': return '\\u001b[C';
          case 'left': return '\\u001b[D';
          default: return null;
        }
      }

      function triggerQuickControl(control) {
        const payload = quickControlToPayload(control);
        if (!payload) return;
        const sent = sendInputPayload(payload);
        if (sent && control === 'enter') {
          commandInput.focus();
        }
        if (sent) {
          pulseTap(8);
        }
      }

      function isRepeatableControl(control) {
        return control === 'up'
          || control === 'down'
          || control === 'left'
          || control === 'right'
          || control === 'backspace';
      }

      function stopQuickControlRepeat() {
        if (quickControlRepeatTimer) {
          clearTimeout(quickControlRepeatTimer);
          quickControlRepeatTimer = null;
        }
        if (quickControlRepeatInterval) {
          clearInterval(quickControlRepeatInterval);
          quickControlRepeatInterval = null;
        }
        quickControlRepeatControl = null;
      }

      function startQuickControlRepeat(control) {
        stopQuickControlRepeat();
        if (!isRepeatableControl(control)) return;
        quickControlRepeatControl = control;
        quickControlRepeatTimer = setTimeout(function () {
          quickControlRepeatInterval = setInterval(function () {
            if (!quickControlRepeatControl) return;
            triggerQuickControl(quickControlRepeatControl);
          }, 90);
        }, 280);
      }

      function pulseTap(strength) {
        if (typeof navigator.vibrate !== 'function') return;
        navigator.vibrate(strength);
      }

      function appendTerminal(chunk) {
        if (typeof chunk !== 'string' || chunk.length === 0) return;
        terminalEl.textContent += chunk;
        if (terminalEl.textContent.length > 150000) {
          terminalEl.textContent = terminalEl.textContent.slice(-90000);
        }
        if (followTerminal) {
          terminalEl.scrollTop = terminalEl.scrollHeight;
        }
      }

      function replaceTerminal(content) {
        terminalEl.textContent = '';
        if (typeof content === 'string' && content.length > 0) {
          appendTerminal(content);
        }
      }

      function clearTerminalView() {
        replaceTerminal('');
        setStatus('Mobile terminal view cleared.', 'ok');
      }

      async function copyTerminalView() {
        const text = terminalEl.textContent || '';
        if (!text.trim()) {
          setStatus('Nothing to copy yet.', 'error');
          return;
        }
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          setStatus('Clipboard API is unavailable on this browser.', 'error');
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          setStatus('Terminal output copied to clipboard.', 'ok');
        } catch {
          setStatus('Could not copy terminal output.', 'error');
        }
      }

      function canSwitchSessions() {
        return Boolean(authenticated && dataChannel && dataChannel.readyState === 'open');
      }

      function updateSessionSwitchUi() {
        const canUse = canSwitchSessions();
        const hasSessions = availableSessions.length > 0;
        const selectedId = String(sessionSelect.value || '');
        sessionSelect.disabled = !canUse || !hasSessions || switchInFlight;
        sessionSwitchButton.disabled = !canUse
          || !hasSessions
          || switchInFlight
          || !selectedId
          || selectedId === activeSessionId;
      }

      function describeSessionSwitchState() {
        if (switchInFlight) {
          sessionSwitchNote.textContent = 'Switching active session…';
          return;
        }
        if (!authenticated) {
          sessionSwitchNote.textContent = 'Session routing is unavailable until secure connection is ready.';
          return;
        }
        if (availableSessions.length === 0) {
          sessionSwitchNote.textContent = 'No shareable terminal sessions are currently available.';
          return;
        }
        const active = availableSessions.find((session) => session.id === activeSessionId);
        if (active) {
          sessionSwitchNote.textContent = 'Active session: ' + active.name;
        } else {
          sessionSwitchNote.textContent = 'Choose a session and tap Switch.';
        }
      }

      function syncSessionSelectOptions() {
        const priorSelection = String(sessionSelect.value || '');
        sessionSelect.innerHTML = '';
        if (availableSessions.length === 0) {
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = 'No sessions available';
          sessionSelect.appendChild(emptyOption);
          sessionSelect.value = '';
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        for (const session of availableSessions) {
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = session.name;
          sessionSelect.appendChild(option);
        }

        const hasPriorSelection = availableSessions.some((session) => session.id === priorSelection);
        if (hasPriorSelection) {
          sessionSelect.value = priorSelection;
        } else if (availableSessions.some((session) => session.id === activeSessionId)) {
          sessionSelect.value = activeSessionId;
        } else {
          sessionSelect.value = availableSessions[0].id;
        }

        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      function applySessionCatalog(msg) {
        if (!msg || !Array.isArray(msg.sessions)) return;
        availableSessions = msg.sessions
          .filter((session) => session && typeof session.id === 'string' && typeof session.name === 'string')
          .map((session) => ({ id: session.id, name: session.name }));
        if (typeof msg.activeSessionId === 'string') {
          activeSessionId = msg.activeSessionId;
        }
        syncSessionSelectOptions();
      }

      function applySessionSwitchResult(msg) {
        switchInFlight = false;
        if (!msg || !msg.ok) {
          setStatus('Could not switch session: ' + ((msg && msg.reason) || 'Unknown reason.'), 'error');
          updateSessionSwitchUi();
          describeSessionSwitchState();
          return;
        }

        if (typeof msg.sessionId === 'string' && msg.sessionId.length > 0) {
          activeSessionId = msg.sessionId;
        }
        if (typeof msg.scrollback === 'string') {
          replaceTerminal(msg.scrollback);
        }
        if (activeSessionId) {
          sessionSelect.value = activeSessionId;
        }

        const switchedName = typeof msg.sessionName === 'string' && msg.sessionName.length > 0
          ? msg.sessionName
          : activeSessionId;
        setStatus('Switched to ' + switchedName + '.', 'ok');
        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      function normalizePassphrase(value) {
        return value.trim().replace(/[\\s-]+/g, '').toUpperCase();
      }

      function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return bytes;
      }

      function bytesToHex(bytes) {
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }

      async function deriveAesKey(phrase, salt, usage) {
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          usage
        );
      }

      async function encryptPayload(plaintext, phrase) {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const key = await deriveAesKey(phrase, salt, ['encrypt']);
        const ciphertext = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(plaintext)
        );
        const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, SALT_LENGTH);
        combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);
        let binary = '';
        for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
        return btoa(binary);
      }

      async function decryptPayload(encoded, phrase) {
        let bytes;
        try {
          bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        } catch {
          throw new Error('Could not decode connection code.');
        }
        if (bytes.length < SALT_LENGTH + IV_LENGTH + 1) {
          throw new Error('Connection code is too short.');
        }
        const salt = bytes.slice(0, SALT_LENGTH);
        const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);
        try {
          const key = await deriveAesKey(phrase, salt, ['decrypt']);
          const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
          return new TextDecoder().decode(plain);
        } catch {
          throw new Error('Wrong passphrase or invalid connection code.');
        }
      }

      async function encodeConnectionCode(desc, phrase) {
        return encryptPayload(JSON.stringify(desc), phrase);
      }

      async function decodeConnectionCode(code, expectedType, phrase) {
        const decoded = await decryptPayload(code, phrase);
        let parsed;
        try {
          parsed = JSON.parse(decoded);
        } catch {
          throw new Error('Connection code payload is malformed.');
        }
        const envelope = parsed && typeof parsed === 'object' && parsed.v === 2 && parsed.description
          ? parsed.description
          : parsed;
        if (!envelope || typeof envelope !== 'object' || typeof envelope.type !== 'string' || typeof envelope.sdp !== 'string') {
          throw new Error('Connection code is missing fields.');
        }
        if (expectedType && envelope.type !== expectedType) {
          throw new Error('Connection code type mismatch.');
        }
        return envelope;
      }

      async function computeChallengeResponse(challengeHex, phrase) {
        const challenge = hexToBytes(challengeHex);
        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(normalizePassphrase(phrase)),
          'PBKDF2',
          false,
          ['deriveKey']
        );
        const hmacKey = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: CHALLENGE_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
          keyMaterial,
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', hmacKey, challenge);
        return bytesToHex(new Uint8Array(signature));
      }

      function resolvePairingTokenFromUrl() {
        const url = new URL(window.location.href);
        const queryToken = url.searchParams.get('t');
        if (queryToken) return queryToken;
        const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
        if (!hash) return '';
        const hashParams = new URLSearchParams(hash);
        return hashParams.get('t') || '';
      }

      function waitForIceGathering(pc) {
        return new Promise((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const listener = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', listener);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', listener);
          setTimeout(() => {
            pc.removeEventListener('icegatheringstatechange', listener);
            resolve();
          }, 10000);
        });
      }

      async function postJson(url, payload) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || ('Request failed (' + response.status + ')'));
        }
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return response.json();
        }
        return null;
      }

      async function bootstrapPairing(otpCode, token) {
        return postJson('/api/pair/' + pairingId + '/bootstrap', { token, otp: otpCode });
      }

      async function submitAnswer(answer, token, submitToken) {
        await postJson('/api/pair/' + pairingId + '/answer', { token, submitToken, answer });
      }

      function sendMessage(payload) {
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify(payload));
        }
      }

      function onAuthenticated() {
        setStatus('Connected. Live stream active.', 'ok');
        setConnState('connected');
        setInteractiveControlsVisible();
        updateSessionSwitchUi();
        describeSessionSwitchState();
      }

      async function attachDataChannel(channel) {
        dataChannel = channel;
        channel.onopen = function () {
          setConnState('channel-open');
          setStatus('Channel open, waiting for host authentication challenge…');
        };
        channel.onclose = function () {
          setConnState('closed');
          setStatus('Connection closed.', 'error');
          authenticated = false;
          switchInFlight = false;
          setInteractiveControlsVisible();
          updateSessionSwitchUi();
          describeSessionSwitchState();
        };
        channel.onmessage = async function (event) {
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          if (msg.type === 'auth-challenge') {
            const response = await computeChallengeResponse(msg.challenge, passphrase);
            sendMessage({ type: 'auth-response', response });
            return;
          }

          if (msg.type === 'auth-result') {
            if (msg.ok) {
              authenticated = true;
              onAuthenticated();
            } else {
              setStatus('Authentication failed: ' + (msg.reason || 'Unknown reason'), 'error');
            }
            return;
          }

          if (!authenticated) return;

          switch (msg.type) {
            case 'init':
              currentMode = msg.mode === 'readwrite' ? 'readwrite' : 'readonly';
              modeBadge.textContent = 'Mode: ' + currentMode;
              replaceTerminal(msg.scrollback || '');
              setInteractiveControlsVisible();
              break;
            case 'session-catalog':
              applySessionCatalog(msg);
              break;
            case 'session-switch-result':
              applySessionSwitchResult(msg);
              break;
            case 'data':
              appendTerminal(msg.payload || '');
              break;
            case 'ping':
              sendMessage({ type: 'pong' });
              break;
            case 'end':
              setStatus('Host ended the shared session.', 'error');
              break;
          }
        };
      }

      function requestSessionSwitch() {
        if (!canSwitchSessions()) return;
        const targetSessionId = String(sessionSelect.value || '');
        if (!targetSessionId || targetSessionId === activeSessionId) {
          updateSessionSwitchUi();
          return;
        }
        switchInFlight = true;
        updateSessionSwitchUi();
        describeSessionSwitchState();
        sendMessage({ type: 'session-switch', sessionId: targetSessionId });
      }

      async function connectToHost(payload, token) {
        passphrase = payload.passphrase;
        currentMode = payload.mode === 'readwrite' ? 'readwrite' : 'readonly';
        modeBadge.textContent = 'Mode: ' + currentMode;

        const rtcConfig = {
          iceServers: Array.isArray(payload.iceServers) ? payload.iceServers : []
        };
        if (payload.iceTransportPolicy === 'relay') {
          rtcConfig.iceTransportPolicy = 'relay';
        }
        const pc = new RTCPeerConnection(rtcConfig);
        pc.oniceconnectionstatechange = function () {
          setConnState(pc.iceConnectionState);
        };
        pc.ondatachannel = function (event) {
          void attachDataChannel(event.channel);
        };

        const remoteDesc = await decodeConnectionCode(payload.offer, 'offer', passphrase);
        await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc);
        const answerCode = await encodeConnectionCode(pc.localDescription, passphrase);
        await submitAnswer(answerCode, token, payload.submitToken);
        setStatus('Answer delivered. Waiting for host confirmation…');
      }

      async function begin() {
        const token = resolvePairingTokenFromUrl();
        if (!token) {
          setStatus('Missing pairing token.', 'error');
          connectButton.disabled = true;
          return;
        }

        connectButton.addEventListener('click', async function () {
          const otp = String(otpInput.value || '').trim();
          if (!/^\\d{6}$/.test(otp)) {
            setStatus('Enter the 6-digit one-time code from desktop.', 'error');
            return;
          }

          connectButton.disabled = true;
          setStatus('Verifying one-time code…');
          setConnState('authorizing');

          try {
            const payload = await bootstrapPairing(otp, token);
            await connectToHost(payload, token);
          } catch (error) {
            setStatus((error && error.message) ? error.message : 'Connection failed.', 'error');
            connectButton.disabled = false;
            setConnState('error');
          }
        });

        composer.addEventListener('submit', function (event) {
          event.preventDefault();
          const value = String(commandInput.value || '');
          if (!sendCommandValue(value)) return;
          commandInput.value = '';
          pulseTap(10);
        });

        commandInput.addEventListener('keydown', function (event) {
          if (!canSendInteractiveInput()) return;
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            triggerQuickControl('up');
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            triggerQuickControl('down');
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            triggerQuickControl('left');
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            triggerQuickControl('right');
          } else if (event.key === 'Tab') {
            event.preventDefault();
            triggerQuickControl('tab');
          } else if (event.key === 'Escape') {
            event.preventDefault();
            triggerQuickControl('esc');
          }
        });

        historyPrevButton.addEventListener('click', function () {
          recallCommand(1);
        });

        historyNextButton.addEventListener('click', function () {
          recallCommand(-1);
        });

        commandChipList.addEventListener('click', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-command-chip]');
          if (!button) return;
          const value = String(button.getAttribute('data-command-chip') || '').trim();
          if (!value) return;
          const sent = sendCommandValue(value);
          if (sent) {
            commandInput.value = '';
            pulseTap(8);
          }
        });

        terminalClearButton.addEventListener('click', function () {
          clearTerminalView();
        });

        terminalCopyButton.addEventListener('click', function () {
          void copyTerminalView();
        });

        terminalFollowButton.addEventListener('click', function () {
          setFollowTerminal(!followTerminal);
        });

        terminalEl.addEventListener('scroll', function () {
          if (!followTerminal) return;
          const distanceFromBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight;
          if (distanceFromBottom > 24) {
            setFollowTerminal(false);
          }
        });

        quickControls.addEventListener('pointerdown', function (event) {
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          suppressQuickControlClickUntilMs = Date.now() + 400;
          triggerQuickControl(control);
          startQuickControlRepeat(control);
        });

        quickControls.addEventListener('pointerup', stopQuickControlRepeat);
        quickControls.addEventListener('pointercancel', stopQuickControlRepeat);
        quickControls.addEventListener('pointerleave', stopQuickControlRepeat);

        quickControls.addEventListener('click', function (event) {
          if (Date.now() < suppressQuickControlClickUntilMs) return;
          const rawTarget = event.target;
          if (!(rawTarget instanceof Element)) return;
          const button = rawTarget.closest('[data-control]');
          if (!button) return;
          const control = button.getAttribute('data-control');
          if (!control) return;
          triggerQuickControl(control);
        });

        sessionSelect.addEventListener('change', function () {
          updateSessionSwitchUi();
        });

        sessionSwitchButton.addEventListener('click', function () {
          requestSessionSwitch();
        });

        for (const tab of viewTabs) {
          tab.addEventListener('click', function () {
            const view = tab.getAttribute('data-mobile-view-tab');
            if (!view) return;
            if (view === 'controls' && controlsViewTab.disabled) return;
            setActiveView(view);
          });
        }

        setActiveView('terminal');
        setFollowTerminal(true);
        setControlsViewEnabled(false);
        syncSessionSelectOptions();
      }

      void begin();
    })();
  </script>
</body>
</html>`;
}

async function handleBootstrapRequest(record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (isExpired(record)) {
    pairings.delete(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, 'Pairing expired.');
    return;
  }
  if (isRateLimited(req, record.id, 'bootstrap')) {
    sendText(res, 429, 'Too many pairing attempts. Please wait and try again.');
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, 'Request body too large.');
      return;
    }
    sendText(res, 400, 'Invalid JSON payload.');
    return;
  }

  const body = (payload ?? {}) as { token?: unknown; otp?: unknown };
  if (!verifyPairingToken(record, body.token)) {
    sendText(res, 403, 'Pairing token is invalid.');
    return;
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    sendText(res, 429, 'Too many OTP attempts.');
    return;
  }

  if (typeof body.otp !== 'string' || body.otp.trim() !== record.otpCode) {
    record.attempts += 1;
    sendText(res, 401, 'One-time code mismatch.');
    return;
  }

  record.otpVerified = true;
  if (!record.submitToken) {
    record.submitToken = randomBytes(18).toString('hex');
  }

  sendJson(res, 200, {
    offer: record.offer,
    passphrase: record.passphrase,
    mode: record.mode,
    submitToken: record.submitToken,
    iceServers: record.rtcConfig.iceServers,
    iceTransportPolicy: record.rtcConfig.iceTransportPolicy,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  });
}

async function handleAnswerRequest(record: PairingRecord, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (isExpired(record)) {
    pairings.delete(record.id);
    clearRateLimitEntriesForPairing(record.id);
    sendText(res, 410, 'Pairing expired.');
    return;
  }
  if (isRateLimited(req, record.id, 'answer')) {
    sendText(res, 429, 'Too many answer submissions. Please wait and retry.');
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    if (error instanceof Error && error.message === 'request_too_large') {
      sendText(res, 413, 'Request body too large.');
      return;
    }
    sendText(res, 400, 'Invalid JSON payload.');
    return;
  }

  const body = (payload ?? {}) as { token?: unknown; submitToken?: unknown; answer?: unknown };
  if (!verifyPairingToken(record, body.token)) {
    sendText(res, 403, 'Pairing token is invalid.');
    return;
  }
  if (!record.otpVerified) {
    sendText(res, 403, 'OTP verification is required first.');
    return;
  }
  if (record.answer) {
    sendText(res, 409, 'Answer has already been submitted for this pairing.');
    return;
  }
  if (typeof body.submitToken !== 'string' || !record.submitToken || !safeCompareToken(record.submitToken, body.submitToken)) {
    sendText(res, 403, 'Submit token is invalid.');
    return;
  }
  if (typeof body.answer !== 'string' || body.answer.trim().length === 0) {
    sendText(res, 400, 'Missing answer payload.');
    return;
  }

  record.answer = body.answer.trim();
  record.submitToken = null;
  res.writeHead(204, { 'cache-control': 'no-store' });
  res.end();
}

function ensureServerHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  cleanupExpiredPairings();

  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET') {
    const record = getPagePairing(pathname);
    if (!record) {
      sendText(res, 404, 'Pairing not found.');
      return;
    }
    if (isExpired(record)) {
      pairings.delete(record.id);
      clearRateLimitEntriesForPairing(record.id);
      sendText(res, 410, 'Pairing expired.');
      return;
    }
    if (record.accessMode === 'lan' && !verifyPairingToken(record, url.searchParams.get('t'))) {
      sendText(res, 403, 'Invalid pairing token.');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(renderMobilePage(record.id));
    return;
  }

  if (req.method === 'POST') {
    const bootstrapRecord = getPairingFromPath(pathname, '/bootstrap');
    if (bootstrapRecord) {
      void handleBootstrapRequest(bootstrapRecord, req, res);
      return;
    }
    const answerRecord = getPairingFromPath(pathname, '/answer');
    if (answerRecord) {
      void handleAnswerRequest(answerRecord, req, res);
      return;
    }
  }

  sendText(res, 404, 'Route not found.');
}

async function ensureBridgeStarted(): Promise<MobileBridgeState> {
  if (bridgeState) return bridgeState;

  const host = pickLanHost();
  const server = http.createServer((req, res) => ensureServerHandler(req, res));
  const address = await new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const value = server.address();
      if (!value || typeof value === 'string') {
        reject(new Error('Mobile control bridge failed to bind port.'));
        return;
      }
      resolve(value);
    });
  });

  const cleanupTimer = setInterval(cleanupExpiredPairings, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  bridgeState = {
    server,
    port: address.port,
    host,
    cleanupTimer,
  };
  return bridgeState;
}

export async function createMobileControlPairing(
  options: MobileControlPairingOptions,
): Promise<MobileControlPairingResult> {
  const state = await ensureBridgeStarted();
  cleanupExpiredPairings();
  const rtcConfig = resolveShareRtcConfigFromEnv();
  const publicBaseUrl = resolveMobilePublicBaseUrl();
  const accessMode: 'lan' | 'remote' = publicBaseUrl ? 'remote' : 'lan';

  const now = Date.now();
  const requestedTtl = options.ttlMs;
  const ttlMs = typeof requestedTtl === 'number' && Number.isFinite(requestedTtl) && requestedTtl > 0
    ? requestedTtl
    : DEFAULT_TTL_MS;
  const record: PairingRecord = {
    id: randomBytes(12).toString('hex'),
    sessionId: options.sessionId,
    offer: options.offer,
    passphrase: options.passphrase,
    mode: options.mode,
    accessMode,
    token: randomBytes(20).toString('hex'),
    otpCode: createOtpCode(),
    attempts: 0,
    otpVerified: false,
    submitToken: null,
    answer: null,
    rtcConfig: {
      iceServers: rtcConfig.iceServers,
      iceTransportPolicy: rtcConfig.iceTransportPolicy,
    },
    createdAtMs: now,
    expiresAtMs: now + ttlMs,
  };
  pairings.set(record.id, record);

  const localPairingUrl = `http://${state.host}:${state.port}/m/${record.id}?t=${record.token}`;
  const pairingUrl = publicBaseUrl
    ? buildPairingUrl(publicBaseUrl, record.id, record.token, 'fragment')
    : localPairingUrl;

  return {
    pairingId: record.id,
    pairingUrl,
    localPairingUrl,
    accessMode,
    otpCode: record.otpCode,
    expiresAt: new Date(record.expiresAtMs).toISOString(),
  };
}

export function consumeMobileControlPairingAnswer(pairingId: string): MobileControlAnswerResult {
  const record = pairings.get(pairingId);
  if (!record) return { answer: null, status: 'expired' };
  if (isExpired(record)) {
    pairings.delete(pairingId);
    clearRateLimitEntriesForPairing(pairingId);
    return { answer: null, status: 'expired' };
  }
  if (!record.answer) return { answer: null, status: 'pending' };
  const answer = record.answer;
  pairings.delete(pairingId);
  clearRateLimitEntriesForPairing(pairingId);
  return { answer, status: 'ready' };
}

export function revokeMobileControlPairing(pairingId: string): void {
  pairings.delete(pairingId);
  clearRateLimitEntriesForPairing(pairingId);
}

export async function stopMobileControlBridge(): Promise<void> {
  if (!bridgeState) return;
  const current = bridgeState;
  bridgeState = null;
  clearInterval(current.cleanupTimer);
  pairings.clear();
  requestRateLimits.clear();
  await new Promise<void>((resolve) => current.server.close(() => resolve()));
}
