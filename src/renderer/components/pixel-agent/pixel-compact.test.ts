import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import { updatePixelCompactStrip } from './pixel-compact.js';

function event(type: EvidenceEvent['type']): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: 'e1',
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type,
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
  };
}

describe('pixel compact strip', () => {
  it('updates data-state when events change', () => {
    const label = { textContent: '' };
    const badge = { textContent: '', setAttribute: () => undefined };
    const provider = { textContent: '' };
    const strip = {
      dataset: {} as Record<string, string>,
      querySelector: (selector: string) => {
        if (selector === '.inspector-pixel-label') return label;
        if (selector === '.inspector-pixel-state') return badge;
        if (selector === '.inspector-pixel-provider') return provider;
        return null;
      },
    } as unknown as HTMLElement;

    updatePixelCompactStrip(strip, [event('permission_requested')]);
    expect(strip.dataset.state).toBe('waiting_for_approval');
    expect(strip.dataset.provider).toBe('claude');
    expect(strip.dataset.motion).toBe('idle');
    expect(provider.textContent).toBe('Claude');

    updatePixelCompactStrip(strip, [event('operation_blocked')]);
    expect(strip.dataset.state).toBe('blocked');

    updatePixelCompactStrip(strip, [
      { ...event('tool_started'), toolName: 'SemanticSearch', providerId: 'cursor' },
    ]);
    expect(strip.dataset.state).toBe('reading_project');
    expect(strip.dataset.provider).toBe('cursor');
    expect(strip.dataset.motion).toBe('active');
    expect(provider.textContent).toBe('Cursor');
  });
});
