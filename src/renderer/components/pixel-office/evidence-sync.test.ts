import { describe, expect, it, vi } from 'vitest';

import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEvent,
  type EvidenceRunMeta,
} from '../../../shared/types-evidence.js';
import { createOfficeCharacter } from './characters.js';
import { loadEvidenceTails } from './evidence-sync.js';
import { createDefaultLayout } from './layout.js';
import { OfficeRuntime } from './office-state.js';

function event(seq: number, timestamp: number): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: `event-${seq}`,
    evidenceRunId: 'run-1',
    calderSessionId: 's1',
    providerId: 'claude',
    projectId: 'p1',
    type: 'tool_started',
    timestamp,
    seq,
    source: 'provider_hook',
    confidence: 'provider_reported',
    toolName: 'Read',
  };
}

function meta(): EvidenceRunMeta {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    runId: 'run-1',
    calderSessionId: 's1',
    providerId: 'claude',
    projectId: 'p1',
    projectPath: '/tmp/project',
    state: 'open',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    completionState: 'unknown',
    summaryRevision: 0,
    eventCount: 1,
    lastSeq: 1,
  };
}

describe('Pixel Office evidence sync', () => {
  it('merges a delayed tail without dropping newer live evidence', async () => {
    const runtime = new OfficeRuntime(createDefaultLayout());
    runtime.characters.set(
      's1',
      createOfficeCharacter({
        id: 's1',
        sessionId: 's1',
        providerId: 'claude',
        seat: createDefaultLayout().seats[0]!,
        name: 'Claude 1',
      }),
    );
    let resolvePage!: (page: { runId: string; events: EvidenceEvent[]; total: number }) => void;
    const listEvents = vi.fn(
      () =>
        new Promise<{ runId: string; events: EvidenceEvent[]; total: number }>((resolve) => {
          resolvePage = resolve;
        }),
    );
    vi.stubGlobal('window', {
      calder: {
        evidence: {
          getMeta: vi.fn(async () => meta()),
          listEvents,
          subscribe: vi.fn(),
          unsubscribe: vi.fn(),
        },
      },
    });

    const load = loadEvidenceTails({
      runtime,
      isCurrent: () => true,
      onApplied: vi.fn(),
    });
    await vi.waitFor(() => expect(listEvents).toHaveBeenCalled());
    runtime.applyEvidence('s1', [event(2, 2_000)], 'run-1');
    resolvePage({ runId: 'run-1', events: [event(1, 1_000)], total: 1 });
    await load;

    expect(runtime.latestEvidenceTimestamp('s1')).toBe(2_000);
  });
});
