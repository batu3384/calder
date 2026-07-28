import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  EvidenceEvent,
  EvidenceRunMeta,
  EvidenceSettings,
} from '../../shared/types-evidence.js';
import { DEFAULT_EVIDENCE_SETTINGS, EvidenceSettingsSchema } from '../../shared/types-evidence.js';
import type { InspectorEvent } from '../../shared/types-session.js';
import { beginClosing, ingestEvent, setGitBaseline } from './finalization.js';
import { captureGitFingerprintBaseline } from './git-evidence.js';
import {
  createPtyExitedEvent,
  createPtyStartedEvent,
  normalizeInspectorEvent,
} from './normalize.js';
import { resolveEvidenceRoot } from './paths.js';
import { createRun, readMeta, recoverOpenRuns, writeMeta } from './store.js';

function completionStateForEvent(
  type: EvidenceEvent['type'],
): EvidenceRunMeta['completionState'] | null {
  if (type === 'provider_session_completed') {
    return 'completed';
  }
  if (type === 'provider_session_failed') {
    return 'failed';
  }
  return null;
}

const sessionToRun = new Map<string, string>();
const sessionChains = new Map<string, Promise<void>>();
let settings: EvidenceSettings = { ...DEFAULT_EVIDENCE_SETTINGS };
let settingsLoaded = false;

export type EvidenceEventNotifier = (runId: string, events: EvidenceEvent[]) => void;
let evidenceEventNotifier: EvidenceEventNotifier | null = null;

export function setEvidenceEventNotifier(notifier: EvidenceEventNotifier | null): void {
  evidenceEventNotifier = notifier;
}

function notifyEvidenceEvents(runId: string, events: EvidenceEvent[]): void {
  if (events.length === 0 || !evidenceEventNotifier) return;
  evidenceEventNotifier(runId, events);
}

function settingsPath(dataRootOverride?: string): string {
  return path.join(resolveEvidenceRoot(dataRootOverride), 'settings.json');
}

function loadSettings(dataRootOverride?: string): EvidenceSettings {
  if (dataRootOverride !== undefined) {
    // ponytail: override paths (tests, tooling) bypass the global cache so a
    // test root can never pollute prod settings; upgrade = per-root cache map.
    return readSettingsFromDisk(dataRootOverride);
  }
  if (settingsLoaded) {
    return settings;
  }
  settings = readSettingsFromDisk(undefined);
  settingsLoaded = true;
  return settings;
}

function readSettingsFromDisk(dataRootOverride?: string): EvidenceSettings {
  const filePath = settingsPath(dataRootOverride);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_EVIDENCE_SETTINGS };
  }
  try {
    return EvidenceSettingsSchema.parse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return { ...DEFAULT_EVIDENCE_SETTINGS };
  }
}

function persistSettings(next: EvidenceSettings, dataRootOverride?: string): EvidenceSettings {
  const parsed = EvidenceSettingsSchema.parse(next);
  const filePath = settingsPath(dataRootOverride);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf8');
    } else {
      throw err;
    }
  }
  settings = parsed;
  settingsLoaded = true;
  return parsed;
}

export interface StartEvidenceRunInput {
  sessionId: string;
  providerId: string;
  projectId: string;
  projectPath: string;
  dataRootOverride?: string;
}

export async function startEvidenceRun(
  input: StartEvidenceRunInput,
): Promise<EvidenceRunMeta | null> {
  const currentSettings = loadSettings(input.dataRootOverride);
  if (!currentSettings.enabled) return null;

  const existingRunId = sessionToRun.get(input.sessionId);
  if (existingRunId) {
    const existing = readMeta(existingRunId, input.dataRootOverride);
    if (existing && (existing.state === 'open' || existing.state === 'closing')) {
      return existing;
    }
    sessionToRun.delete(input.sessionId);
  }

  const runId = randomUUID();
  const meta = createRun(
    {
      runId,
      calderSessionId: input.sessionId,
      providerId: input.providerId,
      projectId: input.projectId,
      projectPath: input.projectPath,
    },
    input.dataRootOverride,
  );

  sessionToRun.set(input.sessionId, runId);

  const ptyStarted = createPtyStartedEvent({
    sessionId: input.sessionId,
    evidenceRunId: runId,
    providerId: input.providerId,
    projectId: input.projectId,
    seq: 1,
    projectPath: input.projectPath,
  });
  await ingestEvent(runId, ptyStarted, input.dataRootOverride);

  void captureGitFingerprintBaseline(input.projectPath)
    .then((baseline) => {
      setGitBaseline(runId, baseline);
      const current = readMeta(runId, input.dataRootOverride);
      if (current) {
        writeMeta(
          runId,
          {
            ...current,
            gitBaselineCapturedAt: baseline.capturedAt,
          },
          input.dataRootOverride,
        );
      }
    })
    .catch(() => undefined);

  return meta;
}

