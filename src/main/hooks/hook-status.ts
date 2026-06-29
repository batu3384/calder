import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { ProviderId } from '../../shared/types/provider';
import type { InspectorEvent } from '../../shared/types/session';
import { isWin } from '../platform';
import {
  buildStatusLinePython,
  buildStatusLineWrapper,
  STATUSLINE_PYTHON_HELPER,
} from '../statusline/statusline-template';
import {
  clearDerivedUsageSession,
  deriveCostDataFromEvents,
  registerDerivedUsageSession,
  resetDerivedUsageState,
  unregisterDerivedUsageSession,
} from './hook-status-derived-usage';

export const STATUS_DIR = path.join(os.homedir(), '.calder', 'runtime');
const STATUSLINE_SCRIPT = path.join(STATUS_DIR, isWin ? 'statusline.cmd' : 'statusline.sh');
const STATUSLINE_PYTHON_PATH = path.join(STATUS_DIR, STATUSLINE_PYTHON_HELPER);

const KNOWN_EXTENSIONS = ['.status', '.sessionid', '.cost', '.toolfailure', '.events'];
const CLEANUP_SUFFIXES = [...KNOWN_EXTENSIONS, '.provider_sync.json'];

let watcher: fs.FSWatcher | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
const lastMtimes = new Map<string, number>();
const eventFileOffsets = new Map<string, number>();
const eventFileRemainders = new Map<string, string>();
const knownSessionIds = new Set<string>();
type InspectorEventsMiddleware = (sessionId: string, events: InspectorEvent[]) => InspectorEvent[];
let inspectorEventsMiddleware: InspectorEventsMiddleware | null = null;

export function registerSession(sessionId: string, providerId?: ProviderId): void {
  knownSessionIds.add(sessionId);
  registerDerivedUsageSession(sessionId, providerId);
}

export function unregisterSession(sessionId: string): void {
  knownSessionIds.delete(sessionId);
  unregisterDerivedUsageSession(sessionId);
}

export function setInspectorEventsMiddleware(middleware: InspectorEventsMiddleware | null): void {
  inspectorEventsMiddleware = middleware;
}

function isKnownExtension(filename: string): boolean {
  return KNOWN_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

function isStatuslineArtifact(filename: string): boolean {
  return (
    filename.endsWith('.quota.json') ||
    (filename.startsWith('statusline.refresh') && filename.endsWith('.lock')) ||
    filename === 'statusline.log'
  );
}

function isProviderSyncArtifact(filename: string): boolean {
  return filename.endsWith('.provider_sync.json');
}

export function getStatusLineScriptPath(): string {
  return STATUSLINE_SCRIPT;
}

export function installStatusLineScript(): void {
  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATUSLINE_PYTHON_PATH, buildStatusLinePython(STATUS_DIR), { mode: 0o755 });
  fs.writeFileSync(
    STATUSLINE_SCRIPT,
    buildStatusLineWrapper(STATUSLINE_PYTHON_PATH, path.join(STATUS_DIR, 'statusline.log')),
    { mode: 0o755 },
  );
}

function extractSessionId(filename: string): string {
  if (filename.endsWith('.toolfailure')) {
    const base = filename.replace('.toolfailure', '');
    const lastDash = base.lastIndexOf('-');
    return lastDash !== -1 ? base.slice(0, lastDash) : base;
  }
  for (const ext of KNOWN_EXTENSIONS) {
    if (filename.endsWith(ext)) return filename.slice(0, -ext.length);
  }
  return '';
}

