import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { BrowserWindow } from 'electron';
import { STATUS_DIR } from './hook-status';

const SESSION_STATE_DIR = path.join(os.homedir(), '.copilot', 'session-state');
const MATCH_WINDOW_MS = 10 * 60 * 1000;

interface PendingCopilotSessionHints {
  cwd?: string | null;
  registeredAtMs?: number;
}

interface PendingSessionMetadata {
  registeredAtMs: number;
  sequence: number;
  cwdHint?: string;
  knownSessionIdsAtRegistration: Set<string>;
}

interface CopilotSessionState {
  id: string;
  cwd?: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

const pendingSessions = new Map<string, PendingSessionMetadata>();
const assignedCopilotIds = new Set<string>();
let pendingSequence = 0;
let watcher: fs.FSWatcher | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentWindow: BrowserWindow | null = null;

function normalizePathHint(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return path.normalize(trimmed).replace(/[\\/]+$/, '').toLowerCase();
}

function parseYamlScalar(contents: string, key: string): string | null {
  const pattern = new RegExp(`^${key}:\\s*(.*)$`, 'm');
  const match = contents.match(pattern);
  if (!match) return null;
  const raw = match[1]?.trim() ?? '';
  if (!raw) return null;
  return raw.replace(/^['"]|['"]$/g, '');
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCopilotSessionState(sessionDir: string): CopilotSessionState | null {
  const workspacePath = path.join(SESSION_STATE_DIR, sessionDir, 'workspace.yaml');
  try {
    const contents = fs.readFileSync(workspacePath, 'utf-8');
    const id = parseYamlScalar(contents, 'id') ?? sessionDir;
    return {
      id,
      cwd: parseYamlScalar(contents, 'cwd') ?? undefined,
      createdAtMs: parseTimestampMs(parseYamlScalar(contents, 'created_at')),
      updatedAtMs: parseTimestampMs(parseYamlScalar(contents, 'updated_at')),
    };
  } catch {
    return null;
  }
}

function listCopilotSessionIds(): Set<string> {
  try {
    return new Set(fs.readdirSync(SESSION_STATE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

function isCandidateNewEnough(candidate: CopilotSessionState, pending: PendingSessionMetadata): boolean {
  const candidateTime = candidate.createdAtMs ?? candidate.updatedAtMs;
  if (candidateTime === null) return true;
  return candidateTime >= pending.registeredAtMs - 30_000
    && candidateTime <= pending.registeredAtMs + MATCH_WINDOW_MS;
}

function scoreCandidate(candidate: CopilotSessionState, pending: PendingSessionMetadata): number {
  if (pending.knownSessionIdsAtRegistration.has(candidate.id)) return 0;
  if (assignedCopilotIds.has(candidate.id)) return 0;
  if (!isCandidateNewEnough(candidate, pending)) return 0;

  let score = 1;
  const cwd = candidate.cwd ? normalizePathHint(candidate.cwd) : null;
  if (pending.cwdHint && cwd === pending.cwdHint) score += 1_000_000;

  const candidateTime = candidate.createdAtMs ?? candidate.updatedAtMs;
  if (candidateTime !== null) {
    const delta = Math.abs(candidateTime - pending.registeredAtMs);
    score += Math.max(0, MATCH_WINDOW_MS - delta);
  }

  return score;
}

function comparePendingOrder(
  [leftId, left]: [string, PendingSessionMetadata],
  [rightId, right]: [string, PendingSessionMetadata],
): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  return leftId.localeCompare(rightId);
}

function assignSessionIdToPending(uiSessionId: string, copilotSessionId: string): void {
  assignedCopilotIds.add(copilotSessionId);
  pendingSessions.delete(uiSessionId);

  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(STATUS_DIR, `${uiSessionId}.sessionid`), copilotSessionId);
}

function scanCopilotSessions(): void {
  if (pendingSessions.size === 0) return;

  let candidates: CopilotSessionState[] = [];
  try {
    candidates = fs.readdirSync(SESSION_STATE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readCopilotSessionState(entry.name))
      .filter((entry): entry is CopilotSessionState => !!entry);
  } catch {
    return;
  }

  const remaining = [...candidates].sort((a, b) => {
    const aTime = a.createdAtMs ?? a.updatedAtMs ?? 0;
    const bTime = b.createdAtMs ?? b.updatedAtMs ?? 0;
    return aTime - bTime;
  });

  while (pendingSessions.size > 0 && remaining.length > 0) {
    let selected:
      | {
        remainingIndex: number;
        sessionId: string;
        metadata: PendingSessionMetadata;
        score: number;
      }
      | null = null;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      for (const [sessionId, metadata] of pendingSessions) {
        const score = scoreCandidate(candidate, metadata);
        if (score <= 0) continue;
        if (!selected || score > selected.score) {
          selected = { remainingIndex: i, sessionId, metadata, score };
          continue;
        }
        if (score === selected.score) {
          const cmp = comparePendingOrder(
            [sessionId, metadata],
            [selected.sessionId, selected.metadata],
          );
          if (cmp < 0) selected = { remainingIndex: i, sessionId, metadata, score };
        }
      }
    }

    if (!selected) break;
    const [candidate] = remaining.splice(selected.remainingIndex, 1);
    assignSessionIdToPending(selected.sessionId, candidate.id);
  }
}

export function registerPendingCopilotSession(
  sessionId: string,
  hints: PendingCopilotSessionHints = {},
): void {
  const registeredAtMs = typeof hints.registeredAtMs === 'number' && Number.isFinite(hints.registeredAtMs)
    ? Math.trunc(hints.registeredAtMs)
    : Date.now();
  const normalizedCwd = hints.cwd ? normalizePathHint(hints.cwd) : null;

  pendingSessions.set(sessionId, {
    registeredAtMs,
    sequence: pendingSequence,
    cwdHint: normalizedCwd ?? undefined,
    knownSessionIdsAtRegistration: listCopilotSessionIds(),
  });
  pendingSequence += 1;
}

export function unregisterCopilotSession(sessionId: string): void {
  pendingSessions.delete(sessionId);
}

export function startCopilotSessionWatcher(win: BrowserWindow): void {
  currentWindow = win;
  if (watcher) return;

  try {
    fs.mkdirSync(SESSION_STATE_DIR, { recursive: true });
    watcher = fs.watch(SESSION_STATE_DIR, () => {
      if (pendingSessions.size > 0) scanCopilotSessions();
    });
  } catch {
    // Polling below covers systems where fs.watch cannot attach.
  }

  pollInterval = setInterval(() => {
    if (pendingSessions.size > 0 && currentWindow && !currentWindow.isDestroyed()) {
      scanCopilotSessions();
    }
  }, 2000);
}

export function stopCopilotSessionWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  pendingSessions.clear();
  assignedCopilotIds.clear();
  pendingSequence = 0;
  currentWindow = null;
}
