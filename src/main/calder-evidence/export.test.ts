import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportEvidenceRun } from './export.js';
import { __resetCalderDataRootForTests, __setCalderDataRootForTests } from './paths.js';
import { __resetWriteQueuesForTests, createRun, readEvents, readMeta } from './store.js';

vi.mock('./git-evidence.js', () => ({
  captureGitFingerprintBaseline: vi.fn(async () => ({
    capturedAt: new Date().toISOString(),
    isGitRepo: false,
    branch: null,
    headCommit: null,
    paths: [],
    truncated: false,
  })),
  compareGitFingerprints: vi.fn(() => ({
    observations: [],
    truncated: false,
    headMoved: false,
    branchChanged: false,
  })),
}));

const roots: string[] = [];

afterEach(() => {
  __resetWriteQueuesForTests();
  __resetCalderDataRootForTests();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('calder-evidence export', () => {
  it('writes json export and records export_created when run is writable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-export-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-export-1',
      calderSessionId: 'session-1',
      providerId: 'claude',
      projectId: 'project-1',
      projectPath: root,
    });

    const targetPath = join(root, 'out', 'evidence.json');
    await exportEvidenceRun('run-export-1', 'json', targetPath);

    const parsed = JSON.parse(readFileSync(targetPath, 'utf8'));
    expect(parsed.meta.runId).toBe('run-export-1');
    expect(readEvents('run-export-1').some((event) => event.type === 'export_created')).toBe(true);
  });

  it('rejects relative export paths', async () => {
    await expect(exportEvidenceRun('run-export-1', 'json', 'relative.json')).rejects.toThrow(
      'absolute',
    );
  });

  it('writes markdown without export_created on sealed runs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'calder-evidence-export-md-'));
    roots.push(root);
    __setCalderDataRootForTests(root);

    createRun({
      runId: 'run-export-2',
      calderSessionId: 'session-2',
      providerId: 'cursor',
      projectId: 'project-2',
      projectPath: root,
    });

    const meta = readMeta('run-export-2');
    if (meta) {
      const { writeMeta } = await import('./store.js');
      writeMeta('run-export-2', { ...meta, state: 'sealed', lastSeq: 1 });
    }

    const targetPath = join(root, 'evidence.md');
    await exportEvidenceRun('run-export-2', 'markdown', targetPath);
    const md = readFileSync(targetPath, 'utf8');
    expect(md).toContain('# Session Evidence Export');
    expect(readEvents('run-export-2')).toHaveLength(0);
  });
});