function handleFileChange(win: BrowserWindow, filename: string): void {
  const extractedId = extractSessionId(filename);
  if (extractedId && !knownSessionIds.has(extractedId)) return;

  if (filename.endsWith('.status')) {
    const sessionId = filename.replace('.status', '');
    const filePath = path.join(STATUS_DIR, filename);

    try {
      const raw = fs.readFileSync(filePath, 'utf-8').trim();
      // Format: "HookEvent:status" (e.g. "PostToolUse:working") or legacy plain status
      const colonIdx = raw.indexOf(':');
      const hookName = colonIdx !== -1 ? raw.slice(0, colonIdx) : '';
      const content = colonIdx !== -1 ? raw.slice(colonIdx + 1) : raw;
      if (
        content === 'working' ||
        content === 'waiting' ||
        content === 'completed' ||
        content === 'input'
      ) {
        if (!win.isDestroyed()) {
          win.webContents.send('session:hookStatus', sessionId, content, hookName);
        }
      }
    } catch {
      // File may have been deleted between watch event and read
    }
  } else if (filename.endsWith('.sessionid')) {
    const sessionId = filename.replace('.sessionid', '');
    const filePath = path.join(STATUS_DIR, filename);

    try {
      const cliSessionId = fs.readFileSync(filePath, 'utf-8').trim();
      if (cliSessionId && !win.isDestroyed()) {
        win.webContents.send('session:cliSessionId', sessionId, cliSessionId);
        // Backward compatibility
        win.webContents.send('session:claudeSessionId', sessionId, cliSessionId);
      }
    } catch {
      // File may have been deleted between watch event and read
    }
  } else if (filename.endsWith('.cost')) {
    const sessionId = filename.replace('.cost', '');
    const filePath = path.join(STATUS_DIR, filename);

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      const costData = JSON.parse(content);
      if (!win.isDestroyed()) {
        win.webContents.send('session:costData', sessionId, costData);
      }
    } catch {
      // File may have been deleted or contain invalid JSON
    }
  } else if (filename.endsWith('.toolfailure')) {
    const sessionId = extractedId;
    const filePath = path.join(STATUS_DIR, filename);

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      const data = JSON.parse(content);
      if (!win.isDestroyed()) {
        win.webContents.send('session:toolFailure', sessionId, data);
      }
    } catch {
      // File may have been deleted or contain invalid JSON
    }
    // Always attempt cleanup — each failure is a one-shot event
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* already gone */
    }
  } else if (filename.endsWith('.events')) {
    const sessionId = filename.replace('.events', '');
    const filePath = path.join(STATUS_DIR, filename);
    let offset = eventFileOffsets.get(sessionId) ?? 0;

    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      if (stat.size < offset) {
        offset = 0;
        eventFileOffsets.set(sessionId, 0);
        eventFileRemainders.delete(sessionId);
        clearDerivedUsageSession(sessionId);
      }
      if (stat.size > offset) {
        const buf = Buffer.alloc(stat.size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        eventFileOffsets.set(sessionId, stat.size);
        const chunk = `${eventFileRemainders.get(sessionId) ?? ''}${buf.toString('utf-8')}`;
        const hasTrailingNewline = chunk.endsWith('\n');
        const splitLines = chunk.split('\n');
        const lines = (hasTrailingNewline ? splitLines : splitLines.slice(0, -1)).filter(Boolean);
        const trailing = hasTrailingNewline ? '' : (splitLines[splitLines.length - 1] ?? '');
        if (trailing) {
          eventFileRemainders.set(sessionId, trailing);
        } else {
          eventFileRemainders.delete(sessionId);
        }
        const events: InspectorEvent[] = [];
        for (const line of lines) {
          try {
            events.push(JSON.parse(line));
          } catch {
            /* skip malformed */
          }
        }
        if (events.length > 0) {
          const derivedCostData = deriveCostDataFromEvents(sessionId, events);
          if (derivedCostData && !win.isDestroyed()) {
            win.webContents.send('session:costData', sessionId, derivedCostData);
          }
        }
        let finalEvents = events;
        if (events.length > 0 && inspectorEventsMiddleware) {
          try {
            finalEvents = inspectorEventsMiddleware(sessionId, events);
          } catch (error) {
            console.warn('Inspector events middleware failed:', error);
          }
        }
        if (finalEvents.length > 0 && !win.isDestroyed()) {
          win.webContents.send('session:inspectorEvents', sessionId, finalEvents);
        }
      }
    } catch {
      // File may not exist yet
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          /* already closed */
        }
      }
    }
  }
}

function pollForChanges(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  try {
    const files = fs.readdirSync(STATUS_DIR);
    const seenFiles = new Set<string>();
    for (const filename of files) {
      if (!isKnownExtension(filename)) continue;
      const extractedId = extractSessionId(filename);
      if (extractedId && !knownSessionIds.has(extractedId)) continue;
      seenFiles.add(filename);
      const filePath = path.join(STATUS_DIR, filename);
      try {
        const stat = fs.statSync(filePath);
        const mtime = stat.mtimeMs;
        const prev = lastMtimes.get(filename);
        if (prev === undefined || mtime > prev) {
          lastMtimes.set(filename, mtime);
          handleFileChange(win, filename);
        }
      } catch {
        // File may have been deleted
      }
    }
    // Remove mtimes for files that no longer exist (or are no longer relevant)
    // so recreated one-shot files are handled again instead of being skipped.
    for (const tracked of Array.from(lastMtimes.keys())) {
      if (!seenFiles.has(tracked)) {
        lastMtimes.delete(tracked);
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

function startPolling(win: BrowserWindow): void {
  stopPolling();
  pollInterval = setInterval(() => pollForChanges(win), 2000);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  lastMtimes.clear();
}

function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

function restartWatcher(win: BrowserWindow): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });

  watcher = fs.watch(STATUS_DIR, (_eventType, filename) => {
    if (!filename) {
      resyncAllSessions(win);
      return;
    }
    handleFileChange(win, filename);
  });

  startPolling(win);
}

export function resyncAllSessions(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  try {
    const files = fs.readdirSync(STATUS_DIR);
    for (const filename of files) {
      if (isKnownExtension(filename)) {
        handleFileChange(win, filename);
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

export function restartAndResync(win: BrowserWindow): void {
  restartWatcher(win);
  resyncAllSessions(win);
}

export function startWatching(win: BrowserWindow): void {
  restartWatcher(win);
}

export function stopWatching(): void {
  stopPolling();
  stopWatcher();
  knownSessionIds.clear();
  resetDerivedUsageState();
  eventFileOffsets.clear();
  eventFileRemainders.clear();
}

export function cleanupSessionStatus(sessionId: string): void {
  for (const ext of CLEANUP_SUFFIXES) {
    try {
      fs.unlinkSync(path.join(STATUS_DIR, `${sessionId}${ext}`));
    } catch {
      // Already gone
    }
  }
  try {
    const dynamicToolFailurePrefix = `${sessionId}-`;
    for (const file of fs.readdirSync(STATUS_DIR)) {
      if (!file.startsWith(dynamicToolFailurePrefix) || !file.endsWith('.toolfailure')) {
        continue;
      }
      try {
        fs.unlinkSync(path.join(STATUS_DIR, file));
      } catch {
        // Already gone
      }
    }
  } catch {
    // Directory may not exist.
  }
  eventFileOffsets.delete(sessionId);
  eventFileRemainders.delete(sessionId);
  unregisterSession(sessionId);
}

export function cleanupAll(): void {
  stopWatching();
  inspectorEventsMiddleware = null;
  try {
    const files = fs.readdirSync(STATUS_DIR);
    for (const file of files) {
      if (isKnownExtension(file) || isStatuslineArtifact(file) || isProviderSyncArtifact(file)) {
        try {
          fs.unlinkSync(path.join(STATUS_DIR, file));
        } catch {
          /* already gone */
        }
      }
    }
  } catch {
    // Directory may not exist
  }
}
