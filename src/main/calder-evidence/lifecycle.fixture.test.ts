import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EVIDENCE_SCHEMA_VERSION } from '../../shared/types-evidence.js';
import type { InspectorEvent } from '../../shared/types-session.js';
import {
  __bindSessionRunForTests,
  __resetCoordinatorForTests,
  onCrashRecover,
  onInspectorEvents,
  onPtyExit,
  setEvidenceEventNotifier,
  startEvidenceRun,
} from './coordinator.js';
import { __resetFinalizationForTests, ingestEvent } from './finalization.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import { findRunIdByCalderSessionId } from './run-resolve.js';
import { __resetWriteQueuesForTests, createRun, readEvents, readMeta } from './store.js';

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
  __resetCoordinatorForTests();
  __resetWriteQueuesForTests();
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function setupRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'calder-evidence-lifecycle-'));
  roots.push(root);
  __setCalderDataRootForTests(root);
  return root;
}

describe('calder-evidence lifecycle fixtures', () => {
  it('claude-like full lifecycle ends completed', async () => {
    const root = setupRoot();
    const sessionId = 'session-claude';

    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    expect(meta?.completionState).toBe('unknown');

    const events: InspectorEvent[] = [
      { type: 'session_start', timestamp: Date.now() },
      { type: 'session_end', timestamp: Date.now() + 1 },
    ];
    await onInspectorEvents(sessionId, events);
    await onPtyExit(sessionId, 0);

    await vi.advanceTimersByTimeAsync(7000);
    await Promise.resolve();

    const finalMeta = readMeta(meta!.runId);
    expect(finalMeta?.completionState).toBe('completed');
    expect(finalMeta?.state).toBe('sealed');
  });

  it('provider stop marks the run completed before PTY closes', async () => {
    const root = setupRoot();
    const sessionId = 'session-stop';
    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await onInspectorEvents(sessionId, [{ type: 'stop', timestamp: Date.now() }]);
    await onPtyExit(sessionId, 0);
    await vi.advanceTimersByTimeAsync(7000);
    await Promise.resolve();

    expect(readMeta(meta!.runId)?.completionState).toBe('completed');
  });

  it('cursor-like pty exit only stays unknown (not interrupted)', async () => {
    const root = setupRoot();
    const sessionId = 'session-cursor';

    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'cursor',
      projectId: 'p1',
      projectPath: root,
    });

    await onPtyExit(sessionId, 0);
    await vi.advanceTimersByTimeAsync(7000);
    await Promise.resolve();

    const finalMeta = readMeta(meta!.runId);
    expect(finalMeta?.completionState).toBe('unknown');
    expect(finalMeta?.completionState).not.toBe('interrupted');
  });

  it('serializes PTY exit with inspector events per session', async () => {
    const root = setupRoot();
    const sessionId = 'session-queue';
    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await Promise.all([
      onInspectorEvents(sessionId, [{ type: 'session_start', timestamp: Date.now() }]),
      onPtyExit(sessionId, 0),
    ]);

    const seqs = readEvents(meta!.runId).map((event) => event.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('serializes PTY start with the first inspector event', async () => {
    const root = setupRoot();
    const sessionId = 'session-start-race';

    const [meta] = await Promise.all([
      startEvidenceRun({
        sessionId,
        providerId: 'claude',
        projectId: 'p1',
        projectPath: root,
      }),
      onInspectorEvents(sessionId, [{ type: 'session_start', timestamp: Date.now() }]),
    ]);

    const seqs = readEvents(meta!.runId).map((event) => event.seq);
    expect(seqs).toEqual([1, 2]);
  });

  it('allows a new prompt to reset a provider completion intent', async () => {
    const root = setupRoot();
    const sessionId = 'session-resume';
    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await onInspectorEvents(sessionId, [{ type: 'stop', timestamp: Date.now() }]);
    expect(readMeta(meta!.runId)?.completionState).toBe('completed');

    await onInspectorEvents(sessionId, [{ type: 'user_prompt', timestamp: Date.now() + 1 }]);
    expect(readMeta(meta!.runId)?.completionState).toBe('unknown');
  });

  it('does not route queued events into a replacement run', async () => {
    const root = setupRoot();
    createRun({
      runId: 'run-old',
      calderSessionId: 'session-replaced',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    createRun({
      runId: 'run-new',
      calderSessionId: 'session-replaced',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    __bindSessionRunForTests('session-replaced', 'run-old');

    const queued = onInspectorEvents('session-replaced', [
      { type: 'session_start', timestamp: Date.now() },
    ]);
    __bindSessionRunForTests('session-replaced', 'run-new');
    await queued;

    expect(readEvents('run-old')).toHaveLength(0);
    expect(readEvents('run-new')).toHaveLength(0);
  });

  it('crash recovery marks interrupted', () => {
    const root = setupRoot();
    createRun({
      runId: 'run-crash',
      calderSessionId: 'session-crash',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    const recovered = onCrashRecover();
    expect(recovered).toContain('run-crash');
    expect(readMeta('run-crash')?.completionState).toBe('interrupted');
  });

  it('late event inside window accepted; after seal becomes orphan', async () => {
    const root = setupRoot();
    createRun({
      runId: 'run-late',
      calderSessionId: 'session-late',
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    __bindSessionRunForTests('session-late', 'run-late');

    await onPtyExit('session-late', 0);
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();

    const lateEvent = {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: 'late-1',
      evidenceRunId: 'run-late',
      calderSessionId: 'session-late',
      providerId: 'claude',
      projectId: 'p1',
      type: 'cost_snapshot' as const,
      timestamp: Date.now(),
      seq: 99,
      source: 'provider_hook' as const,
      confidence: 'provider_reported' as const,
    };

    const accepted = await ingestEvent('run-late', lateEvent);
    expect(accepted.accepted).toBe(true);

    await vi.advanceTimersByTimeAsync(6000);
    await Promise.resolve();

    const orphan = await ingestEvent('run-late', {
      ...lateEvent,
      eventId: 'late-2',
      seq: 100,
    });
    expect(orphan.orphan).toBe(true);
    expect(readMeta('run-late')?.state).toBe('sealed');
  });

  it('does not notify live subscribers for rejected PTY exits', async () => {
    const root = setupRoot();
    const sessionId = 'session-rejected-pty';
    const meta = await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });
    const notifier = vi.fn();
    setEvidenceEventNotifier(notifier);

    await onPtyExit(sessionId, 0);
    await vi.advanceTimersByTimeAsync(7000);
    await Promise.resolve();
    notifier.mockClear();
    __bindSessionRunForTests(sessionId, meta!.runId);

    await onPtyExit(sessionId, 0);

    expect(notifier).not.toHaveBeenCalled();
  });

  it('policy_decision recorded with allow — Evidence does not re-decide', async () => {
    const root = setupRoot();
    const sessionId = 'session-policy';

    await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await onInspectorEvents(sessionId, [
      {
        type: 'approval_decision',
        timestamp: Date.now(),
        tool_name: 'Bash',
        auto_approval: {
          policy_source: 'project',
          effective_mode: 'auto',
          operation_class: 'shell',
          decision: 'allow',
          reason: 'trusted project',
        },
      },
    ]);

    const runId = findRunIdByCalderSessionId(sessionId)!;
    const policyEvents = readEvents(runId).filter((event) => event.type === 'policy_decision');
    expect(policyEvents).toHaveLength(1);
    expect(policyEvents[0].policyDecision?.decision).toBe('allow');
    expect(policyEvents[0].source).toBe('calder_governance');
  });

  it('derives permission approval so waiting work can resume', async () => {
    const root = setupRoot();
    const sessionId = 'session-approval-clear';

    await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await onInspectorEvents(sessionId, [
      {
        type: 'permission_request',
        timestamp: Date.now(),
        tool_name: 'Bash',
      },
      {
        type: 'approval_decision',
        timestamp: Date.now() + 1,
        tool_name: 'Bash',
        auto_approval: {
          policy_source: 'project',
          effective_mode: 'auto',
          operation_class: 'shell',
          decision: 'allow',
          reason: 'trusted project',
        },
      },
    ]);

    const runId = findRunIdByCalderSessionId(sessionId)!;
    expect(readEvents(runId).map((event) => event.type)).toContain('permission_approved');
  });
});
