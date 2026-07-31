import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import {
  extractSafeActivityContext,
  formatPixelActivityLine,
} from './activity-label.js';

function event(extras: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: 'e1',
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId: 'claude',
    projectId: 'p1',
    type: 'tool_started',
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
    ...extras,
  };
}

describe('pixel activity label', () => {
  it('extracts host and basename only', () => {
    expect(
      extractSafeActivityContext(
        event({ sanitizedMeta: { url: 'https://docs.example.com/path?q=1' } }),
      ),
    ).toBe('docs.example.com');
    expect(
      extractSafeActivityContext(
        event({ sanitizedMeta: { file_path: '/Users/me/secret/project/src/app.ts' } }),
      ),
    ).toBe('app.ts');
    expect(
      extractSafeActivityContext(event({ toolName: 'mcp__github__search_repositories' })),
    ).toBe('github');
  });

  it('formats activity line from latest tool', () => {
    const line = formatPixelActivityLine([
      event({
        toolName: 'WebSearch',
        sanitizedMeta: { url: 'https://react.dev/learn' },
      }),
    ]);
    expect(line.state).toBe('researching_web');
    expect(line.toolName).toBe('WebSearch');
    expect(line.context).toBe('react.dev');
  });
});
