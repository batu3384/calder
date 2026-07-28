import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  EvidenceEvent,
  EvidenceReview,
  EvidenceRunMeta,
  EvidenceSummary,
} from '../../shared/types-evidence.js';
import {
  EVIDENCE_SCHEMA_VERSION,
  EvidenceEventSchema,
  EvidenceReviewSchema,
  EvidenceRunMetaSchema,
  EvidenceSummarySchema,
} from '../../shared/types-evidence.js';
import { resolveEvidenceRoot, resolveEvidenceRunDirectory } from './paths.js';

const META_FILE = 'meta.json';
const EVENTS_FILE = 'events.jsonl';
const SUMMARY_FILE = 'summary.json';
const REVIEW_FILE = 'review.json';
const MAX_EVENT_LINE_BYTES = 256 * 1024;

const writeQueues = new Map<string, Promise<void>>();

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      fs.writeFileSync(filePath, JSON.stringify(value, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      return;
    }
    throw err;
  }
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // best-effort on filesystems without chmod semantics
  }
}

function readJsonFile<T>(filePath: string, schema: { parse: (value: unknown) => T }): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

function enqueueWrite(runId: string, fn: () => void | Promise<void>): Promise<void> {
  const previous = writeQueues.get(runId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      await fn();
    })
    .catch((err) => {
      console.error(`[calder-evidence] write failed for run ${runId}:`, err);
    });
  writeQueues.set(runId, next);
  return next;
}

export interface CreateRunInput {
  runId: string;
  calderSessionId: string;
  providerId: string;
  projectId: string;
  projectPath: string;
}

export function createRun(input: CreateRunInput, dataRootOverride?: string): EvidenceRunMeta {
  const runDir = resolveEvidenceRunDirectory(input.runId, dataRootOverride);
  ensureDir(runDir);

  const now = new Date().toISOString();
  const meta: EvidenceRunMeta = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    runId: input.runId,
    calderSessionId: input.calderSessionId,
    providerId: input.providerId,
    projectId: input.projectId,
    projectPath: input.projectPath,
    state: 'open',
    createdAt: now,
    updatedAt: now,
    completionState: 'unknown',
    summaryRevision: 0,
    eventCount: 0,
    lastSeq: 0,
  };

  writeMeta(input.runId, meta, dataRootOverride);
  return meta;
}

export function readMeta(runId: string, dataRootOverride?: string): EvidenceRunMeta | null {
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), META_FILE);
  return readJsonFile(filePath, EvidenceRunMetaSchema);
}

export function writeMeta(
  runId: string,
  meta: EvidenceRunMeta,
  dataRootOverride?: string,
): EvidenceRunMeta {
  const parsed = EvidenceRunMetaSchema.parse({
    ...meta,
    updatedAt: new Date().toISOString(),
  });
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), META_FILE);
  writeJsonAtomic(filePath, parsed);
  return parsed;
}

export async function appendEvent(
  runId: string,
  event: EvidenceEvent,
  dataRootOverride?: string,
): Promise<void> {
  const parsed = EvidenceEventSchema.parse(event);
  const line = `${JSON.stringify(parsed)}\n`;
  if (Buffer.byteLength(line, 'utf8') > MAX_EVENT_LINE_BYTES) {
    console.warn(
      `[calder-evidence] dropping oversized event (type=${parsed.type}, seq=${parsed.seq}, run=${runId})`,
    );
    return;
  }

  await enqueueWrite(runId, () => {
    const runDir = resolveEvidenceRunDirectory(runId, dataRootOverride);
    ensureDir(runDir);
    const eventsPath = path.join(runDir, EVENTS_FILE);
    const isNewFile = !fs.existsSync(eventsPath);
    fs.appendFileSync(eventsPath, line, { encoding: 'utf8', mode: 0o600 });
    if (isNewFile) {
      try {
        fs.chmodSync(eventsPath, 0o600);
      } catch {
        // best-effort on filesystems without chmod semantics
      }
    }

    const meta = readMeta(runId, dataRootOverride);
    if (meta) {
      writeMeta(
        runId,
        {
          ...meta,
          eventCount: meta.eventCount + 1,
          lastSeq: Math.max(meta.lastSeq, parsed.seq),
        },
        dataRootOverride,
      );
    }
  });
}

