import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

import { readProjectBackgroundTaskFile } from './read';

describe('readProjectBackgroundTaskFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('reads and normalizes valid task documents', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        title: 'Ship v1',
        status: 'running',
        prompt: 'prepare release',
        createdAt: '2026-04-14T08:00:00.000Z',
        updatedAt: '2026-04-14T08:30:00.000Z',
        artifacts: ['dist/app.zip', '', null, 'release-notes.md'],
        handoff: 'handoff summary',
      }),
    );

    const doc = await readProjectBackgroundTaskFile('/repo', './.calder\\tasks\\release.json');

    expect(mockReadFile).toHaveBeenCalledWith('/repo/.calder/tasks/release.json', 'utf8');
    expect(doc).toEqual({
      path: '/repo/.calder/tasks/release.json',
      relativePath: '.calder/tasks/release.json',
      title: 'Ship v1',
      status: 'running',
      prompt: 'prepare release',
      createdAt: '2026-04-14T08:00:00.000Z',
      updatedAt: '2026-04-14T08:30:00.000Z',
      artifacts: ['dist/app.zip', 'release-notes.md'],
      handoff: 'handoff summary',
    });
  });

  it('applies safe fallbacks for invalid values', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T09:45:12.000Z'));
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        title: 123,
        status: 'unexpected-value',
        prompt: null,
        createdAt: 42,
        updatedAt: undefined,
        artifacts: 'not-an-array',
        handoff: false,
      }),
    );

    const doc = await readProjectBackgroundTaskFile('/repo', '.calder/tasks/nightly-build.json');

    expect(doc.title).toBe('nightly-build');
    expect(doc.status).toBe('queued');
    expect(doc.prompt).toBe('');
    expect(doc.createdAt).toBe('2026-04-14T09:45:12.000Z');
    expect(doc.updatedAt).toBe('2026-04-14T09:45:12.000Z');
    expect(doc.artifacts).toEqual([]);
    expect(doc.handoff).toBe('');
  });

  it('rejects task paths outside .calder/tasks boundaries', async () => {
    await expect(readProjectBackgroundTaskFile('/repo', '../outside.json')).rejects.toThrow(
      'Task path must stay within .calder/tasks',
    );
    await expect(readProjectBackgroundTaskFile('/repo', '.calder/tasks/../../outside.json')).rejects.toThrow(
      'Task path must stay within .calder/tasks',
    );
    await expect(readProjectBackgroundTaskFile('/repo', '.calder/tasks/release.txt')).rejects.toThrow(
      'Task path must stay within .calder/tasks',
    );
    await expect(readProjectBackgroundTaskFile('/repo', '.calder/reviews/item.json')).rejects.toThrow(
      'Task path must stay within .calder/tasks',
    );
  });

  it('allows all supported status values', async () => {
    for (const status of ['running', 'blocked', 'completed', 'cancelled'] as const) {
      mockReadFile.mockResolvedValueOnce(JSON.stringify({ status }));
      const doc = await readProjectBackgroundTaskFile('/repo', `.calder/tasks/${status}.json`);
      expect(doc.status).toBe(status);
    }
  });
});
