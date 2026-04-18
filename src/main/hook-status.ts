import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BrowserWindow } from 'electron';
import { isWin } from './platform';
import { buildStatusLinePython, buildStatusLineWrapper, STATUSLINE_PYTHON_HELPER } from './statusline-template';
import type { CostData, InspectorEvent, ProviderId } from '../shared/types';

export const STATUS_DIR = path.join(os.homedir(), '.calder', 'runtime');
const STATUSLINE_SCRIPT = path.join(STATUS_DIR, isWin ? 'statusline.cmd' : 'statusline.sh');
const STATUSLINE_PYTHON_PATH = path.join(STATUS_DIR, STATUSLINE_PYTHON_HELPER);

const KNOWN_EXTENSIONS = ['.status', '.sessionid', '.cost', '.toolfailure', '.events'];

let watcher: fs.FSWatcher | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
const lastMtimes = new Map<string, number>();
const eventFileOffsets = new Map<string, number>();
const eventFileRemainders = new Map<string, string>();
const knownSessionIds = new Set<string>();
const sessionProviders = new Map<string, ProviderId>();
const derivedUsageBySession = new Map<string, DerivedUsageAccumulator>();
type InspectorEventsMiddleware = (sessionId: string, events: InspectorEvent[]) => InspectorEvent[];
let inspectorEventsMiddleware: InspectorEventsMiddleware | null = null;

interface DerivedUsageAccumulator {
  model: string | null;
  contextWindowSize: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  totalApiDurationMs: number;
}

const PROVIDER_CONTEXT_WINDOW_DEFAULT: Record<ProviderId, number> = {
  claude: 200_000,
  codex: 200_000,
  copilot: 200_000,
  gemini: 1_000_000,
  qwen: 1_000_000,
  minimax: 200_000,
  blackbox: 200_000,
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickUsageObject(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const candidate = toObject(payload[key]);
    if (candidate) return candidate;
  }
  return null;
}

function parseCodexUsage(event: InspectorEvent): {
  totalInputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  totalOutputTokens: number;
} | null {
  const payload = event as unknown as Record<string, unknown>;
  const usage = pickUsageObject(payload, ['usage']);
  if (!usage) return null;

  const rawInput = Math.max(0, toNumber(usage.input_tokens ?? usage.inputTokens) ?? 0);
  const rawOutput = Math.max(0, toNumber(usage.output_tokens ?? usage.outputTokens) ?? 0);
  const rawCached = Math.max(
    0,
    toNumber(
      usage.cached_input_tokens
      ?? usage.cachedInputTokens
      ?? usage.cache_read_input_tokens
      ?? usage.cacheReadInputTokens,
    ) ?? 0,
  );
  const nonCachedInput = Math.max(0, rawInput - rawCached);

  if (rawInput === 0 && rawOutput === 0 && rawCached === 0) return null;
  return {
    totalInputTokens: rawInput,
    nonCachedInputTokens: nonCachedInput,
    cacheReadTokens: rawCached,
    totalOutputTokens: rawOutput,
  };
}

function parseGeminiUsage(event: InspectorEvent): {
  totalInputTokens: number;
  nonCachedInputTokens: number;
  cacheReadTokens: number;
  totalOutputTokens: number;
} | null {
  const payload = event as unknown as Record<string, unknown>;
  const usage = pickUsageObject(payload, ['usage_metadata', 'usageMetadata']);
  if (!usage) return null;

  const promptTokens = Math.max(0, toNumber(usage.promptTokenCount ?? usage.prompt_tokens) ?? 0);
  const cachedTokens = Math.max(0, toNumber(usage.cachedContentTokenCount ?? usage.cached_content_token_count) ?? 0);
  const candidateTokens = Math.max(0, toNumber(usage.candidatesTokenCount ?? usage.candidates_token_count) ?? 0);
  const thoughtTokens = Math.max(0, toNumber(usage.thoughtsTokenCount ?? usage.thoughts_token_count) ?? 0);
  const totalTokens = Math.max(0, toNumber(usage.totalTokenCount ?? usage.total_token_count) ?? 0);

  let outputTokens = candidateTokens + thoughtTokens;
  if (outputTokens <= 0 && totalTokens > 0) {
    outputTokens = Math.max(0, totalTokens - promptTokens);
  }

  const nonCachedInputTokens = Math.max(0, promptTokens - cachedTokens);
  if (promptTokens === 0 && outputTokens === 0 && cachedTokens === 0) return null;

  return {
    totalInputTokens: promptTokens,
    nonCachedInputTokens,
    cacheReadTokens: cachedTokens,
    totalOutputTokens: outputTokens,
  };
}

function createDefaultDerivedUsage(sessionId: string): DerivedUsageAccumulator {
  const providerId = sessionProviders.get(sessionId);
  return {
    model: null,
    contextWindowSize: providerId ? PROVIDER_CONTEXT_WINDOW_DEFAULT[providerId] : 200_000,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    nonCachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: 0,
    totalDurationMs: 0,
    totalApiDurationMs: 0,
  };
}

