import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVIDENCE_SCHEMA_VERSION } from '../../shared/types-evidence.js';
import { __resetFinalizationForTests, beginClosing, ingestEvent } from './finalization.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import { __resetWriteQueuesForTests, createRun, readMeta } from './store.js';

vi.mock('./git-evidence.js', () => ({
  captureGitFingerprintBaseline: vi.fn(async () => ({
    capturedAt: new Date().toISOString(),
    isGitRepo: false,
    branch: null,
    headCommit: null,
    paths: [],
    truncated: false,
  })),
  compareGitFingerprints: vi.fn(() => ({
    observations: [],
    truncated: false,
    headMoved: false,
    branchChanged: false,
  })),
}));

const roots: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  __resetFinalizationForTests();
  __resetWriteQueuesForTests();
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('calder-evidence finalization', () => {
  it('accepts late events before sealing and rejects after seal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-finalize-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-final-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      projectPath: root,
    });

    beginClosing('run-final-1');
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    await Promise.resolve();

    const finalized = readMeta('run-final-1');
    expect(finalized?.state).toBe('finalized');

    const lateEvent = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: 'late-1',
      evidenceRunId: 'run-final-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      type: 'cost_snapshot' as const,
      timestamp: Date.now(),
      seq: 2,
      source: 'provider_hook' as const,
      confidence: 'provider_reported' as const,
    };

    const lateResult = await ingestEvent('run-final-1', lateEvent);
    expect(lateResult.accepted).toBe(true);

    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();

    const sealed = readMeta('run-final-1');
    expect(sealed?.state).toBe('sealed');

    const orphanResult = await ingestEvent('run-final-1', {
      ...lateEvent,
      eventId: 'late-2',
      seq: 3,
    });
    expect(orphanResult).toEqual({
      accepted: false,
      orphan: true,
      reason: 'sealed',
    });
  });
});
