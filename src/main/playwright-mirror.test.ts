import { describe, expect, it } from 'vitest';
import type { InspectorEvent } from '../shared/types';
import {
  _extractPlaywrightNavigateCwdForTesting,
  _extractPlaywrightNavigateUrlsFromTerminalChunkForTesting,
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

  it('parses navigate URLs from human-readable terminal tool logs', () => {
    const chunk = [
      '⏺ plugin:playwright:playwright - Navigate to a URL',
      '(MCP)(url: "http://localhost:3000/admin/dashboard")',
    ].join('\n');
    expect(_extractPlaywrightNavigateUrlsFromTerminalChunkForTesting(chunk))
      .toEqual(['http://localhost:3000/admin/dashboard']);
  });

  it('does not parse wait/screenshot terminal tool logs as navigate URLs', () => {
    const chunk = [
      '⏺ plugin:playwright:playwright - Wait for',
      '(MCP)(time: 5)',
      '⏺ plugin:playwright:playwright - Take a screenshot',
      '(MCP)(filename: "dashboard-final.png", type: "png")',
    ].join('\n');
    expect(_extractPlaywrightNavigateUrlsFromTerminalChunkForTesting(chunk)).toEqual([]);
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
      .toEqual({ url: 'http://localhost:3000/', cwd: '/repo', sessionId: 's1' });
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
    )).toEqual({ url: 'http://localhost:3000/', cwd: '/repo', sessionId: 's1' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'mcp__computer-use__browser_navigate' }),
      state,
      2_000,
    )).toBeNull();
  });

  it('accepts human-readable playwright navigate tool names', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'plugin:playwright:playwright - Navigate to a URL' }),
      state,
      1_000,
    )).toEqual({ url: 'http://localhost:3000/', cwd: '/repo', sessionId: 's1' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_name: 'plugin:playwright:playwright - Wait for' }),
      state,
      2_000,
    )).toBeNull();
  });

  it('throttles duplicate url mirrors in cooldown window', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    const event = baseEvent({ tool_input: { url: 'http://localhost:3000/dashboard' } });
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 1_000))
      .toEqual({ url: 'http://localhost:3000/dashboard', cwd: '/repo', sessionId: 's1' });
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 2_000)).toBeNull();
    expect(_shouldMirrorPlaywrightNavigateForTesting('s1', event, state, 2_700))
      .toEqual({ url: 'http://localhost:3000/dashboard', cwd: '/repo', sessionId: 's1' });
  });

  it('allows different urls without waiting for cooldown', () => {
    const state = new Map<string, { lastUrl: string; lastMirroredAtMs: number }>();
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_input: { url: 'http://localhost:3000/one' } }),
      state,
      1_000,
    )).toEqual({ url: 'http://localhost:3000/one', cwd: '/repo', sessionId: 's1' });
    expect(_shouldMirrorPlaywrightNavigateForTesting(
      's1',
      baseEvent({ tool_input: { url: 'http://localhost:3000/two' } }),
      state,
      1_100,
    )).toEqual({ url: 'http://localhost:3000/two', cwd: '/repo', sessionId: 's1' });
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