function deriveCostDataFromEvents(sessionId: string, events: InspectorEvent[]): CostData | null {
  const providerId = sessionProviders.get(sessionId);
  if (providerId !== 'codex' && providerId !== 'gemini') {
    return null;
  }

  const usage = derivedUsageBySession.get(sessionId) ?? createDefaultDerivedUsage(sessionId);
  let changed = false;

  for (const event of events) {
    const payload = event as unknown as Record<string, unknown>;
    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    if (model && model !== usage.model) {
      usage.model = model;
      changed = true;
    }

    const parsedUsage = providerId === 'codex' ? parseCodexUsage(event) : parseGeminiUsage(event);
    if (parsedUsage) {
      usage.totalInputTokens += parsedUsage.totalInputTokens;
      usage.totalOutputTokens += parsedUsage.totalOutputTokens;
      usage.nonCachedInputTokens += parsedUsage.nonCachedInputTokens;
      usage.cacheReadTokens += parsedUsage.cacheReadTokens;
      changed = true;
    }

    const costSnapshot = toObject(payload.cost_snapshot);
    const costUsd = toNumber(costSnapshot?.total_cost_usd);
    if (costUsd !== null && costUsd > usage.totalCostUsd) {
      usage.totalCostUsd = costUsd;
      changed = true;
    }
    const totalDurationMs = toNumber(costSnapshot?.total_duration_ms);
    if (totalDurationMs !== null && totalDurationMs > usage.totalDurationMs) {
      usage.totalDurationMs = totalDurationMs;
      changed = true;
    }
    const totalApiDurationMs = toNumber(costSnapshot?.total_api_duration_ms);
    if (totalApiDurationMs !== null && totalApiDurationMs > usage.totalApiDurationMs) {
      usage.totalApiDurationMs = totalApiDurationMs;
      changed = true;
    }

    const contextSnapshot = toObject(payload.context_snapshot);
    const contextWindowSize = toNumber(
      contextSnapshot?.context_window_size
      ?? payload.context_window_size
      ?? payload.contextWindowSize,
    );
    if (contextWindowSize !== null && contextWindowSize > 0 && contextWindowSize !== usage.contextWindowSize) {
      usage.contextWindowSize = contextWindowSize;
      changed = true;
    }
  }

  if (!changed) return null;
  derivedUsageBySession.set(sessionId, usage);

  const usedTokens = usage.nonCachedInputTokens + usage.cacheCreationTokens + usage.cacheReadTokens;
  const usedPercentage = usage.contextWindowSize > 0
    ? (usedTokens / usage.contextWindowSize) * 100
    : 0;

  return {
    source: 'derived',
    model: usage.model ?? undefined,
    cost: {
      total_cost_usd: usage.totalCostUsd,
      total_duration_ms: usage.totalDurationMs,
      total_api_duration_ms: usage.totalApiDurationMs,
    },
    context_window: {
      total_input_tokens: usage.totalInputTokens,
      total_output_tokens: usage.totalOutputTokens,
      context_window_size: usage.contextWindowSize,
      used_percentage: usedPercentage,
      current_usage: {
        input_tokens: usage.nonCachedInputTokens,
        output_tokens: usage.totalOutputTokens,
        cache_creation_input_tokens: usage.cacheCreationTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
      },
    },
  };
}

export function registerSession(sessionId: string, providerId?: ProviderId): void {
  knownSessionIds.add(sessionId);
  if (providerId) {
    sessionProviders.set(sessionId, providerId);
  }
}

export function unregisterSession(sessionId: string): void {
  knownSessionIds.delete(sessionId);
  sessionProviders.delete(sessionId);
  derivedUsageBySession.delete(sessionId);
}

export function setInspectorEventsMiddleware(middleware: InspectorEventsMiddleware | null): void {
  inspectorEventsMiddleware = middleware;
}

function isKnownExtension(filename: string): boolean {
  return KNOWN_EXTENSIONS.some(ext => filename.endsWith(ext));
}

function isStatuslineArtifact(filename: string): boolean {
  return filename.endsWith('.quota.json')
    || filename === 'statusline.refresh.lock'
    || filename === 'statusline.log';
}

export function getStatusLineScriptPath(): string {
  return STATUSLINE_SCRIPT;
}

export function installStatusLineScript(): void {
  fs.mkdirSync(STATUS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    STATUSLINE_PYTHON_PATH,
    buildStatusLinePython(STATUS_DIR),
    { mode: 0o755 },
  );
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
      if (content === 'working' || content === 'waiting' || content === 'completed' || content === 'input') {
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
    try { fs.unlinkSync(filePath); } catch { /* already gone */ }
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
        derivedUsageBySession.delete(sessionId);
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
          try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
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
        try { fs.closeSync(fd); } catch { /* already closed */ }
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
  sessionProviders.clear();
  derivedUsageBySession.clear();
  eventFileOffsets.clear();
  eventFileRemainders.clear();
}

export function cleanupSessionStatus(sessionId: string): void {
  for (const ext of KNOWN_EXTENSIONS) {
    try {
      fs.unlinkSync(path.join(STATUS_DIR, `${sessionId}${ext}`));
    } catch {
      // Already gone
    }
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
      if (isKnownExtension(file) || isStatuslineArtifact(file)) {
        try { fs.unlinkSync(path.join(STATUS_DIR, file)); } catch { /* already gone */ }
      }
    }
  } catch {
    // Directory may not exist
  }
}
