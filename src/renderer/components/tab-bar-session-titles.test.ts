import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../../shared/types.js';
import { buildSessionTabTitle, buildSessionTooltip } from './tab-bar-session-titles.js';

function makeCliSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    name: 'Session 1',
    cliSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tab-bar-session-titles', () => {
  it('builds CLI tooltip with and without session id', () => {
    expect(buildSessionTooltip('idle', null)).toBe('Status: idle');
    expect(buildSessionTooltip('working', 'cli-123')).toBe('Status: working\nSession: cli-123');
  });

  it('builds CLI tab title from status tooltip', () => {
    const session = makeCliSession({ name: 'Chat', cliSessionId: 'cli-1' });
    expect(buildSessionTabTitle(session, 'working')).toBe('Status: working\nSession: cli-1\nDrag to reorder');
  });

  it('builds browser and remote titles', () => {
    const browser = makeCliSession({ type: 'browser-tab', browserTabUrl: 'https://example.com' });
    const remote = makeCliSession({ type: 'remote-terminal', remoteHostName: 'Host A' });
    expect(buildSessionTabTitle(browser, 'idle')).toBe('Browser: https://example.com\nDrag to reorder');
    expect(buildSessionTabTitle(remote, 'idle')).toBe('Remote: Host A\nDrag to reorder');
  });

  it('builds file and diff titles', () => {
    const fileReader = makeCliSession({ type: 'file-reader', fileReaderPath: '/tmp/file.ts' });
    const diff = makeCliSession({ type: 'diff-viewer', diffFilePath: '/tmp/diff.ts' });
    expect(buildSessionTabTitle(fileReader, 'idle')).toBe('File: /tmp/file.ts\nDrag to reorder');
    expect(buildSessionTabTitle(diff, 'idle')).toBe('Diff: /tmp/diff.ts\nDrag to reorder');
  });
});
