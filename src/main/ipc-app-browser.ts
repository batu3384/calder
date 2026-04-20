import { ipcMain, BrowserWindow, app, shell, webContents } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BrowserCredentialSaveInput } from '../shared/types';
import type { ProjectGovernanceOperation } from './calder-governance/enforcement';
import { discoverLocalBrowserTargets } from './local-dev-targets';
import {
  deleteBrowserCredentialById,
  getBrowserAutoFillCredentialForUrl,
  getBrowserCredentialForFill,
  listBrowserCredentialSummariesForUrl,
  saveBrowserCredentialForUrl,
} from './browser-credential-vault';
import { openUrlWithBrowserPolicy } from './browser-open-policy';
import { getPtyCwd } from './pty-manager';

const ALLOWED_GUEST_MESSAGE_CHANNELS = new Set([
  'enter-inspect-mode',
  'exit-inspect-mode',
  'enter-flow-mode',
  'exit-flow-mode',
  'enter-draw-mode',
  'exit-draw-mode',
  'draw-clear',
  'flow-do-click',
  'auth-fill-credentials',
]);
const GUEST_CHANNELS_WITHOUT_ARGS = new Set([
  'enter-inspect-mode',
  'exit-inspect-mode',
  'enter-flow-mode',
  'exit-flow-mode',
  'enter-draw-mode',
  'exit-draw-mode',
  'draw-clear',
]);
const MAX_GUEST_MESSAGE_BYTES = 1 * 1024 * 1024;
const MAX_GUEST_CREDENTIAL_FIELD_BYTES = 8 * 1024;
const MAX_SCREENSHOT_BYTES = 50 * 1024 * 1024;
const MAX_SCREENSHOT_B64_LEN = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3);
const SCREENSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
let screenshotsPruned = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSerializedSizeWithinLimit(value: unknown, maxBytes: number): boolean {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return false;
    return Buffer.byteLength(serialized, 'utf8') <= maxBytes;
  } catch {
    return false;
  }
}

function isValidAuthFillPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const username = payload.username;
  const password = payload.password;
  if (username !== undefined && !isString(username)) return false;
  if (password !== undefined && !isString(password)) return false;
  if (isString(username) && Buffer.byteLength(username, 'utf8') > MAX_GUEST_CREDENTIAL_FIELD_BYTES) return false;
  if (isString(password) && Buffer.byteLength(password, 'utf8') > MAX_GUEST_CREDENTIAL_FIELD_BYTES) return false;

  return true;
}

export function isAllowedGuestMessagePayload(channel: string, args: unknown[]): boolean {
  if (!isSerializedSizeWithinLimit(args, MAX_GUEST_MESSAGE_BYTES)) {
    return false;
  }

  if (GUEST_CHANNELS_WITHOUT_ARGS.has(channel)) {
    return args.length === 0;
  }

  if (channel === 'flow-do-click') {
    if (args.length !== 1) return false;
    const payload = args[0];
    if (!(isRecord(payload) || isString(payload) || Array.isArray(payload))) {
      return false;
    }
    return isSerializedSizeWithinLimit(payload, MAX_GUEST_MESSAGE_BYTES);
  }

  if (channel === 'auth-fill-credentials') {
    return args.length === 1 && isValidAuthFillPayload(args[0]);
  }

  return false;
}

async function pruneOldScreenshots(dir: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(dir);
    const now = Date.now();
    await Promise.all(entries.map(async (name) => {
      const full = path.join(dir, name);
      try {
        const stat = await fs.promises.stat(full);
        if (now - stat.mtimeMs > SCREENSHOT_MAX_AGE_MS) {
          await fs.promises.unlink(full);
        }
      } catch (err) {
        console.warn('Failed to prune screenshot', full, err);
      }
    }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('Failed to read screenshots dir for pruning', err);
    }
  }
}

