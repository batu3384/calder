import { describe, expect, it } from 'vitest';

import { normalizeEvidenceSubscribeRunIds } from './subscribe-ids.js';

describe('evidence subscribe runIds', () => {
  it('accepts a single runId string', () => {
    expect(normalizeEvidenceSubscribeRunIds('run-a')).toEqual(['run-a']);
  });

  it('accepts many runIds and drops empties', () => {
    expect(normalizeEvidenceSubscribeRunIds(['run-a', '', 'run-b', '  '])).toEqual([
      'run-a',
      'run-b',
    ]);
  });

  it('returns empty for empty payload', () => {
    expect(normalizeEvidenceSubscribeRunIds([])).toEqual([]);
    expect(normalizeEvidenceSubscribeRunIds('')).toEqual([]);
  });
});
