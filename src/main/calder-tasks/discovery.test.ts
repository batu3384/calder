import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverProjectBackgroundTasks } from './discovery.js';

const roots: string[] = [];

function makeProject(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
  }
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('discoverProjectBackgroundTasks', () => {
  it('discovers queued task documents and computes status counts', async () => {
    const root = makeProject('background-task-discovery');
    writeFiles(root, {
      '.calder/tasks/review-ui.json': JSON.stringify({
        schemaVersion: 1,
        title: 'Review UI',
        status: 'queued',
        prompt: 'Review the preferences modal.',
        createdAt: '2026-04-13T20:00:00.000Z',
        updatedAt: '2026-04-13T20:00:00.000Z',
        artifacts: ['dist/report.md'],
        handoff: 'Focus on regressions.',
      }, null, 2),
      '.calder/tasks/fix-auth.json': JSON.stringify({
        schemaVersion: 1,
        title: 'Fix auth',
        status: 'running',
        prompt: 'Fix the auth redirect.',
        createdAt: '2026-04-13T20:05:00.000Z',
        updatedAt: '2026-04-13T20:06:00.000Z',
      }, null, 2),
    });

    const result = await discoverProjectBackgroundTasks(root);

    expect(result.tasks).toHaveLength(2);
    expect(result.queuedCount).toBe(1);
    expect(result.runningCount).toBe(1);
    expect(result.completedCount).toBe(0);
    expect(result.tasks[0]).toEqual(expect.objectContaining({
      title: 'Fix auth',
      status: 'running',
    }));
    expect(result.tasks[1]).toEqual(expect.objectContaining({
      title: 'Review UI',
      artifactCount: 1,
      handoffSummary: 'Focus on regressions.',
    }));
  });
});