export interface AppBrowserIpcOps {
  requireKnownProjectPath: (projectPath: string, contextLabel: string) => string;
  getActiveProjectPath: () => string | undefined;
  assertProjectGovernanceAllows: (projectPath: string, operation: ProjectGovernanceOperation) => Promise<void>;
}

export function registerAppBrowserIpcHandlers(ops: AppBrowserIpcOps): void {
  ipcMain.on('app:focus', () => {
    app.focus({ steal: true });
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:getBrowserPreloadPath', () =>
    path.join(__dirname, '..', '..', 'preload', 'preload', 'browser-tab-preload.js')
  );
  ipcMain.handle('app:sendToGuestWebContents', (_event, webContentsId: number, channel: string, ...args: unknown[]) => {
    if (!ALLOWED_GUEST_MESSAGE_CHANNELS.has(channel)) {
      console.warn(`app:sendToGuestWebContents blocked unknown channel: ${channel}`);
      return false;
    }
    if (!isAllowedGuestMessagePayload(channel, args)) {
      console.warn(`app:sendToGuestWebContents blocked invalid payload for channel: ${channel}`);
      return false;
    }
    const guest = webContents.fromId(webContentsId);
    if (!guest || guest.isDestroyed()) return false;
    if (typeof guest.getType === 'function' && guest.getType() !== 'webview') {
      console.warn(`app:sendToGuestWebContents blocked non-webview target: ${guest.getType()}`);
      return false;
    }
    guest.send(channel, ...args);
    return true;
  });

  ipcMain.handle('browser:saveScreenshot', async (_event, sessionId: string, dataUrl: string) => {
    const PREFIX = 'data:image/png;base64,';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) {
      throw new Error('Invalid screenshot data URL');
    }
    const b64 = dataUrl.slice(PREFIX.length);
    if (b64.length > MAX_SCREENSHOT_B64_LEN) {
      throw new Error('Screenshot data exceeds size limit');
    }
    const buffer = Buffer.from(b64, 'base64');
    const dir = path.join(os.tmpdir(), 'calder-screenshots');
    await fs.promises.mkdir(dir, { recursive: true });
    if (!screenshotsPruned) {
      screenshotsPruned = true;
      void pruneOldScreenshots(dir);
    }
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `draw-${safeId}-${Date.now()}.png`);
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  });

  ipcMain.handle('browser:listLocalTargets', async () => discoverLocalBrowserTargets());
  ipcMain.handle('browserCredential:listForUrl', async (_event, url: string) =>
    listBrowserCredentialSummariesForUrl(url));
  ipcMain.handle('browserCredential:saveForUrl', async (_event, input: BrowserCredentialSaveInput) =>
    saveBrowserCredentialForUrl(input));
  ipcMain.handle('browserCredential:deleteById', async (_event, id: string) =>
    deleteBrowserCredentialById(id));
  ipcMain.handle('browserCredential:getForFill', async (_event, url: string, id: string) =>
    getBrowserCredentialForFill(url, id));
  ipcMain.handle('browserCredential:getAutoFillForUrl', async (_event, url: string) =>
    getBrowserAutoFillCredentialForUrl(url));
  ipcMain.handle('app:openExternal', async (_event, url: string, cwd?: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only HTTP(S) URLs are allowed');
    }
    const governanceProjectPath = cwd
      ? ops.requireKnownProjectPath(cwd, 'Open external URL')
      : ops.getActiveProjectPath();
    if (governanceProjectPath) {
      await ops.assertProjectGovernanceAllows(governanceProjectPath, {
        kind: 'network',
        label: 'Open external URL',
        target: parsed.hostname,
      });
    }
    const win = BrowserWindow.getAllWindows()[0];
    return openUrlWithBrowserPolicy({ url, cwd, preferEmbedded: true }, win, (target) => shell.openExternal(target));
  });

  ipcMain.handle('pty:getCwd', (_event, sessionId: string) => getPtyCwd(sessionId));
}
