import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EVIDENCE_SCHEMA_VERSION } from '../../shared/types-evidence.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import {
  __resetWriteQueuesForTests,
  appendEvent,
  createRun,
  readEvents,
  readMeta,
} from './store.js';

const roots: string[] = [];

afterEach(() => {
  __resetWriteQueuesForTests();
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('calder-evidence store', () => {
  it('creates runs and appends events with temp root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-store-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    const meta = createRun({
      runId: 'run-store-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      projectPath: '/tmp/project',
    });

    expect(meta.runId).toBe('run-store-1');
    expect(readMeta('run-store-1')?.state).toBe('open');

    await appendEvent('run-store-1', {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: 'event-1',
      evidenceRunId: 'run-store-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      type: 'pty_started',
      timestamp: Date.now(),
      seq: 1,
      source: 'calder_pty',
      confidence: 'verified',
    });

    const events = readEvents('run-store-1');
    expect(events).toHaveLength(1);
    expect(readMeta('run-store-1')?.eventCount).toBe(1);
  });

  it('writes evidence files with owner-only permissions', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-perms-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-perms-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      projectPath: '/tmp/project',
    });

    await appendEvent('run-perms-1', {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: 'event-p1',
      evidenceRunId: 'run-perms-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      type: 'pty_started',
      timestamp: Date.now(),
      seq: 1,
      source: 'calder_pty',
      confidence: 'verified',
    });

    const runDir = join(root, 'evidence', 'runs', 'run-perms-1');
    expect(statSync(runDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(runDir, 'meta.json')).mode & 0o777).toBe(0o600);
    expect(statSync(join(runDir, 'events.jsonl')).mode & 0o777).toBe(0o600);
  });

  it('drops oversized events with a visible warning instead of writing them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-oversize-'));
    roots.push(root);
    __setCalderDataRootForTests(root);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    createRun({
      runId: 'run-big-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      projectPath: '/tmp/project',
    });

    await appendEvent('run-big-1', {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: 'event-big',
      evidenceRunId: 'run-big-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      type: 'tool_started',
      timestamp: Date.now(),
      seq: 1,
      source: 'provider_hook',
      confidence: 'provider_reported',
      sanitizedMeta: { blob: 'x'.repeat(300 * 1024) },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('oversized event'));
    expect(readEvents('run-big-1')).toHaveLength(0);
    warn.mockRestore();
  });
});
