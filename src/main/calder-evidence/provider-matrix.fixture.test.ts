import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetCoordinatorForTests,
  onInspectorEvents,
  onPtyExit,
  startEvidenceRun,
} from './coordinator.js';
import { __resetFinalizationForTests } from './finalization.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import { findRunIdByCalderSessionId } from './run-resolve.js';
import { __resetWriteQueuesForTests, readEvents, readMeta } from './store.js';

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
  const root = mkdtempSync(join(tmpdir(), 'calder-evidence-provider-'));
  roots.push(root);
  __setCalderDataRootForTests(root);
  return root;
}

const PROVIDER_MATRIX = [
  {
    providerId: 'claude',
    sessionId: 'session-claude-matrix',
    inspectorEvents: [
      { type: 'session_start' as const, timestamp: Date.now() },
      { type: 'session_end' as const, timestamp: Date.now() + 1 },
    ],
    expectedCompletion: 'completed' as const,
  },
  {
    providerId: 'codex',
    sessionId: 'session-codex-matrix',
    inspectorEvents: [{ type: 'session_start' as const, timestamp: Date.now() }],
    expectedCompletion: 'unknown' as const,
  },
  {
    providerId: 'antigravity',
    sessionId: 'session-antigravity-matrix',
    inspectorEvents: [{ type: 'session_start' as const, timestamp: Date.now() }],
    expectedCompletion: 'unknown' as const,
  },
  {
    providerId: 'cursor',
    sessionId: 'session-cursor-matrix',
    inspectorEvents: [],
    expectedCompletion: 'unknown' as const,
  },
];

describe('calder-evidence provider matrix', () => {
  it.each(PROVIDER_MATRIX)(
    '$providerId lifecycle completion is $expectedCompletion',
    async ({ providerId, sessionId, inspectorEvents, expectedCompletion }) => {
      setupRoot();
      const meta = await startEvidenceRun({
        sessionId,
        providerId,
        projectId: 'p1',
        projectPath: roots[roots.length - 1]!,
      });
      expect(meta).not.toBeNull();

      if (inspectorEvents.length > 0) {
        await onInspectorEvents(sessionId, inspectorEvents);
      }
      await onPtyExit(sessionId, 0);
      await vi.advanceTimersByTimeAsync(7000);
      await Promise.resolve();

      const finalMeta = readMeta(meta!.runId);
      expect(finalMeta?.completionState).toBe(expectedCompletion);
      expect(findRunIdByCalderSessionId(sessionId)).toBe(meta!.runId);
      expect(readEvents(meta!.runId).length).toBeGreaterThan(0);
    },
  );

  it('records operation_blocked as advisory evidence without rewriting governance', async () => {
    const root = setupRoot();
    const sessionId = 'session-blocked-matrix';
    await startEvidenceRun({
      sessionId,
      providerId: 'codex',
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
          effective_mode: 'ask',
          operation_class: 'shell',
          decision: 'block',
          reason: 'blocked by policy',
        },
      },
    ]);

    const runId = findRunIdByCalderSessionId(sessionId)!;
    const blocked = readEvents(runId).filter((event) => event.type === 'policy_decision');
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.policyDecision?.decision).toBe('block');
    expect(blocked[0]?.source).toBe('calder_governance');
  });

  it('ingests subagent and compaction hooks for pixel ecosystem activity', async () => {
    const root = setupRoot();
    const sessionId = 'session-ecosystem-activity';
    await startEvidenceRun({
      sessionId,
      providerId: 'claude',
      projectId: 'p1',
      projectPath: root,
    });

    await onInspectorEvents(sessionId, [
      {
        type: 'subagent_start',
        timestamp: Date.now(),
        hookEvent: 'SubagentStart',
        agent_id: 'a1',
        agent_type: 'explore',
      },
      {
        type: 'tool_use',
        timestamp: Date.now() + 1,
        hookEvent: 'PreToolUse',
        tool_name: 'WebSearch',
        tool_input: { url: 'https://docs.example.com' },
      },
      {
        type: 'pre_compact',
        timestamp: Date.now() + 2,
        hookEvent: 'PreCompact',
      },
    ]);

    const runId = findRunIdByCalderSessionId(sessionId)!;
    const events = readEvents(runId);
    expect(events.some((event) => event.type === 'subagent_started')).toBe(true);
    expect(
      events.some((event) => event.type === 'tool_started' && event.toolName === 'WebSearch'),
    ).toBe(true);
    expect(events.some((event) => event.type === 'context_compaction_started')).toBe(true);
  });
});