export function onInspectorEvents(
  sessionId: string,
  events: InspectorEvent[],
  dataRootOverride?: string,
): Promise<void> {
  // Serialize per-session ingestion so concurrent hook batches never allocate
  // duplicate seq values from the same lastSeq snapshot.
  const previous = sessionChains.get(sessionId) ?? Promise.resolve();
  const next = previous
    .then(() => ingestInspectorEvents(sessionId, events, dataRootOverride))
    .catch((err) => {
      console.error(`[calder-evidence] inspector ingest failed for ${sessionId}:`, err);
    });
  sessionChains.set(sessionId, next);
  return next;
}

async function ingestInspectorEvents(
  sessionId: string,
  events: InspectorEvent[],
  dataRootOverride?: string,
): Promise<void> {
  const runId = sessionToRun.get(sessionId);
  if (!runId) return;

  const meta = readMeta(runId, dataRootOverride);
  if (!meta) return;

  let seq = meta.lastSeq;
  const ingested: EvidenceEvent[] = [];
  for (const event of events) {
    seq += 1;
    const normalized = normalizeInspectorEvent({
      sessionId,
      evidenceRunId: runId,
      providerId: String(meta.providerId),
      projectId: meta.projectId,
      event,
      seq,
    });
    if (!normalized) continue;
    await ingestEvent(runId, normalized, dataRootOverride);
    const nextCompletion = completionStateForEvent(normalized.type);
    if (nextCompletion) {
      const current = readMeta(runId, dataRootOverride);
      if (current) {
        writeMeta(runId, { ...current, completionState: nextCompletion }, dataRootOverride);
      }
    }
    ingested.push(normalized);
  }
  notifyEvidenceEvents(runId, ingested);
}

export async function onPtyExit(
  sessionId: string,
  exitCode?: number,
  signal?: number | string,
  dataRootOverride?: string,
): Promise<void> {
  const runId = sessionToRun.get(sessionId);
  if (!runId) return;

  const meta = readMeta(runId, dataRootOverride);
  if (!meta) return;

  const seq = meta.lastSeq + 1;
  const ptyExited = createPtyExitedEvent(
    {
      sessionId,
      evidenceRunId: runId,
      providerId: String(meta.providerId),
      projectId: meta.projectId,
      seq,
    },
    exitCode,
    signal,
  );
  await ingestEvent(runId, ptyExited, dataRootOverride);
  notifyEvidenceEvents(runId, [ptyExited]);

  const providerEnded = meta.completionState === 'completed' || meta.completionState === 'failed';
  beginClosing(runId, {
    dataRootOverride,
    completionState: providerEnded ? meta.completionState : 'unknown',
  });

  sessionToRun.delete(sessionId);
  sessionChains.delete(sessionId);
}

export function onCrashRecover(dataRootOverride?: string): string[] {
  const recovered = recoverOpenRuns(dataRootOverride);
  sessionToRun.clear();
  sessionChains.clear();
  return recovered;
}

export function getActiveRunId(sessionId: string): string | undefined {
  return sessionToRun.get(sessionId);
}

export function getEvidenceSettings(dataRootOverride?: string): EvidenceSettings {
  return loadSettings(dataRootOverride);
}

export function setEvidenceSettings(
  next: EvidenceSettings,
  dataRootOverride?: string,
): EvidenceSettings {
  return persistSettings(next, dataRootOverride);
}

export function __resetCoordinatorForTests(): void {
  sessionToRun.clear();
  sessionChains.clear();
  settings = { ...DEFAULT_EVIDENCE_SETTINGS };
  settingsLoaded = false;
  evidenceEventNotifier = null;
}

export function __bindSessionRunForTests(sessionId: string, runId: string): void {
  sessionToRun.set(sessionId, runId);
}
