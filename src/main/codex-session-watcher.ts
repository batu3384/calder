import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { STATUS_DIR } from './hooks/hook-status';

const HISTORY_PATH = path.join(os.homedir(), '.codex', 'history.jsonl');

/**
 * Codex CLI has no hook system to report session IDs back to the host app.
 * Instead, we tail ~/.codex/history.jsonl for new entries and extract the
 * session_id, then write a .sessionid file so hook-status picks it up.
 */

interface PendingCodexSessionHints {
  cwd?: string | null;
  sessionToken?: string | null;
  registeredAtMs?: number;
}

interface PendingSessionMetadata {
  registeredAtMs: number;
  sequence: number;
  cwdHint?: string;
  sessionTokenHint?: string;
}

interface ParsedHistorySession {
  codexSessionId: string;
  timestampMs: number | null;
  cwdHint?: string;
  sessionTokenHint?: string;
  lineIndex: number;
}

const MATCH_WEIGHTS = {
  sessionToken: 1_000_000_000,
  cwd: 1_000_000,
  timeWindowMs: 5 * 60 * 1000,
} as const;

const MAX_HINT_SEARCH_DEPTH = 4;
const SESSION_ID_KEYS = new Set(['session_id', 'sessionId']);
const SESSION_TOKEN_KEYS = new Set([
  'session_token',
  'sessionToken',
  'client_session_token',
  'clientSessionToken',
  'launch_token',
  'launchToken',
  'correlation_id',
  'correlationId',
  'request_id',
  'requestId',
]);
const CWD_KEYS = new Set([
  'cwd',
  'path',
  'project_path',
  'projectPath',
  'working_directory',
  'workingDirectory',
  'workdir',
  'directory',
  'dir',
]);
const TIMESTAMP_KEYS = new Set([
  'ts',
  'timestamp',
  'time',
  'created_at',
  'createdAt',
  'started_at',
  'startedAt',
  'event_timestamp',
  'eventTimestamp',
]);

// Maps UI session ID → registration metadata (FIFO + optional hints)
const pendingSessions = new Map<string, PendingSessionMetadata>();
const assignedCodexIds = new Set<string>();
let pendingSequence = 0;

let watcher: fs.FSWatcher | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentWindow: BrowserWindow | null = null;
let lastSize = 0;
let trailingLineRemainder = '';

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizePathHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = path.normalize(trimmed);
  const withoutTrailingSlash = normalized.replace(/[\\/]+$/, '');
  return withoutTrailingSlash.toLowerCase();
}

function normalizeSessionTokenHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1_000_000_000_000) return Math.trunc(value);
    if (value >= 1_000_000_000) return Math.trunc(value * 1000);
    return Math.trunc(value);
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return parseTimestampMs(numeric);
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function findFirstFieldValue(node: unknown, keys: Set<string>, depth = 0): unknown {
  if (depth > MAX_HINT_SEARCH_DEPTH || !node || typeof node !== 'object') return undefined;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstFieldValue(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (keys.has(key)) return value;
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const found = findFirstFieldValue(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function parseHistorySession(entry: unknown, lineIndex: number): ParsedHistorySession | null {
  if (!entry || typeof entry !== 'object') return null;

  const codexSessionId = toNonEmptyString(findFirstFieldValue(entry, SESSION_ID_KEYS));
  if (!codexSessionId) return null;

  const cwdRaw = toNonEmptyString(findFirstFieldValue(entry, CWD_KEYS));
  const tokenRaw = toNonEmptyString(findFirstFieldValue(entry, SESSION_TOKEN_KEYS));
  const timestampRaw = findFirstFieldValue(entry, TIMESTAMP_KEYS);

  return {
    codexSessionId,
    timestampMs: parseTimestampMs(timestampRaw),
    cwdHint: cwdRaw ? normalizePathHint(cwdRaw) ?? undefined : undefined,
    sessionTokenHint: tokenRaw ? normalizeSessionTokenHint(tokenRaw) ?? undefined : undefined,
    lineIndex,
  };
}

function comparePendingOrder(
  [leftId, left]: [string, PendingSessionMetadata],
  [rightId, right]: [string, PendingSessionMetadata],
): number {
  if (left.registeredAtMs !== right.registeredAtMs) {
    return left.registeredAtMs - right.registeredAtMs;
  }
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return leftId.localeCompare(rightId);
}

function getOldestPendingSessionId(): string | null {
  let oldest: [string, PendingSessionMetadata] | null = null;
  for (const entry of pendingSessions) {
    if (!oldest || comparePendingOrder(entry, oldest) < 0) {
      oldest = entry;
    }
  }
  return oldest?.[0] ?? null;
}

function scoreHistoryMatch(
  history: ParsedHistorySession,
  pending: PendingSessionMetadata,
): number {
  let score = 0;

  if (
    history.sessionTokenHint
    && pending.sessionTokenHint
    && history.sessionTokenHint === pending.sessionTokenHint
  ) {
    score += MATCH_WEIGHTS.sessionToken;
  }

  if (history.cwdHint && pending.cwdHint && history.cwdHint === pending.cwdHint) {
    score += MATCH_WEIGHTS.cwd;
  }

  if (history.timestampMs !== null) {
    const delta = Math.abs(history.timestampMs - pending.registeredAtMs);
    score += Math.max(0, MATCH_WEIGHTS.timeWindowMs - delta);
  }

  return score;
}

function findBestPendingMatch(
  history: ParsedHistorySession,
): { sessionId: string; metadata: PendingSessionMetadata; score: number } | null {
  let best: { sessionId: string; metadata: PendingSessionMetadata; score: number } | null = null;

  for (const [sessionId, metadata] of pendingSessions) {
    const score = scoreHistoryMatch(history, metadata);
    if (!best || score > best.score) {
      best = { sessionId, metadata, score };
      continue;
    }
    if (score === best.score) {
      const cmp = comparePendingOrder(
        [sessionId, metadata],
        [best.sessionId, best.metadata],
      );
      if (cmp < 0) {
        best = { sessionId, metadata, score };
      }
    }
  }

  return best;
}

function assignSessionIdToPending(uiSessionId: string, codexSessionId: string): void {
  assignedCodexIds.add(codexSessionId);
  pendingSessions.delete(uiSessionId);

  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(STATUS_DIR, `${uiSessionId}.sessionid`),
    codexSessionId
  );
}

function assignHistorySessions(entries: ParsedHistorySession[]): void {
  if (entries.length === 0 || pendingSessions.size === 0) return;

  const remaining = [...entries];

  // Assign higher-confidence matches first so weak/ambiguous entries
  // do not consume FIFO slots needed by strong cwd/token/time matches.
  while (pendingSessions.size > 0 && remaining.length > 0) {
    let selected:
      | {
        remainingIndex: number;
        match: { sessionId: string; metadata: PendingSessionMetadata; score: number };
        lineIndex: number;
      }
      | null = null;

    for (let i = 0; i < remaining.length; i += 1) {
      const match = findBestPendingMatch(remaining[i]);
      if (!match || match.score <= 0) continue;

      if (!selected || match.score > selected.match.score) {
        selected = { remainingIndex: i, match, lineIndex: remaining[i].lineIndex };
        continue;
      }
      if (match.score === selected.match.score) {
        const cmp = comparePendingOrder(
          [match.sessionId, match.metadata],
          [selected.match.sessionId, selected.match.metadata],
        );
        if (cmp < 0 || (cmp === 0 && remaining[i].lineIndex < selected.lineIndex)) {
          selected = { remainingIndex: i, match, lineIndex: remaining[i].lineIndex };
        }
      }
    }

    if (!selected) break;

    const [entry] = remaining.splice(selected.remainingIndex, 1);
    assignSessionIdToPending(selected.match.sessionId, entry.codexSessionId);
  }

  // Backward-compatible fallback: assign unmatched entries to oldest pending.
  for (const entry of remaining) {
    if (pendingSessions.size === 0) break;
    const oldestPendingSessionId = getOldestPendingSessionId();
    if (!oldestPendingSessionId) break;
    assignSessionIdToPending(oldestPendingSessionId, entry.codexSessionId);
  }
}

function readNewEntries(): void {
  if (pendingSessions.size === 0) return;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(HISTORY_PATH);
  } catch {
    return;
  }

  // Handle history truncation/rotation without permanently skipping new lines.
  if (stat.size < lastSize) {
    lastSize = 0;
    trailingLineRemainder = '';
  }

  if (stat.size <= lastSize) return;

  let fd: number | null = null;
  try {
    fd = fs.openSync(HISTORY_PATH, 'r');
    const readLength = stat.size - lastSize;
    const buf = Buffer.alloc(readLength);
    const bytesRead = fs.readSync(fd, buf, 0, readLength, lastSize);
    if (bytesRead <= 0) return;
    lastSize += bytesRead;

    const chunk = `${trailingLineRemainder}${buf.toString('utf-8', 0, bytesRead)}`;
    const hasTrailingNewline = chunk.endsWith('\n');
    const splitLines = chunk.split('\n');
    const lines = (hasTrailingNewline ? splitLines : splitLines.slice(0, -1))
      .map((line) => line.trim())
      .filter(Boolean);
    trailingLineRemainder = hasTrailingNewline ? '' : (splitLines[splitLines.length - 1] ?? '');

    const parsedSessions: ParsedHistorySession[] = [];
    const seenCodexSessionIds = new Set<string>();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      try {
        const entry = JSON.parse(line);
        const parsed = parseHistorySession(entry, i);
        if (!parsed) continue;
        if (assignedCodexIds.has(parsed.codexSessionId)) continue;
        if (seenCodexSessionIds.has(parsed.codexSessionId)) continue;
        seenCodexSessionIds.add(parsed.codexSessionId);
        parsedSessions.push(parsed);
      } catch {
        // Skip malformed lines
      }
    }

    assignHistorySessions(parsedSessions);
  } catch {
    // File read error
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }
}

