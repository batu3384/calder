import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectCheckpoints } from './discovery.js';

function makeProject(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverProjectCheckpoints', () => {
  it('discovers saved checkpoint json files under .calder/checkpoints', async () => {
    const root = makeProject('checkpoint-discovery');
    roots.push(root);
    writeFiles(root, {
      '.calder/checkpoints/2026-04-13T12-00-00-000Z-manual-checkpoint.json': JSON.stringify({
        schemaVersion: 1,
        id: 'cp-1',
        label: 'Manual checkpoint',
        createdAt: '2026-04-13T12:00:00.000Z',
        sessionCount: 2,
        changedFileCount: 3,
        sessions: [
          {
            id: 'cli-1',
            name: 'Main session',
            cliSessionId: 'cli-restore-1',
          },
          {
            id: 'browser-1',
            name: 'Local app',
            type: 'browser-tab',
            cliSessionId: null,
            browserTabUrl: 'http://localhost:3000',
          },
        ],
      }, null, 2),
    });

    const result = await discoverProjectCheckpoints(root);

    expect(result.checkpoints).toEqual([
      expect.objectContaining({
        displayName: '2026-04-13T12-00-00-000Z-manual-checkpoint.json',
        label: 'Manual checkpoint',
        sessionCount: 2,
        changedFileCount: 3,
        restoreSummary: 'Restores 1 CLI and 1 browser surface',
      }),
    ]);
  });

  it('returns an empty state when no checkpoints exist', async () => {
    const root = makeProject('checkpoint-empty');
    roots.push(root);

    const result = await discoverProjectCheckpoints(root);

    expect(result.checkpoints).toEqual([]);
    expect(result.lastUpdated).toBeUndefined();
  });

  it('ignores malformed and non-file entries and uses fallback restore summaries', async () => {
    const root = makeProject('checkpoint-fallbacks');
    roots.push(root);

    writeFiles(root, {
      '.calder/checkpoints/2026-04-13T12-10-00-000Z-fallback-count.json': JSON.stringify({
        schemaVersion: 1,
        id: 'cp-fallback-count',
        label: 'Fallback count',
        createdAt: '2026-04-13T12:10:00.000Z',
        sessionCount: 3,
        sessions: [{ type: 'unknown' }],
      }, null, 2),
      '.calder/checkpoints/2026-04-13T12-05-00-000Z-fallback-default.json': JSON.stringify({
        schemaVersion: 1,
        id: 'cp-fallback-default',
        label: 'Fallback default',
        createdAt: '2026-04-13T12:05:00.000Z',
        sessions: [],
      }, null, 2),
      '.calder/checkpoints/2026-04-13T12-00-00-000Z-broken.json': '{not-valid-json',
    });
    mkdirSync(join(root, '.calder', 'checkpoints', 'folder.json'), { recursive: true });

    const result = await discoverProjectCheckpoints(root);

    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints).toEqual([
      expect.objectContaining({
        id: 'cp-fallback-count',
        restoreSummary: 'Restores 3 sessions',
      }),
      expect.objectContaining({
        id: 'cp-fallback-default',
        restoreSummary: 'Restores saved session state',
      }),
    ]);
  });
});