export function readEvents(
  runId: string,
  options: { offset?: number; limit?: number } = {},
  dataRootOverride?: string,
): EvidenceEvent[] {
  // ponytail: full-file read. Long sessions can grow events.jsonl large;
  // upgrade path = readline streaming with early exit at offset+limit.
  const eventsPath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), EVENTS_FILE);
  if (!fs.existsSync(eventsPath)) return [];

  const raw = fs.readFileSync(eventsPath, 'utf8');
  if (!raw) return [];

  let content = raw;
  if (!content.endsWith('\n')) {
    const lastNewline = content.lastIndexOf('\n');
    if (lastNewline === -1) {
      return [];
    }
    content = content.slice(0, lastNewline + 1);
  }

  const events: EvidenceEvent[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(EvidenceEventSchema.parse(JSON.parse(line)));
    } catch {
      continue;
    }
  }

  const offset = options.offset ?? 0;
  const limit = options.limit ?? events.length;
  return events.slice(offset, offset + limit);
}

export function writeSummary(
  runId: string,
  summary: EvidenceSummary,
  dataRootOverride?: string,
): EvidenceSummary {
  const parsed = EvidenceSummarySchema.parse(summary);
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), SUMMARY_FILE);
  writeJsonAtomic(filePath, parsed);
  return parsed;
}

export function readSummary(runId: string, dataRootOverride?: string): EvidenceSummary | null {
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), SUMMARY_FILE);
  return readJsonFile(filePath, EvidenceSummarySchema);
}

export function writeReview(
  runId: string,
  review: EvidenceReview,
  dataRootOverride?: string,
): EvidenceReview {
  const parsed = EvidenceReviewSchema.parse(review);
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), REVIEW_FILE);
  writeJsonAtomic(filePath, parsed);
  return parsed;
}

export function readReview(runId: string, dataRootOverride?: string): EvidenceReview | null {
  const filePath = path.join(resolveEvidenceRunDirectory(runId, dataRootOverride), REVIEW_FILE);
  return readJsonFile(filePath, EvidenceReviewSchema);
}

export function listRunIds(dataRootOverride?: string): string[] {
  const runsDir = path.join(resolveEvidenceRoot(dataRootOverride), 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function deleteRun(runId: string, dataRootOverride?: string): void {
  const runDir = resolveEvidenceRunDirectory(runId, dataRootOverride);
  if (fs.existsSync(runDir)) {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
  writeQueues.delete(runId);
}

export function deleteAllEvidence(dataRootOverride?: string): void {
  const evidenceRoot = resolveEvidenceRoot(dataRootOverride);
  if (fs.existsSync(evidenceRoot)) {
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  }
  writeQueues.clear();
}

function directorySizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(fullPath);
    } else if (entry.isFile()) {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

export function getStorageUsageBytes(dataRootOverride?: string): number {
  return directorySizeBytes(resolveEvidenceRoot(dataRootOverride));
}

export function recoverOpenRuns(dataRootOverride?: string): string[] {
  const recovered: string[] = [];
  for (const runId of listRunIds(dataRootOverride)) {
    const meta = readMeta(runId, dataRootOverride);
    if (!meta) continue;
    if (meta.state === 'open' || meta.state === 'closing') {
      writeMeta(
        runId,
        {
          ...meta,
          state: 'finalized',
          completionState: 'interrupted',
          completedAt: new Date().toISOString(),
        },
        dataRootOverride,
      );
      recovered.push(runId);
    }
  }
  return recovered;
}

export function __resetWriteQueuesForTests(): void {
  writeQueues.clear();
}
