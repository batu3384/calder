import { describe, expect, it } from 'vitest';
import type { InspectorEvent } from '../shared/types';
import {
  _extractPlaywrightNavigateCwdForTesting,
  _extractPlaywrightNavigateUrlForTesting,
  _shouldMirrorPlaywrightNavigateForTesting,
} from './ipc-handlers';

function baseEvent(overrides: Partial<InspectorEvent> = {}): InspectorEvent {
  return {
    type: 'tool_use',
    timestamp: 1,
    hookEvent: 'PostToolUse',
    tool_name: 'mcp__plugin_playwright_playwright__browser_navigate',
    tool_input: { url: 'http://localhost:3000' },
    cwd: '/repo',
    ...overrides,
  };
}

describe('playwright navigate mirroring helpers', () => {
  it('extracts normalized http(s) urls from tool input', () => {
    expect(_extractPlaywrightNavigateUrlForTesting({ url: ' http://localhost:3000/admin ' }))
      .toBe('http://localhost:3000/admin');
    expect(_extractPlaywrightNavigateUrlForTesting({ url: 'https://example.com/path?a=1' }))
      .toBe('https://example.com/path?a=1');
  });

  it('rejects non-http protocols and missing values', () => {
    expect(_extractPlaywrightNavigateUrlForTesting({ url: 'file:///etc/passwd' })).toBeNull();
    expect(_extractPlaywrightNavigateUrlForTesting({ url: 'javascript:alert(1)' })).toBeNull();
    expect(_extractPlaywrightNavigateUrlForTesting({})).toBeNull();
    expect(_extractPlaywrightNavigateUrlForTesting(undefined)).toBeNull();
  });

  it('extracts cwd only when present and non-empty', () => {
    expect(_extractPlaywrightNavigateCwdForTesting('/repo/app')).toBe('/repo/app');
    expect(_extractPlaywrightNavigateCwdForTesting('  /repo/app  ')).toBe('/repo/app');
    expect(_extractPlaywrightNavigateCwdForTesting('')).toBeNull();
    expect(_extractPlaywrightNavigateCwdForTesting(undefined)).toBeNull();
  });

  it('mirrors only qualifying playwright navigate tool_use events', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', baseEvent(), state, 1_000))
      .toEqual({ url: 'http://localhost:3000/', cwd: '/repo' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ type: 'pre_tool_use' }),
      state,
      2_000,
    )).toBeNull();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'mcp__plugin_playwright_playwright__browser_snapshot' }),
      state,
      2_000,
    )).toBeNull();
  });

  it('accepts alternate playwright navigate tool names', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'mcp__playwright__browser_navigate' }),
      state,
      1_000,
    )).toEqual({ url: 'http://localhost:3000/', cwd: '/repo' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'mcp__computer-use__browser_navigate' }),
      state,
      2_000,
    )).toBeNull();
  });

  it('throttles duplicate url mirrors in cooldown window', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    const event = baseEvent({ tool_input: { url: 'http://localhost:3000/dashboard' } });
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 1_000))
      .toEqual({ url: 'http://localhost:3000/dashboard', cwd: '/repo' });
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 2_000)).toBeNull();
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 2_700))
      .toEqual({ url: 'http://localhost:3000/dashboard', cwd: '/repo' });
  });

  it('allows different urls without waiting for cooldown', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_input: { url: 'http://localhost:3000/one' } }),
      state,
      1_000,
    )).toEqual({ url: 'http://localhost:3000/one', cwd: '/repo' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_input: { url: 'http://localhost:3000/two' } }),
      state,
      1_100,
    )).toEqual({ url: 'http://localhost:3000/two', cwd: '/repo' });
  });

  it('does not mirror events that are missing cwd', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ cwd: undefined }),
      state,
      1_000,
    )).toBeNull();
  });
});
