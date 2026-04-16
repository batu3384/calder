import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BrowserWindow } from 'electron';
import { STATUS_DIR } from './hook-status';

const SESSIONS_DIR = path.join(os.homedir(), '.blackboxcli', 'sessions');

const pendingSessions = new Map<string, number>();
const assignedBlackboxIds = new Set<string>();
let knownSessionFiles = new Set<string>();

let watcher: fs.FSWatcher | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function isSessionFile(filename: string): boolean {
  return filename.startsWith('blackbox_secure_session_') && filename.endsWith('.json');
}

function listSessionFiles(): string[] {
  try {
    return fs.readdirSync(SESSIONS_DIR).filter(isSessionFile);
  } catch {
    return [];
  }
}

function extractSessionId(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.sessionId === 'string' && parsed.sessionId) return parsed.sessionId;
    if (typeof parsed.chatId === 'string' && parsed.chatId) return parsed.chatId;
  } catch {
    // Fall back to filename parsing below.
  }

  const match = path.basename(filePath).match(/^blackbox_secure_session_(.+)\.json$/);
  return match?.[1] ?? null;
}

function assignToOldestPending(cliSessionId: string): void {
  let oldestSessionId: string | null = null;
  let oldestTimestamp = Infinity;

  for (const [sessionId, registeredAt] of pendingSessions) {
    if (registeredAt < oldestTimestamp) {
      oldestTimestamp = registeredAt;
      oldestSessionId = sessionId;
    }
  }

  if (!oldestSessionId) return;

  assignedBlackboxIds.add(cliSessionId);
  pendingSessions.delete(oldestSessionId);
  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(STATUS_DIR, `${oldestSessionId}.sessionid`), cliSessionId);
}

function scanForNewSessions(): void {
  if (pendingSessions.size === 0) return;

  const sessionFiles = listSessionFiles();
  const currentFiles = new Set(sessionFiles);
  // Drop stale entries so a filename that disappears and later reappears
  // can be processed again.
  for (const known of Array.from(knownSessionFiles)) {
    if (!currentFiles.has(known)) {
      knownSessionFiles.delete(known);
    }
  }

  for (const filename of sessionFiles) {
    if (knownSessionFiles.has(filename)) continue;
    knownSessionFiles.add(filename);

    const cliSessionId = extractSessionId(path.join(SESSIONS_DIR, filename));
    if (!cliSessionId || assignedBlackboxIds.has(cliSessionId)) continue;
    assignToOldestPending(cliSessionId);

    if (pendingSessions.size === 0) break;
  }
}

export function registerPendingBlackboxSession(sessionId: string): void {
  if (pendingSessions.size === 0) {
    knownSessionFiles = new Set(listSessionFiles());
  }
  pendingSessions.set(sessionId, Date.now());
}

export function unregisterBlackboxSession(sessionId: string): void {
  pendingSessions.delete(sessionId);
}

export function startBlackboxSessionWatcher(win: BrowserWindow): void {
  if (watcher) return;

  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    watcher = fs.watch(SESSIONS_DIR, () => {
      if (pendingSessions.size > 0) {
        scanForNewSessions();
      }
    });
  } catch {
    // Fall through to polling.
  }

  pollInterval = setInterval(() => {
    if (pendingSessions.size > 0 && !win.isDestroyed()) {
      scanForNewSessions();
    }
  }, 2000);
}

export function stopBlackboxSessionWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  pendingSessions.clear();
  assignedBlackboxIds.clear();
  knownSessionFiles = new Set();
}
