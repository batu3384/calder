import { describe, expect, it, vi } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import {
  beginEvidenceViewGeneration,
  EVIDENCE_DOM_ROW_CAP,
  isEvidenceViewGenerationCurrent,
  isGitChangeEvent,
  matchesEvidenceFilter,
  matchesGitChangeQuery,
  mergeEvidenceEvents,
  readStoredChangesQuery,
  readStoredEvidenceFilter,
  sliceEventsForDom,
  writeStoredChangesQuery,
  writeStoredEvidenceFilter,
} from './evidence-view-support.js';

function event(type: EvidenceEvent['type'], extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: extras.eventId ?? `event-${type}`,
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('evidence view support', () => {
  it('detects git change events', () => {
    expect(isGitChangeEvent(event('git_change_observed'))).toBe(true);
    expect(isGitChangeEvent(event('tool_started'))).toBe(false);
  });

  it('filters by category and query', () => {
    const toolEvent = event('tool_started', { toolName: 'Bash', eventId: 'tool-1' });
    const policyEvent = event('policy_decision', {
      eventId: 'policy-1',
      policyDecision: {
        policySource: 'project',
        effectiveMode: 'ask',
        operationClass: 'shell',
        decision: 'block',
      },
    });

    expect(matchesEvidenceFilter(toolEvent, 'tools', '')).toBe(true);
    expect(matchesEvidenceFilter(policyEvent, 'tools', '')).toBe(false);
    expect(matchesEvidenceFilter(policyEvent, 'policy', 'block')).toBe(true);
    expect(matchesEvidenceFilter(toolEvent, 'all', 'bash')).toBe(true);
  });

  it('caps dom rows to the latest matches', () => {
    const events = Array.from({ length: EVIDENCE_DOM_ROW_CAP + 5 }, (_, index) =>
      event('tool_started', { eventId: `e-${index}`, seq: index + 1 }),
    );
    const sliced = sliceEventsForDom(events);
    expect(sliced.truncated).toBe(true);
    expect(sliced.events).toHaveLength(EVIDENCE_DOM_ROW_CAP);
    expect(sliced.hiddenCount).toBe(5);
    expect(sliced.events[0]?.eventId).toBe('e-5');
  });

  it('filters git changes by path query', () => {
    const gitEvent = event('git_change_observed', {
      eventId: 'git-1',
      sanitizedPaths: ['src/main/app.ts'],
    });
    const fileEvent = event('file_change_reported', {
      eventId: 'file-1',
      sanitizedPaths: ['README.md'],
    });

    expect(matchesGitChangeQuery(gitEvent, 'app.ts')).toBe(true);
    expect(matchesGitChangeQuery(fileEvent, 'readme')).toBe(true);
    expect(matchesGitChangeQuery(gitEvent, 'missing')).toBe(false);
    expect(matchesGitChangeQuery(event('tool_started'), 'app')).toBe(false);
  });

  it('persists changes search in sessionStorage', () => {
    const storage = new Map<string, string>();
    const sessionStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    writeStoredChangesQuery('session-1', 'src/app');
    expect(readStoredChangesQuery('session-1')).toBe('src/app');

    vi.unstubAllGlobals();
  });

  it('persists filter state in sessionStorage', () => {
    const storage = new Map<string, string>();
    const sessionStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    writeStoredEvidenceFilter('session-1', 'policy', 'block');
    expect(readStoredEvidenceFilter('session-1')).toEqual({
      category: 'policy',
      query: 'block',
    });

    vi.unstubAllGlobals();
  });

  it('dedupes evidence events by eventId on merge', () => {
    const a = event('tool_started', { eventId: 'a', seq: 1 });
    const b = event('tool_started', { eventId: 'b', seq: 2 });
    const merged = mergeEvidenceEvents([a], [a, b]);
    expect(merged.added).toBe(1);
    expect(merged.events.map((item) => item.eventId)).toEqual(['a', 'b']);
  });

  it('tracks evidence view generation for async races', () => {
    const first = beginEvidenceViewGeneration();
    expect(isEvidenceViewGenerationCurrent(first)).toBe(true);
    const second = beginEvidenceViewGeneration();
    expect(isEvidenceViewGenerationCurrent(first)).toBe(false);
    expect(isEvidenceViewGenerationCurrent(second)).toBe(true);
  });
});