export function registerPendingCodexSession(
  sessionId: string,
  hints: PendingCodexSessionHints = {},
): void {
  // Only advance lastSize when first session registers, so we don't skip
  // entries that arrived between multiple rapid registrations
  if (pendingSessions.size === 0) {
    try {
      const stat = fs.statSync(HISTORY_PATH);
      lastSize = stat.size;
    } catch {
      lastSize = 0;
    }
    trailingLineRemainder = '';
  }

  const registeredAtMs = typeof hints.registeredAtMs === 'number' && Number.isFinite(hints.registeredAtMs)
    ? Math.trunc(hints.registeredAtMs)
    : Date.now();
  const normalizedCwd = hints.cwd ? normalizePathHint(hints.cwd) : null;
  const normalizedToken = hints.sessionToken ? normalizeSessionTokenHint(hints.sessionToken) : null;

  pendingSessions.set(sessionId, {
    registeredAtMs,
    sequence: pendingSequence,
    cwdHint: normalizedCwd ?? undefined,
    sessionTokenHint: normalizedToken ?? undefined,
  });
  pendingSequence += 1;
}

export function unregisterCodexSession(sessionId: string): void {
  pendingSessions.delete(sessionId);
}

export function startCodexSessionWatcher(win: BrowserWindow): void {
  // Keep polling target current even if watcher was already started.
  currentWindow = win;
  if (watcher) return;

  const dir = path.dirname(HISTORY_PATH);
  try {
    fs.mkdirSync(dir, { recursive: true });
    watcher = fs.watch(dir, (_event, filename) => {
      if (filename === 'history.jsonl' && pendingSessions.size > 0) {
        readNewEntries();
      }
    });
  } catch {
    // Directory might not exist; fall through to polling
  }

  // Polling fallback — fs.watch can miss events on some systems
  pollInterval = setInterval(() => {
    if (pendingSessions.size > 0 && currentWindow && !currentWindow.isDestroyed()) {
      readNewEntries();
    }
  }, 2000);
}

export function stopCodexSessionWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  pendingSessions.clear();
  assignedCodexIds.clear();
  pendingSequence = 0;
  currentWindow = null;
  lastSize = 0;
  trailingLineRemainder = '';
}
