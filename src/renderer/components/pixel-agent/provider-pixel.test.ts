import { describe, expect, it } from 'vitest';

import type { EvidenceEvent } from '../../../shared/types-evidence.js';
import { EVIDENCE_SCHEMA_VERSION } from '../../../shared/types-evidence.js';
import {
  isPixelMotionActive,
  mapToolNameToPixelState,
  pixelProviderLabel,
  resolvePixelProviderId,
} from './provider-pixel.js';

function event(providerId: string): EvidenceEvent {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: 'e1',
    evidenceRunId: 'run-1',
    calderSessionId: 'session-1',
    providerId,
    projectId: 'p1',
    type: 'tool_started',
    timestamp: Date.now(),
    seq: 1,
    source: 'provider_hook',
    confidence: 'provider_reported',
  };
}

describe('provider pixel identity', () => {
  it('maps tools from multiple CLI naming styles', () => {
    expect(mapToolNameToPixelState('StrReplace')).toBe('editing_code');
    expect(mapToolNameToPixelState('apply_patch')).toBe('editing_code');
    expect(mapToolNameToPixelState('ApplyPatch')).toBe('editing_code');
    expect(mapToolNameToPixelState('shell')).toBe('running_command');
    expect(mapToolNameToPixelState('run_terminal_cmd')).toBe('running_command');
    expect(mapToolNameToPixelState('SemanticSearch')).toBe('searching_code');
    expect(mapToolNameToPixelState('Read')).toBe('reading_files');
    expect(mapToolNameToPixelState('view_image')).toBe('reading_files');
    expect(mapToolNameToPixelState('WebSearch')).toBe('researching_web');
    expect(mapToolNameToPixelState('browser_navigate')).toBe('browsing');
    expect(mapToolNameToPixelState('mcp__memory__create_entities')).toBe('using_mcp');
    expect(
      mapToolNameToPixelState('WebFetch', { url: 'https://example.com/docs' }),
    ).toBe('researching_web');
    expect(mapToolNameToPixelState('Bash', { command: 'curl https://example.com' })).toBe(
      'running_command',
    );
    expect(mapToolNameToPixelState('mystery_tool')).toBe('unknown_working');
  });

  it('resolves provider from latest known event', () => {
    expect(resolvePixelProviderId([event('codex')])).toBe('codex');
    expect(resolvePixelProviderId([event('claude'), event('cursor')])).toBe('cursor');
    expect(resolvePixelProviderId([], 'antigravity')).toBe('antigravity');
    expect(pixelProviderLabel('codex')).toBe('Codex');
  });

  it('marks only active work as motion-active', () => {
    expect(isPixelMotionActive('running_tests')).toBe(true);
    expect(isPixelMotionActive('waiting_for_approval')).toBe(false);
    expect(isPixelMotionActive('idle')).toBe(false);
    expect(isPixelMotionActive('completed')).toBe(false);
  });
});
